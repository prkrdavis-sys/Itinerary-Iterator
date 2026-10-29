import { z } from "zod";

export const modes = ["car", "train", "bike", "bus", "walk"] as const;

export const categories = [
  "museum",
  "food",
  "sight",
  "stay",
  "transit",
  "neighborhood",
  "activity",
  "shopping",
  "nightlife",
] as const;

const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const coordSchema = z
  .tuple([z.number(), z.number()])
  .refine(
    ([lng, lat]) =>
      Number.isFinite(lng) &&
      Number.isFinite(lat) &&
      lng >= -180 &&
      lng <= 180 &&
      lat >= -90 &&
      lat <= 90,
    "Coordinates must be [longitude, latitude]",
  );

const imageRef = z.string().refine((value) => {
  if (value.startsWith("/photos/")) {
    return /^\/photos\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:jpe?g|png|webp)$/.test(value);
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Use an https image URL or a /photos/ file");

export const stopSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase slug id"),
  city: z.string().min(1),
  name: z.string().min(1),
  coords: coordSchema,
  day: z.number().int().positive(),
  start: clock,
  end: clock,
  category: z.enum(categories),
  description: z.string().min(1),
  note: z.string().min(1).optional(),
  url: z.url().optional(),
  photo: imageRef.optional(),
  photos: z.array(imageRef).max(4).default([]),
  photoCredit: z.string().min(1).optional(),
  photoCreditUrl: z.url().optional(),
  tips: z.array(z.string().min(1)).default([]),
  emoji: z.string().min(1).optional(),
});

export const legSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  mode: z.enum(modes),
  depart: clock.optional(),
  arrive: clock.optional(),
  notes: z.string().optional(),
  via: z.array(coordSchema).optional(),
});

export const itinerarySchema = z
  .object({
    trip: z.object({
      title: z.string().min(1),
      subtitle: z.string().min(1),
      start: isoDate,
      end: isoDate,
      travelers: z.string().min(1),
      note: z.string().optional(),
    }),
    stops: z.array(stopSchema).min(2),
    legs: z.array(legSchema),
  })
  .superRefine((value, ctx) => {
    if (value.trip.end < value.trip.start) {
      ctx.addIssue({
        code: "custom",
        message: "trip end must be on or after the start date",
        path: ["trip", "end"],
      });
    }

    const seen = new Set<string>();
    value.stops.forEach((stop, index) => {
      if (seen.has(stop.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate stop id ${stop.id}`,
          path: ["stops", index, "id"],
        });
      }
      seen.add(stop.id);
      if (stop.end < stop.start) {
        ctx.addIssue({
          code: "custom",
          message: "end must be the same as or after start",
          path: ["stops", index, "end"],
        });
      }
    });

    if (value.legs.length !== value.stops.length - 1) {
      ctx.addIssue({
        code: "custom",
        message: `Expected exactly ${value.stops.length - 1} legs between consecutive stops, found ${value.legs.length}`,
        path: ["legs"],
      });
    }

    value.stops.forEach((stop, index) => {
      if (index === 0) return;
      const leg = value.legs[index - 1];
      const previous = value.stops[index - 1];
      if (!leg || !previous) return;
      if (leg.from !== previous.id || leg.to !== stop.id) {
        ctx.addIssue({
          code: "custom",
          message: `Leg ${index} must run from ${previous.id} to ${stop.id}`,
          path: ["legs", index - 1],
        });
      }
      if (leg.depart && leg.arrive && leg.arrive < leg.depart) {
        ctx.addIssue({
          code: "custom",
          message: "arrive must be the same as or after depart",
          path: ["legs", index - 1, "arrive"],
        });
      }
    });
  });

export type Mode = z.infer<typeof legSchema>["mode"];
export type Category = z.infer<typeof stopSchema>["category"];
export type Stop = z.infer<typeof stopSchema>;
export type Leg = z.infer<typeof legSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
