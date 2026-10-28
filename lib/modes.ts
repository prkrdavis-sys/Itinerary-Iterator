import type { Mode } from "./schema";

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

export function legDuration(mode: Mode, meters: number): number {
  const base = modeStyle(mode).ms;
  const longHaul = mode === "car" || mode === "train";
  const scale = longHaul ? Math.min(1.25, Math.max(0.85, meters / 45000)) : 1;
  return Math.round(Math.max(1500, Math.min(4600, base * scale)));
}

export function arrivalPhrase(mode: Mode): string {
  switch (mode) {
    case "car":
      return "Arrived by car";
    case "train":
      return "Arrived by train";
    case "bike":
      return "Arrived by bike";
    case "bus":
      return "Arrived by bus";
    case "walk":
      return "Arrived on foot";
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
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

const cityColors: Record<string, string> = {
  Amsterdam: "#e07a3d",
  Rotterdam: "#2b6f9a",
  Bruges: "#a33b32",
  Kinderdijk: "#6d7c38",
  Antwerp: "#8d5b34",
};

export function cityColor(city: string): string {
  return cityColors[city] ?? "#d7c4a3";
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
