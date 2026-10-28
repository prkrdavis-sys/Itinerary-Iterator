# Canals to Canals

An iPhone-first trip map for a late-October run from Amsterdam through a Rotterdam Halloween night, Kinderdijk, Ghent, Damme, and Bruges, with a rental car on the Flemish days. The route draws itself, then a car, train, bike, bus, or walk moves along each leg.

The map is a dark vector extract of this trip, saved on the phone after one online visit. It keeps working with no connection. The dusk Mapbox style in Settings is used only while that phone is online.

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

## Offline on two phones

`npm run build` clips a Protomaps extract around the stops and legs, about 4 km out, into `public/maps/trip.pmtiles` and writes `public/maps/archive.json`. It keeps the highest zoom from 15 down that stays under 50 MB, so a long corridor overzooms the last street levels instead of shipping a file the phone will not store. The `.pmtiles` file is not committed. Sprites and Latin glyphs live in `public/map-assets/` and are part of the app shell.

Each phone keeps its own copy. Nothing is synced between them.

After the site is deployed, on wifi, open it in Safari on each phone, add it to the Home Screen, open that icon, and wait until it says the map is saved on this phone. Then check airplane mode once. Do that again after a deploy that changes the trip, because a phone only picks up a new archive while it is online.

## Mapbox

Route geometry and the offline map both work without a token.

1. Create a token at [mapbox.com](https://account.mapbox.com/access-tokens/).
2. For the dusk Mapbox Standard style while the phone is online, open Settings and paste a public `pk.` token. It stays in this browser only and is not sent to this site. A build-time `NEXT_PUBLIC_MAPBOX_TOKEN` is only a fallback until Settings is saved. Offline, the phone uses the saved map instead.
3. For driving, cycling, and walking geometry at build time, set `MAPBOX_TOKEN`. The route script also accepts `NEXT_PUBLIC_MAPBOX_TOKEN` if that is the only one you have.
4. Put build-time tokens in `.env.local` or the Vercel project. Do not commit them. The in-app Settings token is not a Vercel variable.

Without those variables the route script uses [OSRM](https://project-osrm.org/) for car, bike, and walk. Train and bus legs follow the `via` waypoints in the JSON (the Schiphol–Centraal railway, and the ferry across the IJ).

Rebuild routes after changing stops:

```bash
npm run routes
```

Committed geometry lives in `data/routes.generated.json`. If a directions request fails, the script keeps the previous line for that leg, or draws a simple arc.
