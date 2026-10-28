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
    case "walk":
      return {
        label: "Walk",
        verb: "Walking",
        color: "#8a6232",
        dash: [0.25, 1.35],
        width: 3,
        emoji: "👟",
        ms: 4200,
      };
    case "bike":
      return {
        label: "Bike",
        verb: "Biking",
        color: "#1c7a52",
        dash: [0.12, 1.15],
        width: 3.5,
        emoji: "🚲",
        ms: 3600,
      };
    case "car":
      return {
        label: "Car",
        verb: "Driving",
        color: "#e07a3d",
        dash: [],
        width: 4.5,
        emoji: "🚗",
        ms: 5400,
      };
    case "train":
      return {
        label: "Train",
        verb: "By train",
        color: "#2c3f73",
        dash: [1.7, 1.05],
        width: 4,
        emoji: "🚆",
        ms: 3800,
      };
    case "bus":
      return {
        label: "Bus",
        verb: "By bus",
        color: "#b64032",
        dash: [1.35, 0.7],
        width: 5.5,
        emoji: "🚌",
        ms: 4800,
      };
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function legDuration(mode: Mode, meters: number): number {
  const base = modeStyle(mode).ms;
  const longHaul = mode === "car" || mode === "train" || mode === "bus";
  const scale = longHaul ? Math.min(1.55, Math.max(0.85, meters / 28000)) : 1;
  return Math.round(Math.max(2600, Math.min(7200, base * scale)));
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

const cityColors: Record<string, string> = {
  Amsterdam: "#e07a3d",
  Rotterdam: "#2b6f9a",
  Bruges: "#a33b32",
  Delft: "#1f6f5b",
  "Zaanse Schans": "#5f7d45",
  Kinderdijk: "#6d7c38",
  Antwerp: "#8d5b34",
};

export function cityColor(city: string): string {
  return cityColors[city] ?? "#1f6f5b";
}

export function cityEmoji(city: string): string {
  switch (city) {
    case "Amsterdam":
      return "🌷";
    case "Rotterdam":
      return "🌉";
    case "Bruges":
      return "🍫";
    case "Delft":
      return "🏺";
    case "Zaanse Schans":
      return "🌬️";
    case "Kinderdijk":
      return "🌾";
    case "Antwerp":
      return "💎";
    default:
      return "📍";
  }
}
