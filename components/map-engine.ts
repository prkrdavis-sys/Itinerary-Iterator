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

type MapLayer = {
  id: string;
  type: "line" | "symbol";
  source: string;
  layout?: Record<string, string | number | boolean>;
  paint: Record<string, unknown>;
};

type MapLike = {
  on: (event: string, listener: (event?: { originalEvent?: Event }) => void) => void;
  loaded: () => boolean;
  addSource: (id: string, source: { type: "geojson"; data: LineFeature }) => void;
  addLayer: (layer: MapLayer) => void;
  addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void;
  hasImage: (id: string) => boolean;
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

const MISSING_TILE = "Tile not found.";

function attachArchive(blob: Blob): void {
  if (!protocol) {
    // A missing tile must fail rather than come back empty: MapLibre then draws the
    // nearest coarser tile in its place instead of a blank, water-coloured hole.
    protocol = new Protocol({ errorOnMissingTile: true });
    addProtocol("pmtiles", protocol.tile);
  }
  protocol.add(new PMTiles(new BlobSource(blob, ARCHIVE_KEY)));
}

function isMissingTile(event: { error?: { message?: string } }): boolean {
  return event.error?.message === MISSING_TILE;
}

const EUROPE: LngLat = [4.6, 51.45];

function createMapbox(container: HTMLElement, token: string, onStyleError: () => void): MapEngine {
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
  let styleReady = false;
  map.on("style.load", () => {
    styleReady = true;
    try {
      map.setConfigProperty("basemap", "lightPreset", "dusk");
    } catch {
      // The standard style is the only one with a dusk preset.
    }
  });
  map.on("error", (event) => {
    if (styleReady) return;
    const error = event.error as { status?: number; message?: string } | undefined;
    const failed =
      typeof error?.status === "number" ||
      /fetch|network|style|ajax|failed/i.test(error?.message ?? "");
    if (failed) onStyleError();
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
    style: localBasemapStyle(window.location.origin),
    center: EUROPE,
    zoom: 5.15,
    pitch: 0,
    fadeDuration: 0,
  });
  // The Protomaps POI layer names a few icons the bundled sprite does not ship.
  map.setMissingStyleImageResolver(async (id) => {
    if (map.hasImage(id)) return;
    map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
  let resyncQueued = false;
  map.on("error", (event) => {
    if (!isMissingTile(event)) {
      console.error(event.error);
      return;
    }
    // MapLibre only looks for a parent tile on its next source update, which may not
    // come until the camera moves if this was the last tile to settle.
    if (resyncQueued) return;
    resyncQueued = true;
    requestAnimationFrame(() => {
      resyncQueued = false;
      map._update();
    });
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

export function mapboxStyleReachable(token: string, signal: AbortSignal): Promise<boolean> {
  const url = `https://api.mapbox.com/styles/v1/mapbox/standard?access_token=${encodeURIComponent(token)}`;
  return fetch(url, { signal }).then((response) => response.ok);
}

export function createMap(
  container: HTMLElement,
  basemap: Basemap,
  onStyleError: () => void = () => {},
): MapEngine {
  switch (basemap.kind) {
    case "mapbox":
      return createMapbox(container, basemap.token, onStyleError);
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

export const ROUTE_CHEVRON = "route-chevron";

export function registerRouteChevron(map: MapLike): void {
  if (map.hasImage(ROUTE_CHEVRON)) return;
  map.addImage(ROUTE_CHEVRON, routeChevronImage(), { pixelRatio: 2 });
}

function routeChevronImage(): ImageData {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the route chevron");

  // Line placement aligns the icon's x-axis with the path, so the tip points right.
  const chevron = (tipX: number, baseX: number, notchX: number, half: number) => {
    context.beginPath();
    context.moveTo(tipX, 32);
    context.lineTo(baseX, 32 - half);
    context.lineTo(notchX, 32);
    context.lineTo(baseX, 32 + half);
    context.closePath();
  };

  chevron(58, 8, 24, 24);
  context.fillStyle = "#140f0b";
  context.fill();

  chevron(50, 18, 28, 15);
  context.fillStyle = "#f4efe6";
  context.fill();

  chevron(50, 32, 40, 8);
  context.fillStyle = "#f0b429";
  context.fill();

  return context.getImageData(0, 0, size, size);
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
