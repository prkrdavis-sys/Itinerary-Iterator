import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    case "bus":
      return "driving";
    case "bike":
      return "cycling";
    case "walk":
      return "walking";
    case "train":
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
    case "bus":
      return "driving";
    case "bike":
      return "bike";
    case "walk":
      return "foot";
    case "train":
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

const STATION_SEARCH_METERS = 3_000;
const PLATFORM_METERS = 350;
const WALK_GAP_METERS = 120;
const RAIL_MARGIN_DEGREES = 0.04;
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const onVercel = process.env.VERCEL === "1";
const OVERPASS_TIMEOUT_MS = onVercel ? 25_000 : 150_000;
const OVERPASS_ATTEMPTS = onVercel ? 1 : OVERPASS_URLS.length * 2;

let tripRailNetwork: OverpassElement[] | null = null;

type OverpassElement =
  | { type: "way"; nodes: number[]; geometry: { lat: number; lon: number }[] }
  | { type: "node"; lat: number; lon: number };

async function queryOverpass(url: string, query: string): Promise<OverpassElement[] | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "itinerary-iterator",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`overpass responded ${response.status}`);
      return null;
    }
    const payload = (await response.json()) as { elements?: OverpassElement[]; remark?: string };
    if (payload.remark) {
      console.warn(`overpass remark: ${payload.remark}`);
      return null;
    }
    return payload.elements ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.warn(`overpass request failed: ${message}`);
    return null;
  }
}

async function fetchRailNetwork(points: LngLat[]): Promise<OverpassElement[]> {
  if (onVercel) return [];
  if (tripRailNetwork) return tripRailNetwork;

  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const bbox = [
    Math.min(...lats) - RAIL_MARGIN_DEGREES,
    Math.min(...lngs) - RAIL_MARGIN_DEGREES,
    Math.max(...lats) + RAIL_MARGIN_DEGREES,
    Math.max(...lngs) + RAIL_MARGIN_DEGREES,
  ].join(",");
  const query =
    `[out:json][timeout:120];(` +
    `way["railway"~"^(rail|subway|light_rail)$"]["service"!~"^(yard|siding|spur)$"](${bbox});` +
    `node["railway"~"^(station|halt)$"](${bbox});` +
    `);out geom;`;
  for (let attempt = 0; attempt < OVERPASS_ATTEMPTS; attempt += 1) {
    const elements = await queryOverpass(OVERPASS_URLS[attempt % OVERPASS_URLS.length], query);
    if (elements) {
      tripRailNetwork = elements;
      return elements;
    }
    if (attempt + 1 < OVERPASS_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
    }
  }
  tripRailNetwork = [];
  return [];
}

class MinHeap {
  private items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: [number, number]): void {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent][0] <= items[index][0]) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }

  pop(): [number, number] | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

async function walkBetween(from: LngLat, to: LngLat): Promise<LngLat[]> {
  if (haversine(from, to) < WALK_GAP_METERS) return [from, to];
  const walk = (await fetchOsrmRoutes("foot", [from, to]))[0];
  return walk ? [from, ...walk.coordinates, to] : [from, to];
}

