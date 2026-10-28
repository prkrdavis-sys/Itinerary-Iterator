import { readFileSync } from "node:fs";
import path from "node:path";
import { itinerarySchema } from "../lib/schema";

const file = path.join(process.cwd(), "data", "itinerary.json");
const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
const parsed = itinerarySchema.safeParse(raw);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  console.error(`data/itinerary.json failed validation\n${details}`);
  process.exit(1);
}

const { trip, stops, legs } = parsed.data;
console.log(
  `Valid itinerary: ${trip.title} · ${stops.length} stops · ${legs.length} legs`,
);
