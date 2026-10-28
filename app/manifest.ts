import type { MetadataRoute } from "next";
import { getItinerary } from "@/lib/itinerary";

export default function manifest(): MetadataRoute.Manifest {
  const trip = getItinerary().trip;
  return {
    name: trip.title,
    short_name: "Halloween",
    description: trip.subtitle,
    start_url: "/",
    display: "standalone",
    background_color: "#100e0c",
    theme_color: "#100e0c",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
