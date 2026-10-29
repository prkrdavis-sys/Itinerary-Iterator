"use client";

import { useEffect, useRef, useState } from "react";
import { spotEmoji } from "@/lib/categories";
import { boundsOf, pointAlong, sliceLine, type LngLat } from "@/lib/geo";
import { findStop, legKey, stopShownOnDay } from "@/lib/itinerary";
import {
  dayColor,
  followZoom,
  followZoomAt,
  iconRotation,
  legDuration,
  legStyle,
  modeStyle,
  playbackProgress,
} from "@/lib/modes";
import { ensureMapArchive, mapSaveMessage, type MapSaveStatus } from "@/lib/offline-archive";
import type { Itinerary } from "@/lib/schema";
import type { RouteSet } from "@/lib/routes";
import {
  createMap,
  lineFeature,
  mapboxStyleReachable,
  readCamera,
  registerRouteChevron,
  ROUTE_CHEVRON,
  type Basemap,
  type MapEngine,
  type MarkerHandle,
} from "./map-engine";

export type TripMapHandle = {
  showOverview: () => Promise<void>;
  playLeg: (index: number) => Promise<void>;
  focusStop: (id: string) => void;
  cancel: () => void;
};

type TripMapProps = {
  itinerary: Itinerary;
  routes: RouteSet;
  day: number | null;
  selectedId: string | null;
  playing: boolean;
  reducedMotion: boolean;
  routesRevealed: boolean;
  mapboxToken: string | null;
  onSelect: (id: string) => void;
  onMapClick: () => void;
  onReady: (handle: TripMapHandle | null) => void;
  onSaveStatus: (status: MapSaveStatus) => void;
};

const PADDING = { top: 156, bottom: 148, left: 40, right: 40 };
const SAVED_NOTICE_MS = 4000;
const OVERVIEW_DRAW_MS = 5200;
const OVERVIEW_LEG_FLOOR_MS = 40;

function legIsVisible(day: number | null, toDay: number | undefined): boolean {
  if (day === null) return true;
  return toDay === day;
}

function visibleCoordinates(
  itinerary: Itinerary,
  routes: RouteSet,
  day: number | null,
): LngLat[] {
  const coords: LngLat[] = [];
  for (const stop of itinerary.stops) {
    if (day === null || stopShownOnDay(itinerary, stop.id, day)) coords.push(stop.coords);
  }
  for (const leg of itinerary.legs) {
    const to = findStop(itinerary, leg.to);
    if (day !== null && to?.day !== day) continue;
    const line = routes[legKey(leg.from, leg.to)]?.coordinates;
    if (line) coords.push(...line);
  }
  return coords;
}

function frameCoords(coords: LngLat[]): [LngLat, LngLat] {
  const bounds = boundsOf(coords);
  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  if (maxLng - minLng < 0.012 && maxLat - minLat < 0.012) {
    return [
      [minLng - 0.02, minLat - 0.015],
      [maxLng + 0.02, maxLat + 0.015],
    ];
  }
  return bounds;
}

