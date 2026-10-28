"use client";

import { useDragControls, motion } from "framer-motion";
import { categoryLabel, stopPhotos } from "@/lib/categories";
import { appleMapsUrl } from "@/lib/geo";
import { modeStyle } from "@/lib/modes";
import type { Leg, Stop } from "@/lib/schema";

type StopSheetProps = {
  stop: Stop;
  incoming: Leg | null;
  nextStop: Stop | null;
  outgoing: Leg | null;
  playing: boolean;
  onClose: () => void;
  onPrevious: (() => void) | null;
  onNext: () => void;
};

export function StopSheet({
  stop,
  incoming,
  nextStop,
  outgoing,
  playing,
  onClose,
  onPrevious,
  onNext,
}: StopSheetProps) {
  const dragControls = useDragControls();
  const outgoingStyle = outgoing ? modeStyle(outgoing.mode) : null;
  const incomingStyle = incoming ? modeStyle(incoming.mode) : null;
  const arrived =
    incoming && incomingStyle
      ? incoming.depart && incoming.arrive
        ? `${incomingStyle.label} ${incoming.depart}–${incoming.arrive}`
        : incomingStyle.label
      : null;
  const photos = stopPhotos(stop);

  return (
    <motion.section
      role="dialog"
      aria-labelledby="stop-title"
      className="glass stop-sheet absolute inset-x-2 z-[34] flex flex-col rounded-t-[28px] rounded-b-[22px]"
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.45 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 90 || info.velocity.y > 700) onClose();
      }}
      initial={{ y: 280 }}
      animate={{ y: 0 }}
      exit={{ y: 320 }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
    >
      <button
        type="button"
        className="flex w-full justify-center pt-3 pb-2"
        aria-label="Drag to close"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <span className="h-1.5 w-10 rounded-full bg-white/25" />
      </button>
      <div className="flex items-center justify-between gap-3 px-4 pb-2">
        <button type="button" onClick={onClose} className="back-button">
          Back
        </button>
        <p className="text-[11px] tracking-[0.22em] text-gold uppercase">
          {stop.city} · Day {stop.day}
        </p>
      </div>
      <div className="min-h-0 overflow-y-auto px-5 pt-1 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="stop-title" className="font-display text-[2rem] leading-none text-cream">
              {stop.name}
            </h2>
            <p className="mt-2 font-display text-[1.7rem] leading-none text-gold tabular-nums">
              {stop.start}–{stop.end}
            </p>
            <p className="mt-2 text-sm text-mist">
              {categoryLabel(stop.category)}
              {arrived ? ` · ${arrived}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={appleMapsUrl(stop.name, stop.coords)}
              target="_blank"
              rel="noreferrer"
              className="icon-button"
              aria-label={`Open ${stop.name} in Apple Maps`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                <path
                  d="M9 4.5 4.5 6.2v13.3L9 17.8l6 2.2 4.5-1.7V6.2L15 4.5 9 6.7z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 6.7v11.1M15 4.5v13.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </a>
            {stop.url ? (
              <a
                href={stop.url}
                target="_blank"
                rel="noreferrer"
                className="icon-button"
                aria-label={`${stop.name} website`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <path
                    d="M14 5h5v5M19 5l-9 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            ) : null}
          </div>
        </div>
        {photos.length > 0 ? (
          <div
            className={photos.length > 1 ? "mt-3 grid grid-cols-2 gap-2" : "mt-3"}
            aria-label={`Photos of ${stop.name}`}
          >
            {photos.map((src) => (
              // Place photos can come from any https host, so they stay outside the image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-28 w-full rounded-2xl object-cover" />
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex gap-2 px-4 pt-2 pb-4">
        {onPrevious ? (
          <button type="button" onClick={onPrevious} className="dock-button glass text-cream">
            Previous
          </button>
        ) : null}
        {outgoing && nextStop && outgoingStyle ? (
          <button
            type="button"
            onClick={onNext}
            disabled={playing}
            className="dock-button bg-gold text-ink disabled:opacity-60"
          >
            {outgoingStyle.emoji} Next · {nextStop.name}
          </button>
        ) : (
          <p className="flex h-12 flex-1 items-center justify-center font-display text-xl text-gold">
            Last stop
          </p>
        )}
      </div>
    </motion.section>
  );
}
