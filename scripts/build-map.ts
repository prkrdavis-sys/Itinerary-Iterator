import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";
import { haversine, type LngLat } from "../lib/geo";
import { getItinerary, legKey } from "../lib/itinerary";
import { getRoutes } from "../lib/routes";

const PMTILES_VERSION = "1.31.2";
const MAX_BYTES = 50 * 1024 * 1024;
const SOURCE_VERSION = "4";
const CLOSE_LEG_METERS = 25_000;
const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Italic", "Noto Sans Medium"] as const;
const FONT_RANGES = ["0-255", "256-511", "512-767", "768-1023"] as const;
const SPRITES = ["dark.json", "dark.png", "dark@2x.json", "dark@2x.png"] as const;

const root = process.cwd();
const cacheDir = path.join(root, "scripts", ".cache");
const mapsDir = path.join(root, "public", "maps");
const archivePath = path.join(mapsDir, "trip.pmtiles");
const archiveMetaPath = path.join(mapsDir, "archive.json");
const assetsDir = path.join(root, "public", "map-assets");

type ArchiveMeta = {
  file: "/maps/trip.pmtiles";
  bytes: number;
  revision: string;
  source: string;
};

// "trip" follows every stop and route. "close" follows only the places the camera
// zooms into: stops, walking, biking, and bus legs, and short hops of any mode.
type Reach = "trip" | "close";

type Band = {
  minZoom: number;
  maxZoom: number;
  reach: Reach;
  bufferMeters: number;
};

// Each band covers enough ground for the pitched camera at that zoom to see tiles to
// the edge of the screen. Plans run widest first; the first that fits the budget wins.
function plan(kilometers: [number, number, number, number, number, number, number]): Band[] {
  const [world, z8, z9, z10, z11, z12, z13] = kilometers.map((km) => km * 1000);
  return [
    { minZoom: 0, maxZoom: 7, reach: "trip", bufferMeters: world },
    { minZoom: 8, maxZoom: 8, reach: "trip", bufferMeters: z8 },
    { minZoom: 9, maxZoom: 9, reach: "trip", bufferMeters: z9 },
    { minZoom: 10, maxZoom: 10, reach: "trip", bufferMeters: z10 },
    { minZoom: 11, maxZoom: 11, reach: "trip", bufferMeters: z11 },
    { minZoom: 12, maxZoom: 12, reach: "close", bufferMeters: z12 },
    { minZoom: 13, maxZoom: 13, reach: "close", bufferMeters: z13 },
  ];
}

const PLANS: Band[][] = [
  plan([200, 100, 60, 30, 16, 9, 5]),
  plan([150, 80, 50, 25, 12, 6, 3]),
  plan([150, 80, 45, 22, 10, 5, 2.5]),
  plan([120, 60, 40, 18, 8, 4, 2]),
  plan([100, 50, 30, 14, 6, 3, 1.5]),
];

function bufferRing(point: LngLat, meters: number): LngLat[] {
  const [lng, lat] = point;
  const latRad = (lat * Math.PI) / 180;
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos(latRad));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}

function sampleLine(coords: LngLat[], spacing: number): LngLat[] {
  const kept: LngLat[] = [];
  for (const point of coords) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(point);
      continue;
    }
    const distance = haversine(last, point);
    if (distance === 0) continue;
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      kept.push([
        last[0] + (point[0] - last[0]) * t,
        last[1] + (point[1] - last[1]) * t,
      ]);
    }
  }
  return kept;
}

function tileKey(lng: number, lat: number, zoom: number): string {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return `${zoom}/${x}/${y}`;
}

function reachLines(reach: Reach): LngLat[][] {
  const itinerary = getItinerary();
  const routes = getRoutes();
  const lines: LngLat[][] = itinerary.stops.map((stop) => [stop.coords]);
  for (const leg of itinerary.legs) {
    const route = routes[legKey(leg.from, leg.to)];
    if (!route) continue;
    const close =
      leg.mode === "walk" ||
      leg.mode === "bike" ||
      leg.mode === "bus" ||
      route.distanceMeters <= CLOSE_LEG_METERS;
    if (reach === "trip" || close) lines.push(route.coordinates);
  }
  return lines;
}

