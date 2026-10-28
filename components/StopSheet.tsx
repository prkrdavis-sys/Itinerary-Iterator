"use client";

import { useDragControls, motion } from "framer-motion";
import { categoryLabel } from "@/lib/categories";
import { arrivalPhrase, modeStyle } from "@/lib/modes";
import type { Leg, Stop } from "@/lib/schema";

type StopSheetProps = {
  stop: Stop;
  incoming: Leg | null;
  nextStop: Stop | null;
  outgoing: Leg | null;
  playing: boolean;
  onClose: () => void;
  onNext: () => void;
};

export function StopSheet({
  stop,
  incoming,
  nextStop,
  outgoing,
  playing,
  onClose,
  onNext,
}: StopSheetProps) {
  const dragControls = useDragControls();
  const outgoingStyle = outgoing ? modeStyle(outgoing.mode) : null;

  return (
    <motion.section
      role="dialog"
      aria-labelledby="stop-title"
      className="glass absolute inset-x-2 z-30 flex max-h-[62%] flex-col rounded-t-[28px] rounded-b-[22px]"
      style={{ bottom: "max(0.7rem, env(safe-area-inset-bottom))" }}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] tracking-[0.22em] text-gold uppercase">
            {stop.city} · Day {stop.day}
          </p>
          <button type="button" onClick={onClose} className="text-xs text-mist">
            Close
          </button>
        </div>
        <h2 id="stop-title" className="mt-1 font-display text-[2rem] leading-none text-cream">
          {stop.name}
        </h2>
        <p className="mt-2 text-sm text-cream">
          {stop.start}–{stop.end}
          <span className="text-mist"> · {categoryLabel(stop.category)}</span>
        </p>
        {incoming ? (
          <p className="mt-1 text-xs tracking-wide text-mist uppercase">
            {arrivalPhrase(incoming.mode)}
          </p>
        ) : null}
        {stop.photo ? (
          // Grokbot may supply any https photo URL, so this cannot go through the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stop.photo}
            alt={stop.name}
            className="mt-4 h-36 w-full rounded-2xl object-cover"
          />
        ) : null}
        <p className="mt-4 text-[15px] leading-6 text-cream">{stop.description}</p>
        {stop.tips.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {stop.tips.map((tip) => (
              <li key={tip} className="border-l border-gold/70 pl-3 text-sm leading-5 text-mist">
                {tip}
              </li>
            ))}
          </ul>
        ) : null}
        {outgoing && nextStop && outgoingStyle ? (
          <button
            type="button"
            onClick={onNext}
            disabled={playing}
            className="mt-5 flex h-12 w-full items-center justify-between rounded-full bg-gold px-4 text-sm font-semibold text-ink disabled:opacity-60"
          >
            <span>
              {outgoingStyle.emoji} Next · {nextStop.name}
            </span>
            <span>{outgoingStyle.label}</span>
          </button>
        ) : (
          <p className="mt-5 text-center font-display text-xl text-gold">Last stop</p>
        )}
        {outgoing?.notes ? <p className="mt-3 text-xs leading-5 text-mist">{outgoing.notes}</p> : null}
      </div>
    </motion.section>
  );
}
