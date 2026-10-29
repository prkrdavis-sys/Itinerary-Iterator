import { z } from "zod";

const DB_NAME = "itinerary-iterator";
const STORE = "map";
const RECORD_KEY = "archive";

const archiveSchema = z.object({
  file: z.literal("/maps/trip.pmtiles"),
  bytes: z.number().int().positive(),
  revision: z.string().min(8),
});

type StoredArchive = {
  revision: string;
  blob: Blob;
};

export type MapSaveStatus = "saving" | "saved" | "error";

export function mapSaveMessage(status: MapSaveStatus): string {
  switch (status) {
    case "saving":
      return "Saving the map on this phone";
    case "saved":
      return "Saved on this phone";
    case "error":
      return "This phone could not store the map";
    default: {
      const neverStatus: never = status;
      return neverStatus;
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage"));
  });
}

async function readStored(): Promise<StoredArchive | null> {
  const db = await openDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not read the saved map"));
    });
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<StoredArchive>;
    if (typeof record.revision !== "string" || !(record.blob instanceof Blob)) return null;
    if (record.blob.size === 0) return null;
    return { revision: record.revision, blob: record.blob };
  } finally {
    db.close();
  }
}

async function writeStored(archive: StoredArchive): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(archive, RECORD_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not store the map"));
    });
  } finally {
    db.close();
  }
}

async function loadManifest(): Promise<z.infer<typeof archiveSchema>> {
  const response = await fetch("/maps/archive.json");
  if (!response.ok) throw new Error("Map archive is missing");
  const parsed = archiveSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Map archive is unreadable");
  return parsed.data;
}

async function downloadArchive(file: string): Promise<Blob> {
  const response = await fetch(file);
  if (!response.ok) throw new Error("Map download failed");
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("Map download was empty");
  return blob;
}

async function persistStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // The archive is still stored. The browser may reclaim it under pressure.
  }
}

const PMTILES_MAGIC = 0x4d50;

async function readableArchive(blob: Blob, bytes: number): Promise<boolean> {
  if (blob.size !== bytes || blob.size < 127) return false;
  try {
    const header = new DataView(await blob.slice(0, 8).arrayBuffer());
    if (header.getUint16(0, true) !== PMTILES_MAGIC) return false;
    const tail = await blob.slice(blob.size - 1, blob.size).arrayBuffer();
    return tail.byteLength === 1;
  } catch {
    return false;
  }
}

export async function ensureMapArchive(): Promise<Blob> {
  const stored = await readStored().catch(() => null);
  let manifest: z.infer<typeof archiveSchema> | null = null;
  try {
    manifest = await loadManifest();
  } catch (error) {
    if (stored && (await readableArchive(stored.blob, stored.blob.size))) return stored.blob;
    throw error;
  }
  const storedMatches =
    stored?.revision === manifest.revision &&
    (await readableArchive(stored.blob, manifest.bytes).catch(() => false));
  if (storedMatches && stored) return stored.blob;
  if (!navigator.onLine) {
    if (stored && (await readableArchive(stored.blob, stored.blob.size))) return stored.blob;
    throw new Error("This phone is offline and has no saved map");
  }
  try {
    const blob = await downloadArchive(manifest.file);
    if (!(await readableArchive(blob, manifest.bytes))) {
      throw new Error("Map download was unreadable");
    }
    await writeStored({ revision: manifest.revision, blob });
    await persistStorage();
    return blob;
  } catch (error) {
    if (stored && (await readableArchive(stored.blob, stored.blob.size))) return stored.blob;
    throw error;
  }
}
