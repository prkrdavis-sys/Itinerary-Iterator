import raw from "../data/itinerary.json";
import { itinerarySchema, type Itinerary, type Leg, type Stop } from "./schema";

let cached: Itinerary | null = null;

export function getItinerary(): Itinerary {
  if (cached) return cached;
  const parsed = itinerarySchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`data/itinerary.json failed validation\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

export function legKey(from: string, to: string): string {
  return `${from}__${to}`;
}

export function daysOf(itinerary: Itinerary): number[] {
  return [...new Set(itinerary.stops.map((stop) => stop.day))].sort(
    (a, b) => a - b,
  );
}

export function stopsOnDay(itinerary: Itinerary, day: number): Stop[] {
  return itinerary.stops.filter((stop) => stop.day === day);
}

export function findStop(itinerary: Itinerary, id: string): Stop | undefined {
  return itinerary.stops.find((stop) => stop.id === id);
}

export function legInto(itinerary: Itinerary, stopId: string): Leg | undefined {
  return itinerary.legs.find((leg) => leg.to === stopId);
}

export function legOutOf(itinerary: Itinerary, stopId: string): Leg | undefined {
  return itinerary.legs.find((leg) => leg.from === stopId);
}

export function dayCities(itinerary: Itinerary, day: number): string {
  const cities: string[] = [];
  for (const stop of stopsOnDay(itinerary, day)) {
    if (!cities.includes(stop.city)) cities.push(stop.city);
  }
  return cities.join(" · ");
}

export function formatRange(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const startMonth = startDate.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = endDate.toLocaleDateString("en-GB", { month: "short" });
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.getDate()}–${endDate.getDate()} ${startMonth} ${startDate.getFullYear()}`;
  }
  return `${startDate.getDate()} ${startMonth} – ${endDate.getDate()} ${endMonth} ${endDate.getFullYear()}`;
}
