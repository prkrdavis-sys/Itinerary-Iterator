"use client";

import { motion } from "framer-motion";
import { categoryLabel, stopPhotos } from "@/lib/categories";
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
      className="glass under-chrome rounded-[28px]"
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.85rem] leading-none text-cream">Itinerary</h2>
          <p className="mt-1 truncate text-sm text-mist">
            {days.length} {days.length === 1 ? "day" : "days"},{" "}
            {days.reduce((count, value) => count + stopsOnDay(itinerary, value).length, 0)} stops
          </p>
        </div>
        <button type="button" onClick={onClose} className="back-button shrink-0">
          Back
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {days.map((value) => (
          <section key={value} className="mb-4">
            <h3 className="px-2 pt-2 pb-1 font-display text-xl text-cream">Day {value}</h3>
            <p className="px-2 pb-2 text-xs text-mist">
              {dateForDay(itinerary.trip.start, value)}, {dayCities(itinerary, value).split(" · ").join(", ")}
            </p>
            <ol>
              {stopsOnDay(itinerary, value).map((stop, index) => {
                const incoming = legInto(itinerary, stop.id);
                const style = incoming ? modeStyle(incoming.mode) : null;
                const photo = stopPhotos(stop)[0];
                return (
                  <li key={stop.id}>
                    {style && incoming ? (
                      <p className="leg-note">
                        <span aria-hidden="true">{style.emoji} </span>
                        {style.label}
                        {incoming.depart && incoming.arrive
                          ? `, ${incoming.depart}–${incoming.arrive}`
                          : ""}
                      </p>
                    ) : null}
                    <button type="button" onClick={() => onPick(stop.id)} className="stop-row">
                      {photo ? (
                        // Place photos can come from any https host, so they stay outside the image optimizer.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="stop-thumb" />
                      ) : (
                        <span className={`stop-thumb cat-${stop.category}`}>{index + 1}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-cream">
                          {stop.name}
                        </span>
                        <span className={`cat-pill cat-${stop.category} mt-1`}>
                          {categoryLabel(stop.category)}
                        </span>
                      </span>
                      <span className="stop-time">{stop.start}</span>
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