async function assertRouteCovered(bands: Band[]): Promise<void> {
  const bytes = readFileSync(archivePath);
  const source: Source = {
    getKey: () => "trip.pmtiles",
    async getBytes(offset: number, length: number): Promise<RangeResponse> {
      const slice = bytes.subarray(offset, Math.min(bytes.length, offset + length));
      const copy = new Uint8Array(slice.byteLength);
      copy.set(slice);
      return { data: copy.buffer };
    },
  };
  const archive = new PMTiles(source);
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const band of bands) {
    const coords = reachLines(band.reach).flat();
    for (let zoom = band.minZoom; zoom <= band.maxZoom; zoom += 1) {
      for (const [lng, lat] of coords) {
        const key = tileKey(lng, lat, zoom);
        if (seen.has(key)) continue;
        seen.add(key);
        const [z, x, y] = key.split("/").map(Number);
        const tile = await archive.getZxy(z, x, y);
        if (!tile) missing.push(key);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Map extract is missing ${missing.length} tiles under the route, first ${missing[0]}`,
    );
  }
  console.log(`route coverage ${seen.size} tiles`);
}

function regionJson(band: Band): string {
  const spacing = band.bufferMeters / 2;
  const points = reachLines(band.reach).flatMap((line) => sampleLine(line, spacing));
  const features = points.map((point) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [bufferRing(point, band.bufferMeters)] },
  }));
  return JSON.stringify({ type: "FeatureCollection", features });
}

function bandName(band: Band): string {
  return `band-${band.minZoom}-${band.maxZoom}-${band.reach}-${band.bufferMeters}`;
}

function writeRegion(band: Band): string {
  const file = path.join(cacheDir, `${bandName(band)}.geojson`);
  writeFileSync(file, regionJson(band));
  return file;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readArchiveMeta(): ArchiveMeta | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(archiveMetaPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<ArchiveMeta>;
    if (record.file !== "/maps/trip.pmtiles") return null;
    if (typeof record.bytes !== "number" || typeof record.revision !== "string") return null;
    if (typeof record.source !== "string") return null;
    return {
      file: "/maps/trip.pmtiles",
      bytes: record.bytes,
      revision: record.revision,
      source: record.source,
    };
  } catch {
    return null;
  }
}

function writeArchiveMeta(source: string): void {
  const bytes = statSync(archivePath).size;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Map extract is ${Math.ceil(bytes / (1024 * 1024))} MB, over the 50 MB phone limit`,
    );
  }
  const meta: ArchiveMeta = {
    file: "/maps/trip.pmtiles",
    bytes,
    revision: sha256(readFileSync(archivePath)),
    source,
  };
  writeFileSync(archiveMetaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`map archive ${Math.ceil(bytes / (1024 * 1024))} MB ${meta.revision.slice(0, 12)}`);
}

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
}

async function ensureFile(url: string, dest: string): Promise<void> {
  if (existsSync(dest) && statSync(dest).size > 0) return;
  await download(url, dest);
}

function cliAsset(): { url: string; archive: "zip" | "tar" } {
  const base = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}`;
  switch (`${process.platform}-${process.arch}`) {
    case "darwin-arm64":
      return {
        url: `${base}/go-pmtiles-${PMTILES_VERSION}_Darwin_arm64.zip`,
        archive: "zip",
      };
    case "darwin-x64":
      return {
        url: `${base}/go-pmtiles-${PMTILES_VERSION}_Darwin_x86_64.zip`,
        archive: "zip",
      };
    case "linux-x64":
      return {
        url: `${base}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz`,
        archive: "tar",
      };
    case "linux-arm64":
      return {
        url: `${base}/go-pmtiles_${PMTILES_VERSION}_Linux_arm64.tar.gz`,
        archive: "tar",
      };
    default:
      throw new Error(`No pmtiles CLI build for ${process.platform} ${process.arch}`);
  }
}

function findBinary(dir: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findBinary(full);
      if (nested) return nested;
    } else if (entry.name === "pmtiles" || entry.name === "pmtiles.exe") {
      return full;
    }
  }
  return null;
}

async function ensureCli(): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const existing = findBinary(cacheDir);
  if (existing) {
    chmodSync(existing, 0o755);
    return existing;
  }
  const asset = cliAsset();
  const packed = path.join(cacheDir, path.basename(asset.url));
  console.log(`downloading ${asset.url}`);
  await download(asset.url, packed);
  const extracted =
    asset.archive === "zip"
      ? spawnSync("unzip", ["-o", packed, "-d", cacheDir], { stdio: "inherit" })
      : spawnSync("tar", ["-xzf", packed, "-C", cacheDir], { stdio: "inherit" });
  if (extracted.status !== 0) throw new Error(`Could not unpack ${packed}`);
  const binary = findBinary(cacheDir);
  if (!binary) throw new Error("pmtiles CLI archive did not contain a pmtiles binary");
  chmodSync(binary, 0o755);
  return binary;
}

function archiveSize(log: string): number | null {
  const match = log.match(/archive size of ([\d.]+) (kB|MB|GB)/);
  const unit = match?.[2];
  if (!match?.[1] || (unit !== "kB" && unit !== "MB" && unit !== "GB")) return null;
  const amount = Number(match[1]);
  switch (unit) {
    case "GB":
      return amount * 1024 * 1024 * 1024;
    case "MB":
      return amount * 1024 * 1024;
    case "kB":
      return amount * 1024;
    default: {
      const neverUnit: never = unit;
      return neverUnit;
    }
  }
}

function bandArgs(band: Band, region: string): string[] {
  return [`--region=${region}`, `--minzoom=${band.minZoom}`, `--maxzoom=${band.maxZoom}`];
}

const estimates = new Map<string, number>();

function estimateBytes(binary: string, planet: string, band: Band): number {
  const name = bandName(band);
  const known = estimates.get(name);
  if (known !== undefined) return known;
  const result = spawnSync(
    binary,
    [
      "extract",
      planet,
      path.join(cacheDir, "estimate.pmtiles"),
      ...bandArgs(band, writeRegion(band)),
      "--dry-run",
    ],
    { encoding: "utf8" },
  );
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const bytes = archiveSize(log);
  if (result.status !== 0 || bytes === null) {
    throw new Error(`Could not estimate ${name}\n${log}`);
  }
  estimates.set(name, bytes);
  return bytes;
}

function planBytes(binary: string, planet: string, bands: Band[]): number {
  return bands.reduce((total, band) => total + estimateBytes(binary, planet, band), 0);
}

function describe(bands: Band[]): string {
  return bands
    .map((band) => {
      const zooms = band.minZoom === band.maxZoom ? `z${band.minZoom}` : `z${band.minZoom}–${band.maxZoom}`;
      return `${zooms} ${band.reach} ${band.bufferMeters / 1000} km`;
    })
    .join(", ");
}

async function latestPlanet(): Promise<string> {
  const now = new Date();
  for (let ago = 0; ago < 21; ago += 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ago));
    const stamp = [
      day.getUTCFullYear(),
      String(day.getUTCMonth() + 1).padStart(2, "0"),
      String(day.getUTCDate()).padStart(2, "0"),
    ].join("");
    const url = `https://build.protomaps.com/${stamp}.pmtiles`;
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return url;
  }
  throw new Error("No recent Protomaps planet build responded");
}

