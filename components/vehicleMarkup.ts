import type { Mode } from "@/lib/schema";
import { modeStyle } from "@/lib/modes";

export function vehicleMarkup(mode: Mode): string {
  const { color } = modeStyle(mode);
  return `<div class="vehicle vehicle-${mode}" style="--vehicle:${color}"><div class="vehicle-spin">${vehicleSvg(mode)}</div></div>`;
}

function vehicleSvg(mode: Mode): string {
  switch (mode) {
    case "car":
      return `<svg viewBox="0 0 48 28" aria-hidden="true"><path fill="currentColor" d="M6 16h2.2l2.4-6.2A4 4 0 0 1 14.3 7h14.2a4 4 0 0 1 3.7 2.5L35 16h7a3 3 0 0 1 3 3v3H3v-3a3 3 0 0 1 3-3Z"/><circle cx="14" cy="22" r="3.2" fill="#1a2420"/><circle cx="34" cy="22" r="3.2" fill="#1a2420"/></svg>`;
    case "train":
      return `<svg viewBox="0 0 52 28" aria-hidden="true"><rect x="4" y="6" width="36" height="14" rx="4" fill="currentColor"/><rect x="38" y="10" width="8" height="8" rx="2" fill="currentColor"/><rect x="8" y="9" width="7" height="5" fill="#f7f3ea"/><rect x="18" y="9" width="7" height="5" fill="#f7f3ea"/><rect x="28" y="9" width="7" height="5" fill="#f7f3ea"/><circle cx="14" cy="22" r="2.4" fill="#1a2420"/><circle cx="32" cy="22" r="2.4" fill="#1a2420"/></svg>`;
    case "bike":
      return `<svg viewBox="0 0 48 28" aria-hidden="true"><circle cx="12" cy="18" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="36" cy="18" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 18h10l6-8h8M22 18l6-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    case "bus":
      return `<svg viewBox="0 0 56 30" aria-hidden="true"><rect x="4" y="6" width="46" height="14" rx="3" fill="currentColor"/><rect x="8" y="9" width="8" height="6" fill="#f7f3ea"/><rect x="19" y="9" width="8" height="6" fill="#f7f3ea"/><rect x="30" y="9" width="8" height="6" fill="#f7f3ea"/><circle cx="16" cy="22" r="2.6" fill="#1a2420"/><circle cx="40" cy="22" r="2.6" fill="#1a2420"/></svg>`;
    case "walk":
      return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="11" cy="10" r="3.2" fill="currentColor"/><circle cx="22" cy="20" r="3.2" fill="currentColor"/></svg>`;
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}
