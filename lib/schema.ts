import { z } from "zod";

export const modes = ["walk", "bike", "car", "train", "bus"] as const;

export const categories = [
  "arrival",
  "wander",
  "food",
  "museum",
  "park",
  "transit",
  "landmark",
  "viewpoint",
  "nature",
] as const;

const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

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
  photo: z.url().optional(),
  tips: z.array(z.string()).default([]),
  emoji: z.string().min(1).optional(),
});

export const legSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  mode: z.enum(modes),
  depart: clock,
  arrive: clock,
  notes: z.string().optional(),
  via: z.array(coordSchema).optional(),
});

export const itinerarySchema = z
  .object({
    trip: z.object({
      title: z.string().min(1),
      subtitle: z.string().optional(),
      start: isoDate,
      end: isoDate,
      note: z.string().optional(),
    }),
    stops: z.array(stopSchema).min(2),
    legs: z.array(legSchema).min(1),
  })
  .superRefine((value, ctx) => {
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

    const pairs = new Set<string>();
    value.legs.forEach((leg, index) => {
      if (!seen.has(leg.from)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown stop id ${leg.from}`,
          path: ["legs", index, "from"],
        });
      }
      if (!seen.has(leg.to)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown stop id ${leg.to}`,
          path: ["legs", index, "to"],
        });
      }
      const pair = `${leg.from}__${leg.to}`;
      if (pairs.has(pair)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate leg ${pair}`,
          path: ["legs", index],
        });
      }
      pairs.add(pair);
      if (leg.arrive < leg.depart) {
        ctx.addIssue({
          code: "custom",
          message: "arrive must be the same as or after depart",
          path: ["legs", index, "arrive"],
        });
      }
    });
  });

export type Mode = z.infer<typeof legSchema>["mode"];
export type Stop = z.infer<typeof stopSchema>;
export type Leg = z.infer<typeof legSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
