# Canals to Canals

An iPhone-first trip map for a long weekend from Amsterdam to Rotterdam to Bruges. The route draws itself, then a car, train, bike, bus, or walk moves along each leg.

The live site uses a dark OpenFreeMap style when no Mapbox token is set, so it works as soon as it is deployed.

## Edit the trip

`data/itinerary.json` is the only itinerary. Zod in `lib/schema.ts` checks it.

```bash
npm run validate
npm run routes
npm run dev
```

`npm run build` validates the JSON and rebuilds route geometry before Next compiles. Bad data fails the build.

## What Grokbot can read

This GitHub repository is public. Grokbot can read the current plan from the raw file:

https://raw.githubusercontent.com/prkrdavis-sys/Itinerary-Iterator/main/data/itinerary.json

Paste `GROKBOT_PROMPT.md` into Grokbot when you want a replacement JSON file. Commit the result to `data/itinerary.json`.

A Cursor-hosted copy of this repo is not public. Grokbot cannot read that remote. Use the GitHub raw URL above.

## Mapbox

The map and the route build both work without a token.

1. Create a token at [mapbox.com](https://account.mapbox.com/access-tokens/).
2. For the dusk Mapbox Standard style in the browser, set `NEXT_PUBLIC_MAPBOX_TOKEN`.
3. For driving, cycling, and walking geometry at build time, set `MAPBOX_TOKEN`. The route script also accepts `NEXT_PUBLIC_MAPBOX_TOKEN` if that is the only one you have.
4. Put them in `.env.local` for local builds, and in the Vercel project for production. Do not commit either value.

Without those variables the site uses [OpenFreeMap](https://openfreemap.org/) dark tiles and [OSRM](https://project-osrm.org/) for car, bike, and walk. Train and bus legs follow the `via` waypoints in the JSON (the Schiphol–Centraal railway, and the ferry across the IJ).

Rebuild routes after changing stops:

```bash
npm run routes
```

Committed geometry lives in `data/routes.generated.json`. If a directions request fails, the script keeps the previous line for that leg, or draws a simple arc.
