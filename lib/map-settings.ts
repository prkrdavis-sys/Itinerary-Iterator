export type MapSettings = {
  token: string;
  dusk: boolean;
};

const STORAGE_KEY = "itinerary-iterator.mapbox";

export function publicMapboxToken(value: string): string | null {
  const token = value.trim();
  if (!token.startsWith("pk.")) return null;
  if (token.length < 20 || token.length > 400) return null;
  if (!/^pk\.[A-Za-z0-9\-_.]+$/.test(token)) return null;
  return token;
}

function sanitize(settings: MapSettings): MapSettings {
  const token = publicMapboxToken(settings.token) ?? "";
  return {
    token,
    dusk: settings.dusk && token.length > 0,
  };
}

export function readMapSettings(): MapSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { token: "", dusk: false };
    const record = parsed as { token?: unknown; dusk?: unknown };
    return sanitize({
      token: typeof record.token === "string" ? record.token : "",
      dusk: record.dusk === true,
    });
  } catch {
    return { token: "", dusk: false };
  }
}

export function writeMapSettings(settings: MapSettings): void {
  const safe = sanitize(settings);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Private browsing can reject storage. The choice still applies for this visit.
  }
}
