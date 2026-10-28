import mapboxgl from "mapbox-gl";
import { Map as MapLibreMap, Marker as MapLibreMarker, setWorkerUrl } from "maplibre-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLat } from "@/lib/geo";

setWorkerUrl("/maplibre-gl-worker.js");
mapboxgl.workerUrl = "/mapbox-gl-csp-worker.js";

export type LineFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: {
    type: "LineString";
    coordinates: LngLat[];
  };
};

type MapLike = {
  on: (event: string, listener: () => void) => void;
  loaded: () => boolean;
  addSource: (id: string, source: { type: "geojson"; data: LineFeature }) => void;
  addLayer: (layer: {
    id: string;
    type: "line";
    source: string;
    layout?: Record<string, string>;
    paint: Record<string, unknown>;
  }) => void;
  getSource: (id: string) => { setData: (data: LineFeature) => void } | undefined;
  setPaintProperty: (layer: string, name: string, value: unknown) => void;
  resize: () => void;
  remove: () => void;
  fitBounds: (
    bounds: [LngLat, LngLat],
    options: {
      padding?: { top: number; bottom: number; left: number; right: number };
      pitch?: number;
      duration?: number;
      maxZoom?: number;
    },
  ) => void;
  easeTo: (options: {
    center: LngLat;
    zoom?: number;
    pitch?: number;
    duration?: number;
    essential?: boolean;
  }) => void;
  flyTo: (options: {
    center: LngLat;
    zoom?: number;
    pitch?: number;
    duration?: number;
    essential?: boolean;
    padding?: { top: number; bottom: number; left: number; right: number };
  }) => void;
};

export type MarkerHandle = {
  setLngLat: (lngLat: LngLat) => void;
  addTo: () => void;
  remove: () => void;
};

export type MapEngine = {
  kind: "mapbox" | "maplibre";
  map: MapLike;
  addMarker: (element: HTMLElement) => MarkerHandle;
};

const EUROPE: LngLat = [4.6, 51.45];

export function createMap(container: HTMLElement): MapEngine {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/standard",
      center: EUROPE,
      zoom: 5.15,
      pitch: 0,
      projection: "mercator",
      attributionControl: true,
      fadeDuration: 0,
    });
    map.on("style.load", () => {
      try {
        map.setConfigProperty("basemap", "lightPreset", "dusk");
      } catch {
        // The standard style is the only one with a dusk preset.
      }
    });
    return {
      kind: "mapbox",
      map: map as unknown as MapLike,
      addMarker: (element) => {
        const marker = new mapboxgl.Marker({ element, anchor: "center" });
        return {
          setLngLat: (lngLat) => {
            marker.setLngLat(lngLat);
          },
          addTo: () => {
            marker.addTo(map);
          },
          remove: () => {
            marker.remove();
          },
        };
      },
    };
  }

  const map = new MapLibreMap({
    container,
    style: "https://tiles.openfreemap.org/styles/dark",
    center: EUROPE,
    zoom: 5.15,
    pitch: 0,
    fadeDuration: 0,
  });
  return {
    kind: "maplibre",
    map: map as unknown as MapLike,
    addMarker: (element) => {
      const marker = new MapLibreMarker({ element, anchor: "center" });
      return {
        setLngLat: (lngLat) => {
          marker.setLngLat(lngLat);
        },
        addTo: () => {
          marker.addTo(map);
        },
        remove: () => {
          marker.remove();
        },
      };
    },
  };
}

export function lineFeature(coordinates: LngLat[]): LineFeature {
  const line =
    coordinates.length >= 2
      ? coordinates
      : coordinates.length === 1
        ? [coordinates[0], coordinates[0]]
        : [EUROPE, EUROPE];
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: line },
  };
}
