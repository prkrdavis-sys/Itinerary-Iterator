import mapboxgl from "mapbox-gl";
import { addProtocol, Map as MapLibreMap, Marker as MapLibreMarker, setWorkerUrl } from "maplibre-gl";
import { PMTiles, Protocol, type RangeResponse, type Source } from "pmtiles";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { ARCHIVE_KEY, localBasemapStyle } from "@/lib/basemap-style";
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
  on: (event: string, listener: (event?: { originalEvent?: Event }) => void) => void;
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
  setLayoutProperty: (layer: string, name: string, value: unknown) => void;
  fitBounds: (
    bounds: [LngLat, LngLat],
    options: {
      padding?: { top: number; bottom: number; left: number; right: number };
      pitch?: number;
      duration?: number;
      maxZoom?: number;
      absolutePadding?: boolean;
    },
  ) => void;
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  getPitch: () => number;
  easeTo: (options: {
    center: LngLat;
    zoom?: number;
    pitch?: number;
    duration?: number;
    essential?: boolean;
  }) => void;
  jumpTo: (options: {
    center: LngLat;
    zoom?: number;
    pitch?: number;
    padding?: { top: number; bottom: number; left: number; right: number };
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

export type Basemap =
  | { kind: "maplibre"; archive: Blob }
  | { kind: "mapbox"; token: string };

class BlobSource implements Source {
  private readonly blob: Blob;
  private readonly key: string;

  constructor(blob: Blob, key: string) {
    this.blob = blob;
    this.key = key;
  }

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await this.blob.slice(offset, offset + length).arrayBuffer();
    return { data };
  }
}

let protocol: Protocol | null = null;

function attachArchive(blob: Blob): void {
  if (!protocol) {
    protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
  }
  protocol.add(new PMTiles(new BlobSource(blob, ARCHIVE_KEY)));
}

const EUROPE: LngLat = [4.6, 51.45];

function createMapbox(container: HTMLElement, token: string): MapEngine {
  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/standard",
    config: {
      basemap: {
        lightPreset: "dusk",
      },
    },
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

function createMapLibre(container: HTMLElement, archive: Blob): MapEngine {
  attachArchive(archive);
  const map = new MapLibreMap({
    container,
    style: localBasemapStyle(),
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

export function createMap(container: HTMLElement, basemap: Basemap): MapEngine {
  switch (basemap.kind) {
    case "mapbox":
      return createMapbox(container, basemap.token);
    case "maplibre":
      return createMapLibre(container, basemap.archive);
    default: {
      const neverBasemap: never = basemap;
      return neverBasemap;
    }
  }
}

export function readCamera(map: MapLike): { center: LngLat; zoom: number; pitch: number } {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
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
