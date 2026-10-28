import type { Mode } from "@/lib/schema";

export function shapeProgress(mode: Mode, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  switch (mode) {
    case "bus":
      return busCurve(clamped);
    case "train":
      return 1 - (1 - clamped) ** 2;
    case "car":
    case "bike":
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - ((-2 * clamped + 2) ** 2) / 2;
    case "walk":
      return clamped;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

function busCurve(t: number): number {
  const segments = [
    [0, 0.2, 0, 0.28],
    [0.2, 0.28, 0.28, 0.28],
    [0.28, 0.52, 0.28, 0.6],
    [0.52, 0.6, 0.6, 0.6],
    [0.6, 0.84, 0.6, 0.9],
    [0.84, 0.92, 0.9, 0.9],
    [0.92, 1, 0.9, 1],
  ] as const;
  for (const [start, end, from, to] of segments) {
    if (t <= end) {
      const mix = end === start ? 1 : (t - start) / (end - start);
      return from + (to - from) * mix;
    }
  }
  return 1;
}

export function animateProgress(options: {
  duration: number;
  mode: Mode;
  reduced: boolean;
  signal: { aborted: boolean };
  onFrame: (t: number) => void;
}): Promise<void> {
  const { duration, mode, reduced, signal, onFrame } = options;
  if (reduced || duration <= 0) {
    onFrame(1);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const started = performance.now();
    const step = (now: number) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const linear = Math.min(1, (now - started) / duration);
      onFrame(shapeProgress(mode, linear));
      if (linear < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
