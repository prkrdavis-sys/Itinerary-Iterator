# Grokbot prompt

Copy everything below the line into Grokbot. Ask it to return one JSON object and nothing else. Replace `data/itinerary.json` with that object. The file must pass `npm run validate`.

Grokbot can read the current trip from this public raw URL before editing it:

https://raw.githubusercontent.com/prkrdavis-sys/Itinerary-Iterator/main/data/itinerary.json

A Cursor-hosted repository is not public. Do not point Grokbot at a cursor.com codebase URL.

---

You are editing a trip file for an animated map. Return only valid JSON, no markdown fence, matching this shape exactly.

```json
{
  "trip": {
    "title": "string",
    "subtitle": "string",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "travelers": "short phrase, not a list of private full names"
  },
  "stops": [
    {
      "id": "lowercase-slug",
      "city": "string",
      "name": "string",
      "coords": [4.885, 52.36],
      "day": 1,
      "start": "10:00",
      "end": "12:30",
      "category": "museum",
      "emoji": "🖼️",
      "description": "one short factual line",
      "url": "https://example.com/official-page",
      "photos": ["https://example.com/one.jpg", "https://example.com/two.jpg"],
      "tips": []
    }
  ],
  "legs": [
    {
      "from": "previous-stop-id",
      "to": "next-stop-id",
      "mode": "train",
      "depart": "13:10",
      "arrive": "14:20",
      "notes": "optional",
      "via": [[4.83, 52.36]]
    }
  ]
}
```

Rules:

- `coords` and every `via` point are `[longitude, latitude]`.
- `category` is one of: museum, food, sight, stay, transit, neighborhood, activity.
- `mode` is one of: car, train, bike, bus, walk.
- There is exactly one leg between each consecutive pair of stops, in the same order as `stops`. The first stop has no incoming leg.
- `depart`, `arrive`, `notes`, `via`, `url`, `emoji`, and `photos` may be omitted. `tips` may be an empty array. `photos` is up to four image URLs. When a stop already has `emoji` or `photos`, keep them.
- `url` is the place's own webpage, only when one exists. The card shows the name, the time window, the category, how you arrived, an Apple Maps icon, and that link as an icon. Keep `description` to one short fact and leave `tips` empty.
- Times are 24-hour `HH:MM`. A stop's `end` is the same as or after `start`. If a leg has both `depart` and `arrive`, arrive is the same as or after depart.
- For a train or bus that should follow a real corridor instead of roads, add `via` waypoints. The Schiphol–Centraal train and the IJ ferry are drawn by smoothing through those points. Car, bike, and walk legs are routed on roads and do not need `via`.
- Keep ids stable when you are only editing copy, so existing route geometry can be reused.
- Do not invent private personal data. `travelers` stays a short public phrase.
