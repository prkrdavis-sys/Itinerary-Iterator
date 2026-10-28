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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dateParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function formatRange(start: string, end: string): string {
  const from = dateParts(start);
  const to = dateParts(end);
  const startMonth = MONTHS[from.month - 1] ?? "";
  const endMonth = MONTHS[to.month - 1] ?? "";
  if (from.month === to.month && from.year === to.year) {
    return `${from.day}–${to.day} ${startMonth} ${from.year}`;
  }
  return `${from.day} ${startMonth} – ${to.day} ${endMonth} ${to.year}`;
}

export function dateForDay(start: string, day: number): string {
  const parts = dateParts(start);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + day - 1));
  const weekday = WEEKDAYS[utc.getUTCDay()];
  const month = MONTHS[utc.getUTCMonth()];
  return `${weekday} ${utc.getUTCDate()} ${month}`;
}

export function legIndexFrom(itinerary: Itinerary, stopId: string): number {
  return itinerary.legs.findIndex((leg) => leg.from === stopId);
}
