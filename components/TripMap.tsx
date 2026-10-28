"use client";

import { useEffect, useRef, useState } from "react";
import { boundsOf, pointAlong, sliceLine, type LngLat } from "@/lib/geo";
import { findStop, legKey } from "@/lib/itinerary";
import {
  cityColor,
  followZoom,
  iconRotation,
  legDuration,
  modeStyle,
  playbackProgress,
} from "@/lib/modes";
import { ensureMapArchive } from "@/lib/offline-archive";
import type { Itinerary } from "@/lib/schema";
import type { RouteSet } from "@/lib/routes";
import {
  createMap,
  lineFeature,
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
};

const PADDING = { top: 156, bottom: 148, left: 28, right: 28 };

type SaveStatus = "saving" | "saved" | "error";

function saveMessage(status: SaveStatus): string {
  switch (status) {
    case "saving":
      return "Saving the map on this phone";
    case "saved":
      return "Saved on this phone";
    case "error":
      return "This phone could not store the map";
    default: {
      const neverStatus: never = status;
      return neverStatus;
    }
  }
}

function legIsVisible(
  day: number | null,
  playing: boolean,
  fromDay: number | undefined,
  toDay: number | undefined,
): boolean {
  if (playing || day === null) return true;
  return fromDay === day || toDay === day;
}

function visibleCoordinates(
  itinerary: Itinerary,
  routes: RouteSet,
  day: number | null,
): LngLat[] {
  const coords: LngLat[] = [];
  for (const stop of itinerary.stops) {
    if (day === null || stop.day === day) coords.push(stop.coords);
  }
  for (const leg of itinerary.legs) {
    const from = findStop(itinerary, leg.from);
    const to = findStop(itinerary, leg.to);
    if (day !== null && from?.day !== day && to?.day !== day) continue;
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
  const opacity = visible ? (id.endsWith("-casing") ? 0.55 : 0.95) : 0;
  try {
    engine.map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    engine.map.setPaintProperty(id, "line-opacity", opacity);
  } catch {
    // Layers are added once the style has loaded.
  }
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
  const [archive, setArchive] = useState<Blob | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saving");

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
      })
      .catch(() => {
        if (!dead) setSaveStatus("error");
      });
    return () => {
      dead = true;
    };
  }, []);

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
    if (!container || online === null) return;
    const basemap: Basemap | null =
      online && mapboxToken
        ? { kind: "mapbox", token: mapboxToken }
        : archive
          ? { kind: "maplibre", archive }
          : null;
    if (!basemap) return;
    const engine = createMap(container, basemap);
    engineRef.current = engine;
    let dead = false;
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
      vehicle.textContent = modeStyle(leg.mode).emoji;
      vehicle.className = `vehicle vehicle-${leg.mode}`;
      vehicle.style.transform = `rotate(${iconRotation(leg.mode, sample.bearing)}deg)`;
      handle.setLngLat(sample.point);
      return sample.point;
    };

    const boot = () => {
      if (dead) return;
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
      }

      const orderOnDay = new Map<number, number>();
      for (const stop of itinerary.stops) {
        const order = (orderOnDay.get(stop.day) ?? 0) + 1;
        orderOnDay.set(stop.day, order);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stop-marker";
        button.style.setProperty("--city", cityColor(stop.city));
        button.setAttribute("aria-label", `${stop.name}, ${stop.city}, stop ${order}`);
        const pulse = document.createElement("span");
        pulse.className = "pulse";
        const core = document.createElement("span");
        core.className = "core";
        core.textContent = String(order);
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
        const filterDay = playingRef.current ? null : dayRef.current;
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

    const whenReady = async () => {
      if (engine.map.loaded()) return;
      await new Promise<void>((resolve) => {
        engine.map.on("load", () => resolve());
      });
    };

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
      for (let index = 0; index < itinerary.legs.length; index += 1) {
        if (!isCurrent()) return;
        const leg = itinerary.legs[index];
        const route = routes[legKey(leg.from, leg.to)];
        const duration = Math.min(
          760,
          Math.round(legDuration(leg.mode, route?.distanceMeters ?? 1000) * 0.28),
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
      let lastFollow = 0;
      await tween(legDuration(leg.mode, route.distanceMeters), isCurrent, (progress) => {
        const along = playbackProgress(leg.mode, progress);
        setLine(key, sliceLine(route.coordinates, along));
        const point = placeVehicle(index, along);
        const now = performance.now();
        if (point && now - lastFollow > 680) {
          lastFollow = now;
          engine.map.easeTo({
            center: point,
            zoom: followZoom(leg.mode, route.distanceMeters),
            pitch: 42,
            duration: 680,
            essential: true,
          });
        }
      });
      if (!isCurrent()) return;
      setLine(key, route.coordinates);
      if (vehicleEl.current) vehicleEl.current.hidden = true;
    };

    focusRef.current = (id: string) => {
      const stop = findStop(itinerary, id);
      if (!stop) return;
      engine.map.flyTo({
        center: stop.coords,
        zoom: 14.5,
        pitch: reducedRef.current ? 0 : 48,
        duration: reducedRef.current ? 0 : 1400,
        essential: true,
        padding: { top: 170, bottom: 300, left: 24, right: 24 },
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
  }, [itinerary, routes, mapboxToken, online, archive]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !booted) return;

    for (const stop of itinerary.stops) {
      const element = markerEls.current.get(stop.id);
      if (!element) continue;
      const hidden = !playing && day !== null && stop.day !== day;
      element.classList.toggle("is-hidden", hidden);
      element.classList.toggle("is-active", stop.id === selectedId);
      element.tabIndex = hidden ? -1 : 0;
      if (hidden) element.setAttribute("aria-hidden", "true");
      else element.removeAttribute("aria-hidden");
    }

    for (const leg of itinerary.legs) {
      const from = findStop(itinerary, leg.from);
      const to = findStop(itinerary, leg.to);
      const visible = legIsVisible(day, playing, from?.day, to?.day);
      const key = legKey(leg.from, leg.to);
      setLayerVisibility(engine, `leg-${key}`, visible);
      setLayerVisibility(engine, `leg-${key}-casing`, visible);
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
      const from = findStop(itinerary, leg.from);
      const to = findStop(itinerary, leg.to);
      const visible = legIsVisible(day, false, from?.day, to?.day);
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
      <p className={`map-save-status glass${saveStatus === "error" ? " is-error" : ""}`} role="status">
        {saveMessage(saveStatus)}
      </p>
    </>
  );
}