async function vendorAssets(): Promise<void> {
  const jobs: Array<Promise<void>> = [];
  for (const name of SPRITES) {
    jobs.push(
      ensureFile(
        `https://protomaps.github.io/basemaps-assets/sprites/v4/${name}`,
        path.join(assetsDir, "sprites", name),
      ),
    );
  }
  for (const stack of FONT_STACKS) {
    for (const range of FONT_RANGES) {
      jobs.push(
        ensureFile(
          `https://protomaps.github.io/basemaps-assets/fonts/${encodeURIComponent(stack)}/${range}.pbf`,
          path.join(assetsDir, "fonts", stack, `${range}.pbf`),
        ),
      );
    }
  }
  await Promise.all(jobs);
}

async function main(): Promise<void> {
  mkdirSync(mapsDir, { recursive: true });
  if (process.env.VERCEL === "1") {
    if (!existsSync(archivePath)) {
      throw new Error(
        "public/maps/trip.pmtiles is missing. Commit the offline map extract for Vercel builds.",
      );
    }
    console.log("Using committed map extract on Vercel");
    await vendorAssets();
    return;
  }

  await vendorAssets();
  const regions = PLANS.flat().map((band) => `${bandName(band)}\n${regionJson(band)}`);
  const source = sha256(`${SOURCE_VERSION}\n${regions.join("\n")}`);
  const existing = readArchiveMeta();
  if (
    existing?.source === source &&
    existsSync(archivePath) &&
    statSync(archivePath).size === existing.bytes &&
    existing.bytes > 0 &&
    existing.bytes <= MAX_BYTES
  ) {
    console.log("map extract is current");
    return;
  }

  mkdirSync(cacheDir, { recursive: true });
  const binary = await ensureCli();
  const planet = await latestPlanet();
  let chosen: Band[] | null = null;
  for (const bands of PLANS) {
    const bytes = planBytes(binary, planet, bands);
    console.log(`${describe(bands)} is about ${Math.ceil(bytes / (1024 * 1024))} MB`);
    if (bytes <= MAX_BYTES) {
      chosen = bands;
      break;
    }
  }
  if (!chosen) {
    throw new Error("The trip corridor does not fit in 50 MB even with the narrowest plan");
  }

  console.log(`extracting ${describe(chosen)} from ${planet}`);
  const parts: string[] = [];
  for (const band of chosen) {
    const part = path.join(cacheDir, `${bandName(band)}.pmtiles`);
    const extracted = spawnSync(
      binary,
      ["extract", planet, part, ...bandArgs(band, writeRegion(band)), "--download-threads=8"],
      { stdio: "inherit" },
    );
    if (extracted.status !== 0) throw new Error(`pmtiles extract failed for ${bandName(band)}`);
    parts.push(part);
  }
  const mergedPath = path.join(cacheDir, "merged.pmtiles");
  rmSync(mergedPath, { force: true });
  const merged = spawnSync(binary, ["merge", ...parts, mergedPath], { stdio: "inherit" });
  if (merged.status !== 0) throw new Error("pmtiles merge failed");
  copyFileSync(mergedPath, archivePath);
  await assertRouteCovered(chosen);
  writeArchiveMeta(source);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "map build failed";
  console.error(message);
  process.exit(1);
});
