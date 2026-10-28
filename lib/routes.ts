import { readFileSync } from "node:fs";
import path from "node:path";
import type { LngLat } from "./geo";
import { getItinerary, legKey } from "./itinerary";

export type RouteSource = "mapbox" | "osrm" | "sketch";

export type RouteGeometry = {
  coordinates: LngLat[];
  distanceMeters: number;
  source: RouteSource;
};

export type RouteSet = Record<string, RouteGeometry>;

export function routesPath(): string {
  return path.join(process.cwd(), "data", "routes.generated.json");
}

export function getRoutes(): RouteSet {
  const itinerary = getItinerary();
  let parsed: RouteSet;
  try {
    parsed = JSON.parse(readFileSync(routesPath(), "utf8")) as RouteSet;
  } catch {
    throw new Error(
      "data/routes.generated.json is missing. Run npm run routes before building.",
    );
  }

  const missing = itinerary.legs.filter((leg) => {
    const route = parsed[legKey(leg.from, leg.to)];
    return !route || route.coordinates.length < 2;
  });
  if (missing.length > 0) {
    const ids = missing.map((leg) => legKey(leg.from, leg.to)).join(", ");
    throw new Error(`Route geometry is missing for: ${ids}`);
  }

  return parsed;
}
