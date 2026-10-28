import { readFileSync, writeFileSync } from "node:fs";
import { lineLength, sketchArc, smoothThrough, type LngLat } from "../lib/geo";
import { getItinerary, legKey } from "../lib/itinerary";
import { routesPath, type RouteGeometry, type RouteSet } from "../lib/routes";
import type { Leg, Mode } from "../lib/schema";

function mapboxProfile(mode: Mode): "driving" | "cycling" | "walking" | null {
  switch (mode) {
    case "car":
      return "driving";
    case "bike":
      return "cycling";
    case "walk":
      return "walking";
    case "train":
    case "bus":
      return null;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

function osrmProfile(mode: Mode): "driving" | "bike" | "foot" | null {
  switch (mode) {
    case "car":
      return "driving";
    case "bike":
      return "bike";
    case "walk":
      return "foot";
    case "train":
    case "bus":
      return null;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

function readExisting(): RouteSet {
  try {
    return JSON.parse(readFileSync(routesPath(), "utf8")) as RouteSet;
  } catch {
    return {};
  }
}

function geometry(
  coordinates: LngLat[],
  source: RouteGeometry["source"],
): RouteGeometry {
  return {
    coordinates,
    distanceMeters: Math.round(lineLength(coordinates)),
    source,
  };
}

function curved(from: LngLat, via: LngLat[] | undefined, to: LngLat): LngLat[] {
  if (via && via.length > 0) return smoothThrough([from, ...via, to], 8);
  return sketchArc(from, to);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      console.warn(`directions responded ${response.status}`);
      return null;
    }
    return (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.warn(`directions request failed: ${message}`);
    return null;
  }
}

function coordinatesOf(payload: unknown): { coordinates: LngLat[]; distance: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const routes = (payload as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || !routes[0] || typeof routes[0] !== "object") {
    return null;
  }
  const route = routes[0] as {
    distance?: unknown;
    geometry?: { coordinates?: unknown };
  };
  const coordinates = route.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const line = coordinates.filter(
    (point): point is LngLat =>
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number",
  );
  if (line.length < 2) return null;
  const distance = typeof route.distance === "number" ? route.distance : lineLength(line);
  return { coordinates: line, distance };
}

async function fetchMapbox(
  profile: "driving" | "cycling" | "walking",
  from: LngLat,
  to: LngLat,
  token: string,
): Promise<RouteGeometry | null> {
  const path = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
  const parsed = coordinatesOf(await fetchJson(url));
  if (!parsed) return null;
  return {
    coordinates: parsed.coordinates,
    distanceMeters: Math.round(parsed.distance),
    source: "mapbox",
  };
}

async function fetchOsrm(
  profile: "driving" | "bike" | "foot",
  from: LngLat,
  to: LngLat,
): Promise<RouteGeometry | null> {
  const path = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url =
    `https://router.project-osrm.org/route/v1/${profile}/${path}` +
    "?overview=full&geometries=geojson";
  const parsed = coordinatesOf(await fetchJson(url));
  if (!parsed) return null;
  return {
    coordinates: parsed.coordinates,
    distanceMeters: Math.round(parsed.distance),
    source: "osrm",
  };
}

function keepExisting(existing: RouteSet, key: string): RouteGeometry | null {
  const saved = existing[key];
  if (!saved || !Array.isArray(saved.coordinates) || saved.coordinates.length < 2) {
    return null;
  }
  return saved;
}

async function buildLeg(
  leg: Leg,
  from: LngLat,
  to: LngLat,
  token: string | undefined,
  existing: RouteSet,
): Promise<RouteGeometry> {
  const key = legKey(leg.from, leg.to);
  if ((leg.mode === "train" || leg.mode === "bus") && leg.via && leg.via.length > 0) {
    return geometry(curved(from, leg.via, to), "sketch");
  }

  const mapbox = token ? mapboxProfile(leg.mode) : null;
  if (mapbox && token) {
    const routed = await fetchMapbox(mapbox, from, to, token);
    if (routed) return routed;
  }

  const osrm = osrmProfile(leg.mode);
  if (osrm) {
    const routed = await fetchOsrm(osrm, from, to);
    if (routed) return routed;
  }

  return keepExisting(existing, key) ?? geometry(curved(from, leg.via, to), "sketch");
}

async function main(): Promise<void> {
  const itinerary = getItinerary();
  const existing = readExisting();
  const token = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const routes: RouteSet = {};
  const stops = new Map(itinerary.stops.map((stop) => [stop.id, stop]));

  for (const leg of itinerary.legs) {
    const from = stops.get(leg.from);
    const to = stops.get(leg.to);
    if (!from || !to) {
      throw new Error(`Leg ${leg.from} → ${leg.to} is missing a stop`);
    }
    const key = legKey(leg.from, leg.to);
    routes[key] = await buildLeg(leg, from.coords, to.coords, token, existing);
    console.log(`${key}: ${routes[key].source} · ${routes[key].distanceMeters} m`);
  }

  writeFileSync(routesPath(), `${JSON.stringify(routes, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(routes).length} routes`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Route build failed";
  console.error(message);
  process.exit(1);
});
