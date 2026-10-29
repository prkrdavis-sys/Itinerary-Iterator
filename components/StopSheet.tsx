"use client";

import { useState } from "react";
import { useDragControls, motion } from "framer-motion";
import { PhotoViewer } from "@/components/PhotoViewer";
import { categoryLabel, stopPhotos } from "@/lib/categories";
import { appleMapsUrl } from "@/lib/geo";
import { formatClockRange } from "@/lib/itinerary";
import { legStyle } from "@/lib/modes";
import type { Leg, Stop } from "@/lib/schema";

type StopSheetProps = {
  stop: Stop;
  incoming: Leg | null;
  onClose: () => void;
};

export function StopSheet({ stop, incoming, onClose }: StopSheetProps) {
  const dragControls = useDragControls();
  const [photosOpen, setPhotosOpen] = useState(false);
  const incomingStyle = incoming ? legStyle(incoming) : null;
  const arrived =
    incoming && incomingStyle
      ? incoming.depart && incoming.arrive
        ? `${incomingStyle.label} ${formatClockRange(incoming.depart, incoming.arrive)}`
        : incomingStyle.label
      : null;
  const photos = stopPhotos(stop);
  const cover = photos[0];

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
      {cover ? (
        <button
          type="button"
          className="stop-hero"
          aria-label={
            photos.length === 1
              ? `View photo of ${stop.name}`
              : `View ${photos.length} photos of ${stop.name}`
          }
          onClick={() => setPhotosOpen(true)}
        >
          {/* Place photos are local files or any https host, so they stay outside the image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" />
        </button>
      ) : null}
      <button
        type="button"
        className="relative z-[1] flex w-full justify-center pt-3 pb-2"
        aria-label="Drag to close"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <span className="h-1.5 w-10 rounded-full bg-white/70" />
      </button>
      <div className="relative z-[1] flex items-center gap-2 px-4 pt-3 pb-2">
        <button type="button" onClick={onClose} className="back-button">
          Back
        </button>
        <p className="min-w-0 flex-1 truncate text-right text-sm text-mist">
          Day {stop.day}, {stop.city}
        </p>
        <div className="flex shrink-0 gap-2">
            {photos.length > 0 ? (
              <button
                type="button"
                className="icon-button"
                aria-label={
                  photos.length === 1
                    ? `View photo of ${stop.name}`
                    : `View ${photos.length} photos of ${stop.name}`
                }
                onClick={() => setPhotosOpen(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <rect
                    x="3.5"
                    y="5"
                    width="17"
                    height="14"
                    rx="2.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <circle cx="9" cy="10" r="1.35" fill="currentColor" />
                  <path
                    d="m4.2 16.2 4.2-4.1 3.2 3 2.6-2.4 5.6 4.3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
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
      <div className="relative z-[1] min-h-0 overflow-y-auto px-5 pt-1 pb-5">
        <h2 id="stop-title" className="font-display text-[2rem] leading-none text-cream">
          {stop.name}
        </h2>
        <p className="stop-copy mt-2 font-display text-[1.65rem] leading-none whitespace-nowrap text-gold tabular-nums">
          {formatClockRange(stop.start, stop.end)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`cat-pill cat-${stop.category}`}>{categoryLabel(stop.category)}</span>
          {arrived ? <span className="text-sm text-mist">{arrived}</span> : null}
        </div>
        <p className="stop-copy mt-4 text-sm leading-6 text-cream">{stop.description}</p>
        {stop.note ? (
          <p className="stop-copy mt-2 text-sm leading-6 text-gold">{stop.note}</p>
        ) : null}
        {stop.photoCredit ? (
          <p className="mt-3 text-xs leading-5 text-mist">
            Photo:{" "}
            {stop.photoCreditUrl ? (
              <a
                href={stop.photoCreditUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/30 underline-offset-2"
              >
                {stop.photoCredit}
              </a>
            ) : (
              stop.photoCredit
            )}
          </p>
        ) : null}
        {stop.tips.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-cream">Notes</h3>
            <ul className="mt-2 space-y-2">
              {stop.tips.map((tip) => (
                <li key={tip} className="note-card">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {photosOpen && photos.length > 0 ? (
        <PhotoViewer name={stop.name} photos={photos} onClose={() => setPhotosOpen(false)} />
      ) : null}
    </motion.section>
  );
}
