import type { MetadataRoute } from "next";
import { getItinerary } from "@/lib/itinerary";

export default function manifest(): MetadataRoute.Manifest {
  const trip = getItinerary().trip;
  return {
    name: trip.title,
    short_name: "Canals",
    description: trip.subtitle,
    start_url: "/",
    display: "standalone",
    background_color: "#100e0c",
    theme_color: "#100e0c",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