function setLayerVisibility(engine: MapEngine, id: string, visible: boolean) {
  const arrows = id.endsWith("-arrows");
  const opacity = visible ? (id.endsWith("-casing") ? 0.55 : 0.95) : 0;
  try {
    engine.map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    engine.map.setPaintProperty(id, arrows ? "icon-opacity" : "line-opacity", opacity);
  } catch {
    // Layers are added once the style has loaded.
  }
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function tween(
  duration: number,
  isCurrent: () => boolean,
  onFrame: (progress: number) => void,
): Promise<void> {
  if (duration <= 0) {
    onFrame(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (!isCurrent()) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - start) / duration);
      onFrame(progress);
      if (progress < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export function TripMap({
  itinerary,
  routes,
  day,
  selectedId,
  playing,
  reducedMotion,
  routesRevealed,
  mapboxToken,
  onSelect,
  onMapClick,
  onReady,
  onSaveStatus,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const markerEls = useRef<Map<string, HTMLButtonElement>>(new Map());
  const vehicleEl = useRef<HTMLDivElement | null>(null);
  const vehicleMarker = useRef<MarkerHandle | null>(null);
  const runRef = useRef(0);
  const shownRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const reducedRef = useRef(reducedMotion);
  const selectedIdRef = useRef(selectedId);
  const playingRef = useRef(playing);
  const dayRef = useRef(day);
  const revealedRef = useRef(routesRevealed);
  const daySeen = useRef<number | null | undefined>(undefined);
  const overviewRef = useRef<() => Promise<void>>(async () => {});
  const playRef = useRef<(index: number) => Promise<void>>(async () => {});
  const focusRef = useRef<(id: string) => void>(() => {});
  const cancelRef = useRef<() => void>(() => {
    runRef.current += 1;
  });
  const [booted, setBooted] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [duskReady, setDuskReady] = useState(false);
  const [archive, setArchive] = useState<Blob | null>(null);
  const [saveStatus, setSaveStatus] = useState<MapSaveStatus>("saving");
  const [showSaveNotice, setShowSaveNotice] = useState(true);
  const onSaveStatusRef = useRef(onSaveStatus);

  onSaveStatusRef.current = onSaveStatus;
  onSelectRef.current = onSelect;
  onMapClickRef.current = onMapClick;
  reducedRef.current = reducedMotion;
  selectedIdRef.current = selectedId;
  playingRef.current = playing;
  dayRef.current = day;
  revealedRef.current = routesRevealed;

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    let dead = false;
    void ensureMapArchive()
      .then((blob) => {
        if (dead) return;
        setArchive(blob);
        setSaveStatus("saved");
        onSaveStatusRef.current("saved");
      })
      .catch(() => {
        if (dead) return;
        setSaveStatus("error");
        onSaveStatusRef.current("error");
      });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!routesRevealed || saveStatus !== "saved") return;
    setShowSaveNotice(true);
    const timer = window.setTimeout(() => setShowSaveNotice(false), SAVED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [routesRevealed, saveStatus]);

  useEffect(() => {
    setDuskReady(false);
    if (online !== true || !mapboxToken) return;
    const controller = new AbortController();
    let dead = false;
    void mapboxStyleReachable(mapboxToken, controller.signal)
      .then((reachable) => {
        if (!dead) setDuskReady(reachable);
      })
      .catch((error: unknown) => {
        if (dead) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDuskReady(false);
      });
    return () => {
      dead = true;
      controller.abort();
    };
  }, [online, mapboxToken]);

  useEffect(() => {
    onReady({
      showOverview: () => overviewRef.current(),
      playLeg: (index) => playRef.current(index),
      focusStop: (id) => focusRef.current(id),
      cancel: () => cancelRef.current(),
    });
    return () => onReady(null);
  }, [onReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const basemap: Basemap | null =
      duskReady && mapboxToken
        ? { kind: "mapbox", token: mapboxToken }
        : archive
          ? { kind: "maplibre", archive }
          : null;
    if (!basemap) return;
    let dead = false;
    const engine = createMap(container, basemap, () => {
      if (!dead) setDuskReady(false);
    });
    engineRef.current = engine;
    const markers: MarkerHandle[] = [];
    const markerButtons = markerEls.current;
    const observer = new ResizeObserver(() => engine.map.resize());
    observer.observe(container);
    cancelRef.current = () => {
      runRef.current += 1;
      if (vehicleEl.current) vehicleEl.current.hidden = true;
    };

    const setLine = (key: string, coordinates: LngLat[]) => {
      engine.map.getSource(`leg-${key}`)?.setData(lineFeature(coordinates));
    };

    const placeVehicle = (index: number, along: number) => {
      const leg = itinerary.legs[index];
      const coords = leg ? routes[legKey(leg.from, leg.to)]?.coordinates : undefined;
      const vehicle = vehicleEl.current;
      const handle = vehicleMarker.current;
      if (!leg || !coords || !vehicle || !handle) return;
      const sample = pointAlong(coords, along);
      vehicle.hidden = false;
      vehicle.textContent = legStyle(leg).emoji;
      vehicle.className = `vehicle vehicle-${leg.mode}`;
      vehicle.style.transform = `rotate(${iconRotation(leg.mode, sample.bearing)}deg)`;
      handle.setLngLat(sample.point);
      return sample.point;
    };

    let markBooted = () => {};
    const bootedOnce = new Promise<void>((resolve) => {
      markBooted = resolve;
    });

    const boot = () => {
      if (dead) return;
      registerRouteChevron(engine.map);
      for (const leg of itinerary.legs) {
        const key = legKey(leg.from, leg.to);
        const route = routes[key];
        const style = modeStyle(leg.mode);
        const id = `leg-${key}`;
        const start = route?.coordinates[0] ?? itinerary.stops[0]?.coords ?? [4.6, 51.45];
        engine.map.addSource(id, {
          type: "geojson",
          data: lineFeature([start, start]),
        });
        engine.map.addLayer({
          id: `${id}-casing`,
          type: "line",
          source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#140f0b",
            "line-width": style.width + 5,
            "line-opacity": 0.55,
          },
        });
        engine.map.addLayer({
          id,
          type: "line",
          source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": style.color,
            "line-width": style.width,
            "line-opacity": 0.95,
            ...(style.dash.length > 0 ? { "line-dasharray": style.dash } : {}),
          },
        });
        engine.map.addLayer({
          id: `${id}-arrows`,
          type: "symbol",
          source: id,
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 48,
            "icon-image": ROUTE_CHEVRON,
            "icon-size": 0.72,
            "icon-allow-overlap": true,
            "icon-rotation-alignment": "map",
            "icon-pitch-alignment": "map",
          },
          paint: {
            "icon-opacity": 0.95,
          },
        });
      }

      for (const stop of itinerary.stops) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stop-marker";
        button.style.setProperty("--day", dayColor(stop.day));
        button.setAttribute("aria-label", `${stop.name}, ${stop.city}`);
        const pulse = document.createElement("span");
        pulse.className = "pulse";
        const core = document.createElement("span");
        core.className = "core";
        core.textContent = spotEmoji(stop);
        button.append(pulse, core);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current(stop.id);
        });
        const marker = engine.addMarker(button);
        marker.setLngLat(stop.coords);
        marker.addTo();
        markers.push(marker);
        markerEls.current.set(stop.id, button);
      }

      const vehicle = document.createElement("div");
      vehicle.className = "vehicle";
      vehicle.hidden = true;
      const handle = engine.addMarker(vehicle);
      handle.setLngLat(itinerary.stops[0]?.coords ?? [4.6, 51.45]);
      handle.addTo();
      markers.push(handle);
      vehicleEl.current = vehicle;
      vehicleMarker.current = handle;
      engine.map.resize();
      if (revealedRef.current) {
        for (const leg of itinerary.legs) {
          const key = legKey(leg.from, leg.to);
          const coords = routes[key]?.coordinates;
          if (coords) setLine(key, coords);
        }
        shownRef.current = true;
        const filterDay = dayRef.current;
        const framed = visibleCoordinates(itinerary, routes, filterDay);
        if (framed.length > 0) {
          try {
            engine.map.fitBounds(frameCoords(framed), {
              padding: PADDING,
              absolutePadding: true,
              pitch: reducedRef.current ? 0 : 34,
              duration: 0,
              maxZoom: filterDay === null ? 12.5 : 14,
            });
          } catch {
            engine.map.resize();
          }
        }
      }
      setBooted(true);
      markBooted();
    };

    let pointerStart: { x: number; y: number; at: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerStart = { x: event.clientX, y: event.clientY, at: performance.now() };
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      const start = pointerStart;
      pointerStart = null;
      if (!(target instanceof Element)) return;
      if (target.closest(".stop-marker, .maplibregl-ctrl, .mapboxgl-ctrl")) return;
      if (
        start &&
        performance.now() - start.at < 500 &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
      ) {
        return;
      }
      onMapClickRef.current();
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    container.addEventListener("click", onClick, true);

    if (engine.map.loaded()) boot();
    else engine.map.on("load", boot);

    // map.loaded() is false whenever tiles are in flight, and "load" fires only once.
    const whenReady = () => bootedOnce;

    overviewRef.current = async () => {
      const token = ++runRef.current;
      const isCurrent = () => token === runRef.current && !dead;
      await whenReady();
      if (!isCurrent()) return;
      const all = itinerary.legs.flatMap(
        (leg) => routes[legKey(leg.from, leg.to)]?.coordinates ?? [],
      );
      const reduced = reducedRef.current;
      if (all.length > 1) {
        try {
          engine.map.fitBounds(boundsOf(all), {
            padding: PADDING,
            absolutePadding: true,
            pitch: reduced ? 0 : 32,
            duration: reduced ? 0 : 2600,
            maxZoom: 12.5,
          });
        } catch {
          engine.map.resize();
        }
      }
      if (reduced) {
        itinerary.legs.forEach((leg) => {
          const key = legKey(leg.from, leg.to);
          const coords = routes[key]?.coordinates;
          if (coords) setLine(key, coords);
        });
        shownRef.current = true;
        return;
      }
      await wait(380);
      const totalMeters = itinerary.legs.reduce(
        (sum, leg) => sum + (routes[legKey(leg.from, leg.to)]?.distanceMeters ?? 0),
        0,
      );
      const msPerMeter =
        Math.max(0, OVERVIEW_DRAW_MS - OVERVIEW_LEG_FLOOR_MS * itinerary.legs.length) /
        Math.max(1, totalMeters);
      for (let index = 0; index < itinerary.legs.length; index += 1) {
        if (!isCurrent()) return;
        const leg = itinerary.legs[index];
        const route = routes[legKey(leg.from, leg.to)];
        const duration = Math.round(
          OVERVIEW_LEG_FLOOR_MS + (route?.distanceMeters ?? 0) * msPerMeter,
        );
        await tween(duration, isCurrent, (progress) => {
          if (route) setLine(legKey(leg.from, leg.to), sliceLine(route.coordinates, progress));
        });
      }
      if (isCurrent()) shownRef.current = true;
    };

    playRef.current = async (index: number) => {
      const token = ++runRef.current;
      const isCurrent = () => token === runRef.current && !dead;
      await whenReady();
      const leg = itinerary.legs[index];
      if (!leg || !isCurrent()) return;
      const key = legKey(leg.from, leg.to);
      const route = routes[key];
      if (!route) return;
      const reduced = reducedRef.current;
      if (reduced) {
        setLine(key, route.coordinates);
        const end = route.coordinates[route.coordinates.length - 1];
        if (end) {
          engine.map.flyTo({
            center: end,
            zoom: followZoom(leg.mode, route.distanceMeters),
            pitch: 0,
            duration: 0,
            essential: true,
            padding: PADDING,
          });
        }
        return;
      }
      setLine(key, sliceLine(route.coordinates, 0));
      const travelStarted = performance.now();
      const opening = readCamera(engine.map);
      await tween(legDuration(leg.mode, route.distanceMeters), isCurrent, (progress) => {
        const along = playbackProgress(leg.mode, progress);
        setLine(key, sliceLine(route.coordinates, along));
        const point = placeVehicle(index, along);
        if (!point) return;
        const catchUp = smoothstep((performance.now() - travelStarted) / 240);
        const locked = progress >= 1 || catchUp >= 1;
        const zoom = followZoomAt(leg.mode, route.distanceMeters, along);
        const pitch = locked ? 42 : opening.pitch + (42 - opening.pitch) * catchUp;
        engine.map.jumpTo({
          center: locked
            ? point
            : [
                opening.center[0] + (point[0] - opening.center[0]) * catchUp,
                opening.center[1] + (point[1] - opening.center[1]) * catchUp,
              ],
          zoom: locked ? zoom : opening.zoom + (zoom - opening.zoom) * catchUp,
          pitch,
          padding: PADDING,
        });
      });
      if (!isCurrent()) return;
      setLine(key, route.coordinates);
      const end = route.coordinates[route.coordinates.length - 1];
      if (end) {
        engine.map.jumpTo({
          center: end,
          zoom: followZoom(leg.mode, route.distanceMeters),
          pitch: 42,
          padding: PADDING,
        });
      }
      if (vehicleEl.current) vehicleEl.current.hidden = true;
    };

    focusRef.current = (id: string) => {
      const stop = findStop(itinerary, id);
      if (!stop) return;
      // Wait a frame so the stop sheet is mounted and the pin can sit in the gap above it.
      requestAnimationFrame(() => {
        if (dead) return;
        const phone = container.parentElement;
        const height = container.clientHeight;
        const chrome = phone
          ? Number.parseFloat(getComputedStyle(phone).getPropertyValue("--chrome-bottom"))
          : Number.NaN;
        const top = (Number.isFinite(chrome) ? chrome : 150) + 12;
        const sheet = phone?.querySelector<HTMLElement>(".stop-sheet");
        const sheetTop = sheet ? sheet.offsetTop : height - 300;
        const bottom = Math.max(0, Math.min(height - sheetTop + 12, height - top - 72));
        engine.map.flyTo({
          center: stop.coords,
          zoom: 14.5,
          pitch: reducedRef.current ? 0 : 48,
          duration: reducedRef.current ? 0 : 1400,
          essential: true,
          padding: { top, bottom, left: 24, right: 24 },
        });
      });
    };

    return () => {
      dead = true;
      runRef.current += 1;
      observer.disconnect();
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick, true);
      for (const marker of markers) marker.remove();
      markerButtons.clear();
      vehicleEl.current = null;
      vehicleMarker.current = null;
      engine.map.remove();
      engineRef.current = null;
      setBooted(false);
    };
  }, [itinerary, routes, mapboxToken, duskReady, archive]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !booted) return;

    for (const stop of itinerary.stops) {
      const element = markerEls.current.get(stop.id);
      if (!element) continue;
      const hidden = day !== null && !stopShownOnDay(itinerary, stop.id, day);
      element.classList.toggle("is-hidden", hidden);
      element.classList.toggle("is-active", stop.id === selectedId);
      element.tabIndex = hidden ? -1 : 0;
      if (hidden) element.setAttribute("aria-hidden", "true");
      else element.removeAttribute("aria-hidden");
    }

    for (const leg of itinerary.legs) {
      const to = findStop(itinerary, leg.to);
      const visible = legIsVisible(day, to?.day);
      const key = legKey(leg.from, leg.to);
      setLayerVisibility(engine, `leg-${key}`, visible);
      setLayerVisibility(engine, `leg-${key}-casing`, visible);
      setLayerVisibility(engine, `leg-${key}-arrows`, visible);
    }

    if (daySeen.current === day) return;
    const previous = daySeen.current;
    daySeen.current = day;
    if (previous === undefined && day === null) return;
    if (playingRef.current) return;

    runRef.current += 1;
    if (vehicleEl.current) vehicleEl.current.hidden = true;
    shownRef.current = true;
    for (const leg of itinerary.legs) {
      const to = findStop(itinerary, leg.to);
      const visible = legIsVisible(day, to?.day);
      const route = routes[legKey(leg.from, leg.to)];
      if (!visible || !route) continue;
      engine.map.getSource(`leg-${legKey(leg.from, leg.to)}`)?.setData(lineFeature(route.coordinates));
    }
    if (selectedIdRef.current) return;
    const coords = visibleCoordinates(itinerary, routes, day);
    if (coords.length === 0) return;
    try {
      engine.map.fitBounds(frameCoords(coords), {
        padding: PADDING,
        absolutePadding: true,
        pitch: reducedMotion ? 0 : 36,
        duration: reducedMotion ? 0 : 900,
        maxZoom: day === null ? 12.5 : 14,
      });
    } catch {
      engine.map.resize();
    }
  }, [booted, day, selectedId, playing, itinerary, routes, reducedMotion]);

  return (
    <>
      <div
        ref={containerRef}
        className="map-canvas absolute inset-0"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 0 }}
      />
      {routesRevealed && showSaveNotice ? (
        <p className={`map-save-status glass${saveStatus === "error" ? " is-error" : ""}`} role="status">
          {mapSaveMessage(saveStatus)}
        </p>
      ) : null}
    </>
  );
}
