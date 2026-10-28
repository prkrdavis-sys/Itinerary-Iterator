import path from "node:path";
import { z } from "zod";
import generated from "../data/routes.generated.json";
import type { LngLat } from "./geo";
import { getItinerary, legKey } from "./itinerary";
import { coordSchema } from "./schema";

export type RouteSource = "mapbox" | "osrm" | "sketch";

export type RouteGeometry = {
  coordinates: LngLat[];
  distanceMeters: number;
  source: RouteSource;
};

export type RouteSet = Record<string, RouteGeometry>;

const routeGeometrySchema = z.object({
  coordinates: z.array(coordSchema).min(2),
  distanceMeters: z.number().nonnegative(),
  source: z.enum(["mapbox", "osrm", "sketch"]),
});

const routeFileSchema = z.record(z.string(), routeGeometrySchema);

export function routesPath(): string {
  return path.join(process.cwd(), "data", "routes.generated.json");
}

export function getRoutes(): RouteSet {
  const itinerary = getItinerary();
  const parsed = routeFileSchema.safeParse(generated);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`data/routes.generated.json failed validation\n${details}`);
  }

  const missing = itinerary.legs.filter((leg) => {
    const route = parsed.data[legKey(leg.from, leg.to)];
    return !route || route.coordinates.length < 2;
  });
  if (missing.length > 0) {
    const ids = missing.map((leg) => legKey(leg.from, leg.to)).join(", ");
    throw new Error(`Route geometry is missing for: ${ids}`);
  }

  return parsed.data;
}
