"use client";

import { motion } from "framer-motion";

type IntroCardProps = {
  onOpen: () => void;
};

const photos = [
  { src: "/photos/us/dinner.jpg", position: "center 64%" },
  { src: "/photos/us/wine.jpg", position: "center 46%" },
  { src: "/photos/us/evening.jpg", position: "center top" },
  { src: "/photos/us/falls.jpg", position: "center 24%" },
];

export function IntroCard({ onOpen }: IntroCardProps) {
  return (
    <motion.section
      className="hero-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="hero-collage" aria-hidden="true">
        {photos.map((photo) => (
          <img
            key={photo.src}
            src={photo.src}
            alt=""
            style={{ objectPosition: photo.position }}
          />
        ))}
      </div>
      <div className="hero-veil" aria-hidden="true" />
      <div className="hero-copy">
        <h1 className="hero-title">
          <span>Parker and Emily&apos;s</span>
          <span>Anniversary Trip</span>
          <span className="hero-part">(pt 1)</span>
        </h1>
        <button type="button" className="hero-enter" onClick={onOpen}>
          Unroll the map
        </button>
      </div>
    </motion.section>
  );
}
