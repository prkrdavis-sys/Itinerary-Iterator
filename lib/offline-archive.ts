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

export async function ensureMapArchive(): Promise<Blob> {
  const stored = await readStored().catch(() => null);
  let manifest: z.infer<typeof archiveSchema> | null = null;
  try {
    manifest = await loadManifest();
  } catch (error) {
    if (stored) return stored.blob;
    throw error;
  }
  if (stored?.revision === manifest.revision) return stored.blob;
  if (!navigator.onLine) {
    if (stored) return stored.blob;
    throw new Error("This phone is offline and has no saved map");
  }
  try {
    const blob = await downloadArchive(manifest.file);
    await writeStored({ revision: manifest.revision, blob });
    await persistStorage();
    return blob;
  } catch (error) {
    if (stored) return stored.blob;
    throw error;
  }
}