async function fetchRailRoute(from: LngLat, to: LngLat): Promise<RouteGeometry | null> {
  const elements = await fetchRailNetwork([from, to]);
  const coords = new Map<number, LngLat>();
  const edges = new Map<number, [number, number][]>();
  const stations: LngLat[] = [];
  const link = (a: number, b: number, meters: number) => {
    const list = edges.get(a) ?? [];
    list.push([b, meters]);
    edges.set(a, list);
  };
  for (const element of elements) {
    if (element.type === "node") {
      stations.push([element.lon, element.lat]);
      continue;
    }
    if (element.geometry?.length !== element.nodes?.length) continue;
    element.nodes.forEach((id, index) => {
      const point = element.geometry[index];
      coords.set(id, [point.lon, point.lat]);
      if (index === 0) return;
      const prevId = element.nodes[index - 1];
      const prevPoint = element.geometry[index - 1];
      const meters = haversine([prevPoint.lon, prevPoint.lat], [point.lon, point.lat]);
      link(prevId, id, meters);
      link(id, prevId, meters);
    });
  }
  if (coords.size === 0) return null;

  const stationsNear = (target: LngLat): LngLat[] =>
    stations
      .map((station) => ({ station, distance: haversine(station, target) }))
      .filter((entry) => entry.distance <= STATION_SEARCH_METERS)
      .sort((x, y) => x.distance - y.distance)
      .slice(0, 15)
      .map((entry) => entry.station);
  const platformNodes = (station: LngLat): Set<number> => {
    const ids = new Set<number>();
    for (const [id, point] of coords) {
      if (haversine(point, station) <= PLATFORM_METERS) ids.add(id);
    }
    return ids;
  };

  const endStations = stationsNear(to).map((station) => ({ station, platforms: platformNodes(station) }));
  let reached: number | null = null;
  let prev = new Map<number, number>();
  let startStation: LngLat | null = null;
  let endStation: LngLat | null = null;
  for (const candidate of stationsNear(from)) {
    const sources = platformNodes(candidate);
    if (sources.size === 0) continue;
    const dist = new Map<number, number>();
    prev = new Map<number, number>();
    const heap = new MinHeap();
    for (const id of sources) {
      dist.set(id, 0);
      heap.push([0, id]);
    }
    while (heap.size > 0) {
      const [cost, node] = heap.pop()!;
      if (cost > (dist.get(node) ?? Infinity)) continue;
      for (const [next, meters] of edges.get(node) ?? []) {
        const nextCost = cost + meters;
        if (nextCost < (dist.get(next) ?? Infinity)) {
          dist.set(next, nextCost);
          prev.set(next, node);
          heap.push([nextCost, next]);
        }
      }
    }
    let bestScore = Infinity;
    for (const { station, platforms } of endStations) {
      const straight = haversine(candidate, station);
      if (straight < 500) continue;
      for (const id of platforms) {
        const meters = dist.get(id);
        if (meters === undefined || meters > straight * 2.5 + 2_000) continue;
        const score = meters + haversine(station, to) * 4;
        if (score < bestScore) {
          bestScore = score;
          reached = id;
          startStation = candidate;
          endStation = station;
        }
      }
    }
    if (reached !== null) break;
  }
  if (reached === null || !startStation || !endStation) return null;

  const track: LngLat[] = [];
  for (let node: number | undefined = reached; node !== undefined; node = prev.get(node)) {
    const point = coords.get(node);
    if (point) track.unshift(point);
  }
  if (track.length < 2) return null;

  const line = joinLines([
    await walkBetween(from, track[0]),
    track,
    await walkBetween(track[track.length - 1], to),
  ]);
  return geometry(line, "rail");
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
  const saved = keepExisting(existing, key);
  if (leg.mode === "train") {
    if (saved?.source === "rail") return finish(saved, from, to);
    if (onVercel && saved) return finish(saved, from, to);
    const rail =
      (await fetchRailRoute(from, to)) ??
      (await fetchOsrmRoutes("driving", [from, to]))[0] ??
      null;
    return finish(rail ?? geometry(curved(from, leg.via, to), "sketch"), from, to);
  }

  if (!osrmProfile(leg.mode)) {
    return finish(saved ?? geometry(curved(from, leg.via, to), "sketch"), from, to);
  }

  if (saved && saved.source !== "sketch" && !needsRepair(leg, from, to, saved)) {
    return finish(saved, from, to);
  }

  const replacement = chooseReplacement(
    leg,
    saved?.source === "sketch" ? null : saved,
    await collectCandidates(leg, from, to, token),
    from,
    to,
  );
  if (replacement) {
    console.log(`  replaced ${key}`);
    return finish(replacement, from, to);
  }
  if (saved && saved.source !== "sketch") return finish(saved, from, to);
  return finish(geometry(curved(from, leg.via, to), "sketch"), from, to);
}

async function main(): Promise<void> {
  if (onVercel && existsSync(routesPath())) {
    console.log("Skipping route regeneration on Vercel (using committed routes.generated.json)");
    return;
  }

  const itinerary = getItinerary();
  const existing = readExisting();
  const token = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const routes: RouteSet = {};
  const stops = new Map(itinerary.stops.map((stop) => [stop.id, stop]));

  if (!onVercel) {
    await fetchRailNetwork(itinerary.stops.map((stop) => stop.coords));
  }

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
