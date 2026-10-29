import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export const ARCHIVE_KEY = "trip.pmtiles";

export function localBasemapStyle(origin: string): StyleSpecification {
  const root = origin.replace(/\/$/, "");
  return {
    version: 8,
    glyphs: `${root}/map-assets/fonts/{fontstack}/{range}.pbf`,
    sprite: `${root}/map-assets/sprites/dark`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${ARCHIVE_KEY}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("dark"), { lang: "en" }) as StyleSpecification["layers"],
  };
}
