export type LngLat = [number, number];

const EARTH_METERS = 6_371_000;

export function haversine(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords: LngLat[]): number {
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    total += haversine(coords[index - 1], coords[index]);
  }
  return total;
}

export function bearing(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * toRad) * Math.cos(b[1] * toRad);
  const x =
    Math.cos(a[1] * toRad) * Math.sin(b[1] * toRad) -
    Math.sin(a[1] * toRad) *
      Math.cos(b[1] * toRad) *
      Math.cos((b[0] - a[0]) * toRad);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function pointAlong(
  coords: LngLat[],
  t: number,
): { point: LngLat; bearing: number } {
  if (coords.length === 0) {
    return { point: [0, 0], bearing: 0 };
  }
  const last = coords.length - 1;
  if (coords.length === 1 || t <= 0) {
    return {
      point: coords[0],
      bearing: bearing(coords[0], coords[Math.min(1, last)]),
    };
  }
  if (t >= 1) {
    return { point: coords[last], bearing: bearing(coords[last - 1], coords[last]) };
  }

  const total = lineLength(coords);
  let remaining = total * t;
  for (let index = 1; index < coords.length; index += 1) {
    const segment = haversine(coords[index - 1], coords[index]);
    if (remaining <= segment || index === last) {
      const mix = segment === 0 ? 0 : remaining / segment;
      return {
        point: [
          coords[index - 1][0] + (coords[index][0] - coords[index - 1][0]) * mix,
          coords[index - 1][1] + (coords[index][1] - coords[index - 1][1]) * mix,
        ],
        bearing: bearing(coords[index - 1], coords[index]),
      };
    }
    remaining -= segment;
  }

  return { point: coords[last], bearing: 0 };
}

export function sliceLine(coords: LngLat[], t: number): LngLat[] {
  if (coords.length === 0) return [];
  if (t <= 0) return [coords[0]];
  if (t >= 1) return coords.slice();

  const { point } = pointAlong(coords, t);
  const total = lineLength(coords);
  let remaining = total * t;
  const sliced: LngLat[] = [coords[0]];
  for (let index = 1; index < coords.length; index += 1) {
    const segment = haversine(coords[index - 1], coords[index]);
    if (remaining <= segment) {
      sliced.push(point);
      return sliced;
    }
    sliced.push(coords[index]);
    remaining -= segment;
  }
  sliced.push(point);
  return sliced;
}

export function densify(points: LngLat[], wobble: number): LngLat[] {
  if (points.length < 2) return points.slice();
  const line: LngLat[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const steps = 28;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy) || 1;
    const px = -dy / length;
    const py = dx / length;
    const direction = index % 2 === 0 ? 1 : -0.65;
    for (let step = 0; step < steps; step += 1) {
      const u = step / steps;
      const arc = Math.sin(u * Math.PI) * wobble * direction;
      line.push([start[0] + dx * u + px * arc, start[1] + dy * u + py * arc]);
    }
  }
  line.push(points[points.length - 1]);
  return line;
}

function catmull(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function smoothThrough(points: LngLat[], samples = 8): LngLat[] {
  if (points.length < 2) return points.slice();
  if (points.length === 2) return points.slice();
  const line: LngLat[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < samples; step += 1) {
      const t = step / samples;
      line.push([
        catmull(p0[0], p1[0], p2[0], p3[0], t),
        catmull(p0[1], p1[1], p2[1], p3[1], t),
      ]);
    }
  }
  line.push(points[points.length - 1]);
  return line;
}

export function sketchArc(a: LngLat, b: LngLat): LngLat[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(0.2, length * 0.16);
  const mid: LngLat = [
    (a[0] + b[0]) / 2 + (-dy / length) * bend,
    (a[1] + b[1]) / 2 + (dx / length) * bend,
  ];
  return smoothThrough([a, mid, b], 14);
}

export function appleMapsUrl(name: string, coords: LngLat): string {
  const [lng, lat] = coords;
  return `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}`;
}

export function boundsOf(
  coords: LngLat[],
): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
