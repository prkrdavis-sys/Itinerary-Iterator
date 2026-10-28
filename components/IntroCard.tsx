"use client";

import { motion } from "framer-motion";
import { formatRange } from "@/lib/itinerary";
import { cityEmoji } from "@/lib/modes";
import type { Itinerary } from "@/lib/schema";

type IntroCardProps = {
  itinerary: Itinerary;
  onOpen: () => void;
};

export function IntroCard({ itinerary, onOpen }: IntroCardProps) {
  const { trip, stops } = itinerary;
  const cities = [...new Set(stops.map((stop) => stop.city))];

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-end bg-[rgba(10,8,6,0.42)] p-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <motion.section
        className="glass w-full rounded-[28px] px-6 pt-7 pb-6"
        initial={{ y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
      >
        <img
          src="/logo.png"
          alt=""
          width={88}
          height={88}
          className="mb-5 h-[4.5rem] w-[4.5rem] rounded-[22px]"
        />
        <p className="text-[11px] tracking-[0.28em] text-gold uppercase">
          {formatRange(trip.start, trip.end)}
        </p>
        <h1 className="mt-3 font-display text-[3.1rem] leading-[0.9] font-medium text-cream">
          {trip.title}
        </h1>
        <p className="mt-4 max-w-[30ch] text-[15px] leading-6 text-mist">{trip.subtitle}</p>
        <p className="mt-5 text-sm text-cream">{trip.travelers}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {cities.map((city) => (
            <li
              key={city}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-cream"
            >
              <span aria-hidden="true">{cityEmoji(city)} </span>
              {city}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onOpen}
          className="mt-7 flex h-12 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold tracking-wide text-ink"
        >
          Unroll the map
        </button>
      </motion.section>
    </motion.div>
  );
}
