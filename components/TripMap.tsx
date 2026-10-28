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
import type { Itinerary } from "@/lib/schema";
import type { RouteSet } from "@/lib/routes";
import { createMap, lineFeature, type MapEngine, type MarkerHandle } from "./map-engine";

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
  onSelect: (id: string) => void;
  onReady: (handle: TripMapHandle | null) => void;
};

const PADDING = { top: 132, bottom: 210, left: 28, right: 28 };

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
  onSelect,
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
  const reducedRef = useRef(reducedMotion);
  const overviewRef = useRef<() => Promise<void>>(async () => {});
  const playRef = useRef<(index: number) => Promise<void>>(async () => {});
  const focusRef = useRef<(id: string) => void>(() => {});
  const cancelRef = useRef<() => void>(() => {
    runRef.current += 1;
  });
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    reducedRef.current = reducedMotion;
  }, [onSelect, reducedMotion]);

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
    const engine = createMap(container);
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

      for (const stop of itinerary.stops) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stop-marker";
        button.style.setProperty("--city", cityColor(stop.city));
        button.setAttribute("aria-label", `${stop.name}, ${stop.city}`);
        button.innerHTML = '<span class="pulse"></span><span class="core"></span>';
        button.addEventListener("click", () => onSelectRef.current(stop.id));
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
      setBooted(true);
    };

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
        padding: { top: 120, bottom: 260, left: 24, right: 24 },
      });
    };

    return () => {
      dead = true;
      runRef.current += 1;
      observer.disconnect();
      for (const marker of markers) marker.remove();
      markerButtons.clear();
      vehicleEl.current = null;
      vehicleMarker.current = null;
      engine.map.remove();
      engineRef.current = null;
      setBooted(false);
    };
  }, [itinerary, routes]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !booted) return;
    for (const stop of itinerary.stops) {
      const element = markerEls.current.get(stop.id);
      if (!element) continue;
      element.classList.toggle("is-dim", day !== null && stop.day !== day);
      element.classList.toggle("is-active", stop.id === selectedId);
    }
    for (const leg of itinerary.legs) {
      const from = findStop(itinerary, leg.from);
      const to = findStop(itinerary, leg.to);
      const visible = day === null || from?.day === day || to?.day === day;
      const key = legKey(leg.from, leg.to);
      engine.map.setPaintProperty(`leg-${key}`, "line-opacity", visible ? 0.95 : 0.14);
      engine.map.setPaintProperty(
        `leg-${key}-casing`,
        "line-opacity",
        visible ? 0.5 : 0.05,
      );
    }
  }, [booted, day, selectedId, itinerary]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !booted || !shownRef.current || playing || day === null) return;
    const coords = itinerary.stops
      .filter((stop) => stop.day === day)
      .map((stop) => stop.coords);
    if (coords.length === 0) return;
    engine.map.fitBounds(boundsOf(coords), {
      padding: PADDING,
      pitch: reducedMotion ? 0 : 36,
      duration: reducedMotion ? 0 : 900,
      maxZoom: 14,
    });
  }, [booted, day, itinerary, playing, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="map-canvas absolute inset-0"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );
}
