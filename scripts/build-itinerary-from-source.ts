import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { itinerarySchema } from "../lib/schema";

type SourceStop = {
  day: string;
  order: number;
  name: string;
  area: string;
  lonlat: [number, number];
  start: string;
  end: string;
  category: string;
  mode_to_next: string;
  note: string;
  url?: string;
  booking?: string;
};

const SOURCE = path.join(process.cwd(), "data", "itinerary-source-stops.json");
const FALLBACK_SOURCE = path.join(
  "/home/ubuntu/.cursor/projects/workspace/uploads",
  "itinerary-stops_a19c.json",
);

const TRIP_START = "2026-10-30";
const TRIP_END = "2026-11-04";

const IDS: Record<string, string> = {
  "2026-10-30|2": "ams-arrival",
  "2026-10-30|3": "holiday-inn-checkin-fri",
  "2026-10-30|4": "winkel-43",
  "2026-10-30|5": "zipper",
  "2026-10-30|6": "dampkring",
  "2026-10-30|7": "reguliersgracht-bridges",
  "2026-10-30|8": "katsu",
  "2026-10-30|9": "heemelrijck-de-pijp",
  "2026-10-30|10": "holiday-inn-sleep-fri",
  "2026-10-31|1": "holiday-inn-morning-sat",
  "2026-10-31|2": "waterlooplein-episode",
  "2026-10-31|3": "bluebird-lunch",
  "2026-10-31|4": "oude-kerk",
  "2026-10-31|5": "amsterdam-centraal-sat",
  "2026-10-31|6": "rotterdam-centraal-sat",
  "2026-10-31|7": "rotterdam-airbnb-checkin",
  "2026-10-31|8": "grand-cafe-loos",
  "2026-10-31|9": "now-wow-rave",
  "2026-11-01|1": "rotterdam-airbnb-sunday-morning",
  "2026-11-01|2": "cube-houses",
  "2026-11-01|3": "waterbus-erasmus",
  "2026-11-01|4": "kinderdijk",
  "2026-11-01|5": "waterbus-erasmus-return",
  "2026-11-01|6": "euromast",
  "2026-11-01|7": "erasmus-bridge-blue-hour",
  "2026-11-01|8": "hotel-new-york",
  "2026-11-01|9": "rotterdam-airbnb-sunday-night",
  "2026-11-02|1": "rotterdam-airbnb-monday-morning",
  "2026-11-02|2": "rtm-avis-pickup",
  "2026-11-02|3": "gravensteen",
  "2026-11-02|4": "graslei-lunch",
  "2026-11-02|5": "damme",
  "2026-11-02|6": "bruges-studio-checkin",
  "2026-11-02|7": "bruges-markt-burg",
  "2026-11-02|8": "cambrinus",
  "2026-11-02|9": "bruges-studio-sleep-mon",
  "2026-11-03|1": "bruges-studio-checkout",
  "2026-11-03|2": "rozenhoedkaai",
  "2026-11-03|3": "boniface-bridge",
  "2026-11-03|4": "belfry-bruges",
  "2026-11-03|5": "ezelpoort",
  "2026-11-03|6": "minnewater-lunch",
  "2026-11-03|7": "haamstede-westerlicht",
  "2026-11-03|8": "in-de-waag",
  "2026-11-03|9": "badhoevedorp-studio",
  "2026-11-04|1": "badhoevedorp-morning",
  "2026-11-04|2": "schiphol-avis-return",
};

