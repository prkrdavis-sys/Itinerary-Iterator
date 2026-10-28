"use client";

import { motion } from "framer-motion";
import { categoryLabel } from "@/lib/categories";
import { dateForDay, dayCities, daysOf, legInto, stopsOnDay } from "@/lib/itinerary";
import { modeStyle } from "@/lib/modes";
import type { Itinerary } from "@/lib/schema";

type ItineraryListProps = {
  itinerary: Itinerary;
  day: number | null;
  onClose: () => void;
  onPick: (id: string) => void;
};

export function ItineraryList({ itinerary, day, onClose, onPick }: ItineraryListProps) {
  const days = daysOf(itinerary).filter((value) => day === null || value === day);

  return (
    <motion.section
      layoutId="directory"
      role="dialog"
      aria-label="Itinerary"
      className="glass absolute inset-2 z-40 flex flex-col overflow-hidden rounded-[28px]"
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
    >
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <p className="text-[11px] tracking-[0.22em] text-gold uppercase">The days</p>
          <h2 className="font-display text-3xl text-cream">List</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-cream"
        >
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {days.map((value) => (
          <section key={value} className="mb-4">
            <h3 className="px-2 pt-2 pb-2 font-display text-lg text-cream">
              Day {value}
              <span className="ml-2 font-sans text-xs tracking-normal text-mist">
                {dateForDay(itinerary.trip.start, value)} · {dayCities(itinerary, value)}
              </span>
            </h3>
            <ol>
              {stopsOnDay(itinerary, value).map((stop) => {
                const incoming = legInto(itinerary, stop.id);
                const style = incoming ? modeStyle(incoming.mode) : null;
                return (
                  <li key={stop.id}>
                    {style && incoming ? (
                      <p className="px-3 py-1 text-[11px] tracking-[0.16em] text-mist uppercase">
                        <span aria-hidden="true">{style.emoji} </span>
                        {style.label}
                        {incoming.depart && incoming.arrive
                          ? ` · ${incoming.depart}–${incoming.arrive}`
                          : ""}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onPick(stop.id)}
                      className="flex w-full items-baseline gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/5"
                    >
                      <span className="w-12 shrink-0 text-xs text-gold tabular-nums">
                        {stop.start}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] text-cream">{stop.name}</span>
                        <span className="text-xs text-mist">
                          {categoryLabel(stop.category)} · until {stop.end}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </motion.section>
  );
}
