import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { haversine, type LngLat } from "../lib/geo";
import { getItinerary } from "../lib/itinerary";
import { getRoutes } from "../lib/routes";

const PMTILES_VERSION = "1.31.2";
const MAX_BYTES = 50 * 1024 * 1024;
const ZOOM_CHOICES = [15, 14, 13, 12] as const;
const SOURCE_VERSION = "2";
const BUFFER_METERS = 4_000;
const SAMPLE_METERS = 2_000;
const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Italic", "Noto Sans Medium"] as const;
const FONT_RANGES = ["0-255", "256-511", "512-767", "768-1023"] as const;
const SPRITES = ["dark.json", "dark.png", "dark@2x.json", "dark@2x.png"] as const;

const root = process.cwd();
const cacheDir = path.join(root, "scripts", ".cache");
const mapsDir = path.join(root, "public", "maps");
const archivePath = path.join(mapsDir, "trip.pmtiles");
const archiveMetaPath = path.join(mapsDir, "archive.json");
const regionPath = path.join(cacheDir, "region.geojson");
const assetsDir = path.join(root, "public", "map-assets");

type ArchiveMeta = {
  file: "/maps/trip.pmtiles";
  bytes: number;
  revision: string;
  source: string;
};

function bufferRing(point: LngLat): LngLat[] {
  const [lng, lat] = point;
  const latRad = (lat * Math.PI) / 180;
  const dLat = BUFFER_METERS / 111_320;
  const dLng = BUFFER_METERS / (111_320 * Math.cos(latRad));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}

function sampleLine(coords: LngLat[]): LngLat[] {
  const kept: LngLat[] = [];
  for (const point of coords) {
    const last = kept[kept.length - 1];
    if (!last || haversine(last, point) >= SAMPLE_METERS) kept.push(point);
  }
  const end = coords[coords.length - 1];
  const last = kept[kept.length - 1];
  if (end && (!last || haversine(last, end) >= 500)) kept.push(end);
  return kept;
}

function regionJson(): string {
  const itinerary = getItinerary();
  const routes = getRoutes();
  const points: LngLat[] = itinerary.stops.map((stop) => stop.coords);
  for (const route of Object.values(routes)) {
    points.push(...sampleLine(route.coordinates));
  }
  const features = points.map((point) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [bufferRing(point)] },
  }));
  return JSON.stringify({ type: "FeatureCollection", features });
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

function estimateBytes(binary: string, planet: string, zoom: number): number {
  const result = spawnSync(
    binary,
    [
      "extract",
      planet,
      path.join(cacheDir, "estimate.pmtiles"),
      `--region=${regionPath}`,
      `--maxzoom=${zoom}`,
      "--dry-run",
    ],
    { encoding: "utf8" },
  );
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const bytes = archiveSize(log);
  if (result.status !== 0 || bytes === null) {
    throw new Error(`Could not estimate zoom ${zoom}\n${log}`);
  }
  console.log(`zoom 0–${zoom} is about ${Math.ceil(bytes / (1024 * 1024))} MB`);
  return bytes;
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
  await vendorAssets();
  const region = regionJson();
  const source = sha256(`${SOURCE_VERSION}\n${region}`);
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
  writeFileSync(regionPath, region);
  const binary = await ensureCli();
  const planet = await latestPlanet();
  let zoom: (typeof ZOOM_CHOICES)[number] | null = null;
  for (const choice of ZOOM_CHOICES) {
    if (estimateBytes(binary, planet, choice) <= MAX_BYTES) {
      zoom = choice;
      break;
    }
  }
  if (zoom === null) {
    throw new Error("The trip corridor does not fit in 50 MB even at zoom 12");
  }

  console.log(`extracting zoom 0–${zoom} from ${planet}`);
  const extracted = spawnSync(
    binary,
    [
      "extract",
      planet,
      archivePath,
      `--region=${regionPath}`,
      `--maxzoom=${zoom}`,
      "--download-threads=8",
    ],
    { stdio: "inherit" },
  );
  if (extracted.status !== 0) {
    throw new Error("pmtiles extract failed");
  }
  writeArchiveMeta(source);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "map build failed";
  console.error(message);
  process.exit(1);
});