const EMOJIS: Record<string, string> = {
  "ams-arrival": "🛬",
  "holiday-inn-checkin-fri": "🛏️",
  "winkel-43": "🥧",
  zipper: "👕",
  dampkring: "☕",
  "reguliersgracht-bridges": "🌉",
  katsu: "🌿",
  "heemelrijck-de-pijp": "🥘",
  "holiday-inn-sleep-fri": "🛏️",
  "holiday-inn-morning-sat": "🛏️",
  "waterlooplein-episode": "🧺",
  "bluebird-lunch": "🐦",
  "oude-kerk": "⛪",
  "amsterdam-centraal-sat": "🚆",
  "rotterdam-centraal-sat": "🚄",
  "rotterdam-airbnb-checkin": "🏡",
  "grand-cafe-loos": "🍷",
  "now-wow-rave": "🎃",
  "rotterdam-airbnb-sunday-morning": "🏡",
  "cube-houses": "🧊",
  "waterbus-erasmus": "⛴️",
  kinderdijk: "🌾",
  "waterbus-erasmus-return": "⛴️",
  euromast: "🗼",
  "erasmus-bridge-blue-hour": "🌃",
  "hotel-new-york": "🥂",
  "rotterdam-airbnb-sunday-night": "🏡",
  "rotterdam-airbnb-monday-morning": "🏡",
  "rtm-avis-pickup": "🚗",
  gravensteen: "🏰",
  "graslei-lunch": "🚣",
  damme: "🚴",
  "bruges-studio-checkin": "🏠",
  "bruges-markt-burg": "🐴",
  cambrinus: "🍺",
  "bruges-studio-sleep-mon": "🏠",
  "bruges-studio-checkout": "🏠",
  rozenhoedkaai: "📸",
  "boniface-bridge": "🪨",
  "belfry-bruges": "🔔",
  ezelpoort: "🚪",
  "minnewater-lunch": "🦢",
  "haamstede-westerlicht": "🔦",
  "in-de-waag": "🧇",
  "badhoevedorp-studio": "🌙",
  "badhoevedorp-morning": "🌙",
  "schiphol-avis-return": "🔑",
};

