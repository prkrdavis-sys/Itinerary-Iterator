import { readFileSync, writeFileSync } from "node:fs";
import {
  anchorLine,
  haversine,
  lineLength,
  sketchArc,
  smoothThrough,
  type LngLat,
} from "../lib/geo";
import { getItinerary, legKey } from "../lib/itinerary";
import { routesPath, type RouteGeometry, type RouteSet, type RouteSource } from "../lib/routes";
import type { Leg, Mode } from "../lib/schema";

const LOCAL_RATIO = 2.5;
const LOCAL_STRAIGHT_METERS = 5_000;
const SHORT_DRIVE_METERS = 15_000;
const SHORT_DRIVE_RATIO = 1.85;
const CORRIDOR_METERS = 8_000;
const CORRIDOR_IMPROVEMENT_METERS = 5_000;

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

function geometriesOf(payload: unknown, source: RouteSource): RouteGeometry[] {
  if (!payload || typeof payload !== "object") return [];
  const routes = (payload as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return [];
  const parsed: RouteGeometry[] = [];
  for (const route of routes) {
    if (!route || typeof route !== "object") continue;
    const record = route as {
      distance?: unknown;
      geometry?: { coordinates?: unknown };
    };
    const coordinates = record.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const line = coordinates.filter(
      (point): point is LngLat =>
        Array.isArray(point) &&
        point.length >= 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number",
    );
    if (line.length < 2) continue;
    const distance = typeof record.distance === "number" ? record.distance : lineLength(line);
    parsed.push({
      coordinates: line,
      distanceMeters: Math.round(distance),
      source,
    });
  }
  return parsed;
}

async function fetchMapboxRoutes(
  profile: "driving" | "cycling" | "walking",
  points: LngLat[],
  token: string,
): Promise<RouteGeometry[]> {
  const path = points.map((point) => `${point[0]},${point[1]}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}` +
    `?geometries=geojson&overview=full&alternatives=true&access_token=${encodeURIComponent(token)}`;
  return geometriesOf(await fetchJson(url), "mapbox");
}

async function fetchOsrmRoutes(
  profile: "driving" | "bike" | "foot",
  points: LngLat[],
): Promise<RouteGeometry[]> {
  const path = points.map((point) => `${point[0]},${point[1]}`).join(";");
  const url =
    `https://router.project-osrm.org/route/v1/${profile}/${path}` +
    "?overview=full&geometries=geojson&alternatives=true";
  return geometriesOf(await fetchJson(url), "osrm");
}

function eastOfEnds(from: LngLat, to: LngLat, coords: LngLat[]): number {
  const limit = Math.max(from[0], to[0]);
  let worst = 0;
  for (const point of coords) {
    if (point[0] <= limit) continue;
    worst = Math.max(worst, haversine([limit, point[1]], point));
  }
  return worst;
}

function localDetour(from: LngLat, to: LngLat, distance: number): boolean {
  const straight = haversine(from, to);
  if (straight <= 0 || straight >= LOCAL_STRAIGHT_METERS) return false;
  const extra = distance - straight;
  return distance / straight > LOCAL_RATIO && extra > 2_000;
}

function shortDriveBow(from: LngLat, to: LngLat, distance: number): boolean {
  const straight = haversine(from, to);
  return straight > 0 && straight < SHORT_DRIVE_METERS && distance / straight > SHORT_DRIVE_RATIO;
}

function connector(from: LngLat, to: LngLat): LngLat[] {
  const steps = 6;
  const line: LngLat[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    line.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
  }
  return line;
}

function joinLines(parts: LngLat[][]): LngLat[] {
  const line: LngLat[] = [];
  for (const part of parts) {
    for (const point of part) {
      const last = line[line.length - 1];
      if (last && last[0] === point[0] && last[1] === point[1]) continue;
      line.push(point);
    }
  }
  return line;
}

async function routeHops(
  profile: "driving" | "bike" | "foot",
  points: LngLat[],
): Promise<RouteGeometry | null> {
  const parts: LngLat[][] = [];
  let routed = false;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    const hop = (await fetchOsrmRoutes(profile, [from, to]))[0];
    const straight = haversine(from, to);
    const ratio = straight > 0 && hop ? hop.distanceMeters / straight : Infinity;
    const extra = hop ? hop.distanceMeters - straight : Infinity;
    const absurd = !hop || ratio > 4 || (ratio > LOCAL_RATIO && extra > 2_000);
    if (absurd || !hop) {
      parts.push(connector(from, to));
      continue;
    }
    routed = true;
    parts.push(hop.coordinates);
  }
  const coordinates = joinLines(parts);
  if (coordinates.length < 2) return null;
  return geometry(coordinates, routed ? "osrm" : "sketch");
}

function rank(route: RouteGeometry, from: LngLat, to: LngLat): number {
  const east = eastOfEnds(from, to, route.coordinates);
  const corridorPenalty = east > CORRIDOR_METERS ? east * 10 : 0;
  const detourPenalty = localDetour(from, to, route.distanceMeters) ? 1_000_000 : 0;
  return route.distanceMeters + corridorPenalty + detourPenalty;
}

function corridorImproves(
  current: RouteGeometry,
  alternative: RouteGeometry,
  from: LngLat,
  to: LngLat,
): boolean {
  const east = eastOfEnds(from, to, current.coordinates);
  if (east <= CORRIDOR_METERS) return false;
  const nextEast = eastOfEnds(from, to, alternative.coordinates);
  return (
    alternative.distanceMeters <= current.distanceMeters * 1.02 &&
    nextEast + CORRIDOR_IMPROVEMENT_METERS < east
  );
}

function keepExisting(existing: RouteSet, key: string): RouteGeometry | null {
  const saved = existing[key];
  if (!saved || !Array.isArray(saved.coordinates) || saved.coordinates.length < 2) {
    return null;
  }
  return saved;
}

function finish(route: RouteGeometry, from: LngLat, to: LngLat): RouteGeometry {
  const coordinates = anchorLine(route.coordinates, from, to);
  return {
    coordinates,
    distanceMeters: Math.round(lineLength(coordinates)),
    source: route.source,
  };
}

function scenic(leg: Leg): boolean {
  return /scenic/i.test(leg.notes ?? "");
}

function needsRepair(leg: Leg, from: LngLat, to: LngLat, route: RouteGeometry): boolean {
  if (scenic(leg)) return false;
  if (leg.mode === "walk" || leg.mode === "bike") {
    return localDetour(from, to, route.distanceMeters);
  }
  if (leg.mode === "car") {
    return (
      shortDriveBow(from, to, route.distanceMeters) ||
      eastOfEnds(from, to, route.coordinates) > CORRIDOR_METERS
    );
  }
  return false;
}

async function collectCandidates(
  leg: Leg,
  from: LngLat,
  to: LngLat,
  token: string | undefined,
): Promise<RouteGeometry[]> {
  const list: RouteGeometry[] = [];
  const mapbox = token ? mapboxProfile(leg.mode) : null;
  if (mapbox && token) {
    list.push(...(await fetchMapboxRoutes(mapbox, [from, to], token)));
  }
  const osrm = osrmProfile(leg.mode);
  if (!osrm) return list;
  list.push(...(await fetchOsrmRoutes(osrm, [from, to])));
  if (leg.via && leg.via.length > 0) {
    const hopped = await routeHops(osrm, [from, ...leg.via, to]);
    if (hopped) list.push(hopped);
  }
  return list;
}

function chooseReplacement(
  leg: Leg,
  saved: RouteGeometry | null,
  candidates: RouteGeometry[],
  from: LngLat,
  to: LngLat,
): RouteGeometry | null {
  if (candidates.length === 0) return null;
  const best = (pool: RouteGeometry[]) =>
    [...pool].sort((a, b) => rank(a, from, to) - rank(b, from, to))[0] ?? null;
  if (!saved) return best(candidates);

  if ((leg.mode === "walk" || leg.mode === "bike") && localDetour(from, to, saved.distanceMeters)) {
    const better = candidates.filter(
      (candidate) =>
        !localDetour(from, to, candidate.distanceMeters) ||
        candidate.distanceMeters < saved.distanceMeters,
    );
    return best(better.length > 0 ? better : candidates);
  }

  if (leg.mode === "car" && shortDriveBow(from, to, saved.distanceMeters)) {
    const better = candidates.filter(
      (candidate) =>
        candidate.distanceMeters + 400 < saved.distanceMeters &&
        eastOfEnds(from, to, candidate.coordinates) <= CORRIDOR_METERS + 1_000,
    );
    return [...better].sort((a, b) => a.distanceMeters - b.distanceMeters)[0] ?? null;
  }

  if (leg.mode === "car" && eastOfEnds(from, to, saved.coordinates) > CORRIDOR_METERS) {
    const better = candidates.filter((candidate) => corridorImproves(saved, candidate, from, to));
    return best(better);
  }

  return null;
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
    return finish(geometry(curved(from, leg.via, to), "sketch"), from, to);
  }

  const saved = keepExisting(existing, key);
  if (!osrmProfile(leg.mode)) {
    return finish(saved ?? geometry(curved(from, leg.via, to), "sketch"), from, to);
  }

  if (saved && !needsRepair(leg, from, to, saved)) {
    return finish(saved, from, to);
  }

  const replacement = chooseReplacement(
    leg,
    saved,
    await collectCandidates(leg, from, to, token),
    from,
    to,
  );
  if (replacement) {
    console.log(`  replaced ${key}`);
    return finish(replacement, from, to);
  }
  if (saved) return finish(saved, from, to);
  return finish(geometry(curved(from, leg.via, to), "sketch"), from, to);
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
