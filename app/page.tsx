import { TripApp } from "@/components/TripApp";
import { getItinerary } from "@/lib/itinerary";
import { getRoutes } from "@/lib/routes";

export default function Home() {
  const itinerary = getItinerary();
  const routes = getRoutes();

  return (
    <main className="stage">
      <TripApp itinerary={itinerary} routes={routes} />
    </main>
  );
}
