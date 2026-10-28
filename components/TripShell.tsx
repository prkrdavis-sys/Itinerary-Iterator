"use client";

import dynamic from "next/dynamic";
import type { RouteSet } from "@/lib/routes";
import type { Itinerary } from "@/lib/schema";

const TripApp = dynamic(
  () => import("@/components/TripApp").then((mod) => mod.TripApp),
  {
    ssr: false,
    loading: () => <div className="boot">Unfolding the map</div>,
  },
);

type TripShellProps = {
  itinerary: Itinerary;
  routes: RouteSet;
  mapboxToken: string;
};

export function TripShell({ itinerary, routes }: TripShellProps) {
  return <TripApp itinerary={itinerary} routes={routes} />;
}
