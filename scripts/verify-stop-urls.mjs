import { readFileSync } from "node:fs";

const stops = JSON.parse(readFileSync("data/itinerary.json", "utf8")).stops;
const missing = [];
const failed = [];

for (const stop of stops) {
  if (!stop.url) {
    missing.push(stop.id);
    continue;
  }
  try {
    const response = await fetch(stop.url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Itinerary-Iterator/1.0 (link check)" },
    });
    if (!response.ok) {
      failed.push({ id: stop.id, url: stop.url, status: response.status });
    }
  } catch (error) {
    failed.push({
      id: stop.id,
      url: stop.url,
      status: error instanceof Error ? error.message : "error",
    });
  }
}

console.log(JSON.stringify({ missing, failed }, null, 2));