const PHOTOS: Record<string, { photo: string; credit: string; creditUrl?: string }> = {
  "ams-arrival": {
    photo: "/photos/schiphol-terminal.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Schiphol_Plaza_2017.jpg",
  },
  "holiday-inn-checkin-fri": {
    photo: "/photos/sloterdijk.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Amsterdam_Sloterdijk_station_2016.jpg",
  },
  "winkel-43": {
    photo: "/photos/winkel-43.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.379084,4.886234",
  },
  "zipper": {
    photo: "/photos/zipper.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.368757,4.885990",
  },
  "dampkring": {
    photo: "/photos/dampkring.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.367732,4.890481",
  },
  "reguliersgracht-bridges": {
    photo: "/photos/reguliersgracht.jpg",
    credit: "CC BY-SA 4.0, Marco Ober, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Reguliersgracht,_Amsterdam.jpg",
  },
  "katsu": {
    photo: "/photos/katsu.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.354831,4.893289",
  },
  "heemelrijck-de-pijp": {
    photo: "/photos/heemelrijck.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.356815,4.899901",
  },
  "holiday-inn-sleep-fri": {
    photo: "/photos/sloterdijk.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Amsterdam_Sloterdijk_station_2016.jpg",
  },
  "holiday-inn-morning-sat": {
    photo: "/photos/sloterdijk.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Amsterdam_Sloterdijk_station_2016.jpg",
  },
  "waterlooplein-episode": {
    photo: "/photos/episode.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.369102,4.900853",
  },
  "bluebird-lunch": {
    photo: "/photos/bluebird.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=52.369998,4.900897",
  },
  "oude-kerk": {
    photo: "/photos/oude-kerk.jpg",
    credit: "CC BY-SA 4.0, Yair Haklai, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Exterior_view_of_the_Oude_Kerk_(Amsterdam).jpg",
  },
  "amsterdam-centraal-sat": {
    photo: "/photos/amsterdam-centraal.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Amsterdam_Centraal_station_(2018).jpg",
  },
  "rotterdam-centraal-sat": {
    photo: "/photos/rotterdam-centraal.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rotterdam_Centraal_Station_2014.jpg",
  },
  "rotterdam-airbnb-checkin": {
    photo: "/photos/rotterdam-city.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Rotterdam skyline substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rotterdam_skyline_2017.jpg",
  },
  "grand-cafe-loos": {
    photo: "/photos/loos-rotterdam.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=51.909000,4.479300",
  },
  "now-wow-rave": {
    photo: "/photos/maassilo.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=51.897699,4.494644",
  },
  "rotterdam-airbnb-sunday-morning": {
    photo: "/photos/rotterdam-city.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Rotterdam skyline substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rotterdam_skyline_2017.jpg",
  },
  "cube-houses": {
    photo: "/photos/cube-houses.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Cube_house_in_Rotterdam.jpg",
  },
  "waterbus-erasmus": {
    photo: "/photos/erasmusbrug-night.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Erasmusbrug_bij_nacht.jpg",
  },
  "kinderdijk": {
    photo: "/photos/kinderdijk.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Kinderdijk,_Molen.jpg",
  },
  "waterbus-erasmus-return": {
    photo: "/photos/erasmusbrug-night.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Erasmusbrug_bij_nacht.jpg",
  },
  "euromast": {
    photo: "/photos/euromast.jpg",
    credit: "CC BY-SA 4.0, W. Bulach, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:.00_2435_Euromast_-_Rotterdam.jpg",
  },
  "erasmus-bridge-blue-hour": {
    photo: "/photos/erasmusbrug-night.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Erasmusbrug_bij_nacht.jpg",
  },
  "hotel-new-york": {
    photo: "/photos/hotel-new-york.jpg",
    credit: "CC BY-SA 4.0, W. Bulach, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:02_Hotel_New_York_-_Rotterdam.jpg",
  },
  "rotterdam-airbnb-sunday-night": {
    photo: "/photos/rotterdam-city.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Rotterdam skyline substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rotterdam_skyline_2017.jpg",
  },
  "rotterdam-airbnb-monday-morning": {
    photo: "/photos/rotterdam-city.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Rotterdam skyline substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rotterdam_skyline_2017.jpg",
  },
  "rtm-avis-pickup": {
    photo: "/photos/rtm-airport.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rotterdam_The_Hague_Airport_terminal.jpg",
  },
  "gravensteen": {
    photo: "/photos/gravensteen.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Gravensteen_Gent.jpg",
  },
  "graslei-lunch": {
    photo: "/photos/graslei.jpg",
    credit: "CC BY-SA 4.0, Michielverbeek, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Gent,_de_Graslei_vanaf_de_Korenlei_met_oeg24758tm61%2B25159_IMG_0447_2021-08-13_18.37.jpg",
  },
  "damme": {
    photo: "/photos/damme-windmill.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Damme,_Belgium.jpg",
  },
  "bruges-studio-checkin": {
    photo: "/photos/bruges-canal.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Bruges area substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Brugge_-_Bruges_-_panoramio.jpg",
  },
  "bruges-markt-burg": {
    photo: "/photos/bruges-markt.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Brugge_Markt.jpg",
  },
  "cambrinus": {
    photo: "/photos/cambrinus.jpg",
    credit: "© Google Street View",
    creditUrl: "https://www.google.com/maps/search/?api=1&query=51.209632,3.226143",
  },
  "bruges-studio-sleep-mon": {
    photo: "/photos/bruges-canal.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Bruges area substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Brugge_-_Bruges_-_panoramio.jpg",
  },
  "rozenhoedkaai": {
    photo: "/photos/rozenhoedkaai.jpg",
    credit: "CC BY-SA 4.0, Ank Kumar, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Rozenhoedkaai_(canal)_and_Belfry_of_Bruges,_Bruges,_Belgium_(Ank_Kumar,_Infosys_Limited)_01.jpg",
  },
  "boniface-bridge": {
    photo: "/photos/boniface-bridge.jpg",
    credit: "CC BY-SA 4.0, Dietmar Rabich, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Br%C3%BCgge_(B),_Bonifatius-Br%C3%BCcke_--_2018_--_8605.jpg",
  },
  "belfry-bruges": {
    photo: "/photos/bruges-belfry.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Belfort_van_Brugge.jpg",
  },
  "bruges-studio-checkout": {
    photo: "/photos/bruges-canal.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Bruges area substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Brugge_-_Bruges_-_panoramio.jpg",
  },
  "ezelpoort": {
    photo: "/photos/ezelpoort.jpg",
    credit: "CC BY-SA 3.0, VWAmFot, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:%22Ezelpoort%22,_middeleeuwse_stadspoort,_Ezelstraat,_Brugge.JPG",
  },
  "minnewater-lunch": {
    photo: "/photos/minnewater.jpg",
    credit: "CC BY 3.0, Marc Ryckaert, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Brugge_Minnewater_R01.jpg",
  },
  "haamstede-westerlicht": {
    photo: "/photos/westerlicht.jpg",
    credit: "CC BY-SA 2.0, Jeroen Looyé, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Nieuw_Haamstede_-_Vuurtoren_(33997226663).jpg",
  },
  "in-de-waag": {
    photo: "/photos/de-waag-amsterdam.jpg",
    credit: "CC BY-SA 4.0, Txllxt TxllxT, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Amsterdam_-_Nieuwmarkt_-_15th_Century_City_gate_that_was_transformed_into_De_Waag.jpg",
  },
  "badhoevedorp-studio": {
    photo: "/photos/badhoevedorp-area.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Badhoevedorp area substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Badhoevedorp.jpg",
  },
  "badhoevedorp-morning": {
    photo: "/photos/badhoevedorp-area.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons (Badhoevedorp area substitute)",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Badhoevedorp.jpg",
  },
  "schiphol-avis-return": {
    photo: "/photos/schiphol-departures.jpg",
    credit: "CC BY-SA 4.0, Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Schiphol_Departures3.jpg",
  },
};

