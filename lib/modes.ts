import type { Leg, Mode } from "./schema";

export type ModeStyle = {
  label: string;
  verb: string;
  color: string;
  dash: number[];
  width: number;
  emoji: string;
  ms: number;
};

export function modeStyle(mode: Mode): ModeStyle {
  switch (mode) {
    case "car":
      return {
        label: "Car",
        verb: "Driving",
        color: "#ffd36a",
        dash: [],
        width: 4.5,
        emoji: "🚗",
        ms: 4200,
      };
    case "train":
      return {
        label: "Train",
        verb: "By train",
        color: "#d5def8",
        dash: [1.8, 1.1],
        width: 4,
        emoji: "🚆",
        ms: 2800,
      };
    case "bike":
      return {
        label: "Bike",
        verb: "Biking",
        color: "#9ee0b4",
        dash: [0.15, 1.25],
        width: 3.5,
        emoji: "🚲",
        ms: 3000,
      };
    case "bus":
      return {
        label: "Bus",
        verb: "By bus",
        color: "#f0a090",
        dash: [1.4, 0.75],
        width: 5.5,
        emoji: "🚌",
        ms: 3600,
      };
    case "walk":
      return {
        label: "Walk",
        verb: "Walking",
        color: "#f3d7b0",
        dash: [0.18, 1.55],
        width: 3.5,
        emoji: "👟",
        ms: 2400,
      };
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

const REAL_MODES: Record<string, Pick<ModeStyle, "label" | "verb" | "emoji">> = {
  ferry: { label: "Ferry", verb: "By ferry", emoji: "⛴️" },
  metro: { label: "Metro", verb: "By metro", emoji: "🚇" },
  tram: { label: "Tram", verb: "By tram", emoji: "🚋" },
};

// The schema only knows five modes, so a ferry or tram leg is scheduled as a bus or
// train and names its real mode in notes ("real mode: ferry/WaterShuttle").
export function legStyle(leg: Pick<Leg, "mode" | "notes">): ModeStyle {
  const style = modeStyle(leg.mode);
  const real = leg.notes?.match(/real mode: ([a-z]+)/i)?.[1]?.toLowerCase();
  const override = real ? REAL_MODES[real] : undefined;
  return override ? { ...style, ...override } : style;
}

export function legDuration(mode: Mode, meters: number): number {
  const base = modeStyle(mode).ms;
  const longHaul = mode === "car" || mode === "train";
  const scale = longHaul ? Math.min(1.25, Math.max(0.85, meters / 45000)) : 1;
  return Math.round(Math.max(1500, Math.min(4600, base * scale)));
}

export function iconRotation(mode: Mode, bearingDeg: number): number {
  switch (mode) {
    case "car":
    case "train":
    case "bus":
    case "bike":
      return bearingDeg - 90;
    case "walk":
      return 0;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function playbackProgress(mode: Mode, linear: number): number {
  const t = Math.min(1, Math.max(0, linear));
  switch (mode) {
    case "bus": {
      const spans = [
        [0, 0.26, 0, 0.33],
        [0.26, 0.36, 0.33, 0.33],
        [0.36, 0.62, 0.33, 0.66],
        [0.62, 0.72, 0.66, 0.66],
        [0.72, 1, 0.66, 1],
      ] as const;
      for (const [start, end, from, to] of spans) {
        if (t <= end) {
          const mix = end === start ? 1 : (t - start) / (end - start);
          return from + (to - from) * mix;
        }
      }
      return 1;
    }
    case "car":
    case "train":
    case "bike":
    case "walk":
      return t;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function followZoom(mode: Mode, meters: number): number {
  switch (mode) {
    case "walk":
      return 15.1;
    case "bike":
      return 14.3;
    case "bus":
      return 14.2;
    case "train":
      return 11.4;
    case "car":
      return meters > 35000 ? 9.1 : 11.2;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

function zoomPullback(meters: number): number {
  const kilometers = Math.max(0, meters) / 1000;
  const scaled = Math.log10(1 + kilometers) / Math.log10(1 + 280);
  return 0.22 + Math.min(1, scaled) * 1.55;
}

export function followZoomAt(mode: Mode, meters: number, along: number): number {
  const t = Math.min(1, Math.max(0, along));
  const bulge = Math.sin(Math.PI * t);
  return followZoom(mode, meters) - zoomPullback(meters) * bulge;
}

const dayColors = [
  "#e07a3d",
  "#3b8fd4",
  "#d4566e",
  "#5ea36a",
  "#c9842a",
  "#7b6ad4",
];

export function dayColor(day: number): string {
  const index = Math.max(0, day - 1);
  return dayColors[index % dayColors.length] ?? dayColors[0];
}

export function cityEmoji(city: string): string {
  switch (city) {
    case "Amsterdam":
      return "🌷";
    case "Rotterdam":
      return "🌉";
    case "Bruges":
      return "🦢";
    case "Kinderdijk":
      return "🌾";
    case "Antwerp":
      return "💎";
    default:
      return "📍";
  }
}
