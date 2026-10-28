"use client";

import { motion } from "framer-motion";

type PlayControlsProps = {
  playing: boolean;
  caption: string | null;
  progress: number;
  onToggle: () => void;
  onOverview: () => void;
  onList: () => void;
};

export function PlayControls({
  playing,
  caption,
  progress,
  onToggle,
  onOverview,
  onList,
}: PlayControlsProps) {
  return (
    <div className="dock">
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {caption ? <p className="caption">{caption}</p> : null}
      <div className="dock-row">
        <button type="button" className="round" onClick={onOverview} aria-label="Show the whole route">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button type="button" className="play" onClick={onToggle}>
          {playing ? "Pause" : "Play trip"}
        </button>
        <motion.button
          type="button"
          className="round list-launch"
          layoutId="itinerary-shell"
          onClick={onList}
          aria-label="Open the itinerary list"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M5 12h14M5 17h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