function readSource(): SourceStop[] {
  const file = readFileSync(
    existsSync(SOURCE) ? SOURCE : FALLBACK_SOURCE,
    "utf8",
  );
  return JSON.parse(file) as SourceStop[];
}

function dayNumber(iso: string): number {
  const start = new Date(`${TRIP_START}T12:00:00Z`);
  const current = new Date(`${iso}T12:00:00Z`);
  const diff = Math.round(
    (current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
  );
  return diff + 1;
}

function cityFromArea(area: string): string {
  const primary = area.split(",")[0]?.trim() ?? area;
  if (primary.includes("Amsterdam")) return "Amsterdam";
  if (primary.includes("Rotterdam")) return "Rotterdam";
  if (primary.includes("Bruges") || primary.includes("Assebroek")) return "Bruges";
  if (primary.includes("Ghent") || primary.includes("Patershol")) return "Ghent";
  if (primary.includes("Damme")) return "Damme";
  if (primary.includes("Kinderdijk")) return "Kinderdijk";
  if (primary.includes("Haamstede") || primary.includes("Zeeland")) return "Haamstede";
  if (primary.includes("Badhoevedorp")) return "Badhoevedorp";
  if (primary.includes("Schiphol") || primary.includes("Haarlemmermeer"))
    return "Amsterdam";
  return primary;
}

function mapCategory(raw: string): string {
  switch (raw) {
    case "transport":
      return "transit";
    case "lodging":
      return "stay";
    case "shopping":
      return "shopping";
    case "nightlife":
      return "nightlife";
    case "food":
      return "food";
    case "sight":
      return "sight";
    default:
      return "activity";
  }
}

function sanitizeBooking(text: string): string {
  return text
    .replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "")
    .replace(/\bor phone\b\.?/gi, "")
    .replace(/confirmation email/gi, "reservation details")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeDescription(text: string): string {
  return text
    .replace(/exact address in the Airbnb app/gi, "exact location in your lodging app")
    .replace(/booking email/gi, "itinerary details")
    .replace(/;\s*booked/gi, "; reserved");
}

function resolveTimes(
  id: string,
  start: string,
  end: string,
): { start: string; end: string } {
  const overrides: Record<string, { start: string; end: string }> = {
    "holiday-inn-sleep-fri": { start: "22:45", end: "23:59" },
    "rotterdam-airbnb-sunday-morning": { start: "07:00", end: "10:30" },
    "rotterdam-airbnb-sunday-night": { start: "20:30", end: "23:59" },
    "bruges-studio-sleep-mon": { start: "20:45", end: "23:59" },
    "badhoevedorp-studio": { start: "22:15", end: "23:59" },
    "badhoevedorp-morning": { start: "07:00", end: "07:45" },
    "now-wow-rave": { start: "23:00", end: "23:59" },
  };
  if (overrides[id]) return overrides[id];

  let s = start.trim();
  let e = end.trim();
  if (!s && !e) return { start: "12:00", end: "12:30" };
  if (!s && e) return { start: e, end: e };
  if (s && !e) {
    if (id.includes("sleep") || id.includes("night") || id.includes("studio")) {
      return { start: s, end: "23:59" };
    }
    return { start: s, end: s };
  }
  if (e < s) return { start: s, end: s };
  return { start: s, end: e };
}

function mapMode(raw: string): string | null {
  if (!raw) return null;
  if (raw === "car" || raw === "train" || raw === "bike" || raw === "bus" || raw === "walk") {
    return raw;
  }
  return "train";
}

function addMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor((total + 24 * 60) % (24 * 60) / 60);
  const nm = ((total % 60) + 60) % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function main() {
  const source = readSource().sort((a, b) => {
    if (a.day !== b.day) return a.day.localeCompare(b.day);
    return a.order - b.order;
  });

  const stops = source.map((row) => {
    const key = `${row.day}|${row.order}`;
    const id = IDS[key];
    if (!id) throw new Error(`Missing id mapping for ${key}`);
    const times = resolveTimes(id, row.start, row.end);
    const tips: string[] = [];
    if (row.booking) tips.push(sanitizeBooking(row.booking));
    const photoMeta = PHOTOS[id];
    if (!photoMeta) throw new Error(`Missing photo for ${id}`);

    const stop: Record<string, unknown> = {
      id,
      city: cityFromArea(row.area),
      name: row.name,
      coords: row.lonlat,
      day: dayNumber(row.day),
      start: times.start,
      end: times.end,
      category: mapCategory(row.category),
      description: sanitizeDescription(row.note),
      photos: [photoMeta.photo],
      photoCredit: photoMeta.credit,
      tips,
      emoji: EMOJIS[id] ?? "📍",
    };
    if (photoMeta.creditUrl) stop.photoCreditUrl = photoMeta.creditUrl;
    if (row.url?.trim()) stop.url = row.url.trim();
    if (
      row.category === "food" &&
      row.booking &&
      !row.booking.toLowerCase().includes("walk-in")
    ) {
      stop.note = "Booked.";
    } else if (
      row.note.toLowerCase().includes("booked") &&
      row.category !== "food"
    ) {
      stop.note = "Booked.";
    }

    return stop;
  });

  const legs = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i] as { id: string; end: string; coords: [number, number] };
    const to = stops[i + 1] as { id: string; start: string; coords: [number, number] };
    const row = source[i];
    let mode = mapMode(row.mode_to_next);
    if (!mode) {
      const samePlace =
        from.coords[0] === to.coords[0] && from.coords[1] === to.coords[1];
      mode = samePlace ? "walk" : "train";
    }
    const leg: Record<string, unknown> = {
      from: from.id,
      to: to.id,
      mode,
    };
    const sameCoords =
      Math.abs(from.coords[0] - to.coords[0]) < 0.0001 &&
      Math.abs(from.coords[1] - to.coords[1]) < 0.0001;
    if (!sameCoords) {
      const depart = from.end;
      let arrive = to.start;
      if (arrive >= depart) {
        leg.depart = depart;
        leg.arrive = arrive;
      } else {
        leg.notes = [
          leg.notes,
          `Leave around ${depart}; aim to arrive by ${arrive}.`,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
    const realMode = row.note.match(/real mode: ([^).]+)/i);
    if (realMode) {
      leg.notes = `Scheduled as ${mode}; real mode: ${realMode[1].trim()}.`;
    } else if (sameCoords) {
      leg.notes = "Overnight at the same stay.";
    }
    legs.push(leg);
  }

  const itinerary = {
    trip: {
      title: "Rotterdam Halloween",
      subtitle:
        "Amsterdam through Rotterdam Halloween, Ghent, Damme, Bruges, and Zeeland, starting and ending at Schiphol.",
      start: TRIP_START,
      end: TRIP_END,
      travelers: "Two travelers",
      note: "Day 1 starts at Schiphol. The last day ends back at Schiphol after the Avis return. Tuesday night is the Badhoevedorp studio near the airport.",
    },
    stops,
    legs,
  };

  const parsed = itinerarySchema.safeParse(itinerary);
  if (!parsed.success) {
    console.error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }

  writeFileSync(
    path.join(process.cwd(), "data", "itinerary.json"),
    `${JSON.stringify(parsed.data, null, 2)}\n`,
  );
  console.log(`Wrote ${stops.length} stops and ${legs.length} legs`);
}

main();
