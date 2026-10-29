"use client";

import { useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";

type IntroCardProps = {
  onOpen: () => void;
};

const photos = [
  { src: "/photos/us/evening.jpg", focusX: 0.48, focusY: 0.26 },
  { src: "/photos/us/wine.jpg", focusX: 0.5, focusY: 0.36 },
  { src: "/photos/us/dinner.jpg", focusX: 0.5, focusY: 0.46 },
  { src: "/photos/us/falls.jpg", focusX: 0.45, focusY: 0.48 },
];

function framePhoto(frame: HTMLElement, img: HTMLImageElement, focusX: number, focusY: number) {
  const tileW = frame.clientWidth;
  const tileH = frame.clientHeight;
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  if (!tileW || !tileH || !imgW || !imgH) return;

  const scale = Math.max(tileW / imgW, tileH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const x = Math.min(0, Math.max(tileW - dispW, tileW / 2 - focusX * dispW));
  // Sit the couple just below center so the tops of their heads stay inside the frame.
  const y = Math.min(0, Math.max(tileH - dispH, tileH * 0.58 - focusY * dispH));

  img.style.width = `${dispW}px`;
  img.style.height = `${dispH}px`;
  img.style.transform = `translate(${x}px, ${y}px)`;
}

function FramedPhoto({
  src,
  focusX,
  focusY,
}: {
  src: string;
  focusX: number;
  focusY: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img) return;

    const layout = () => framePhoto(frame, img, focusX, focusY);
    layout();
    img.addEventListener("load", layout);
    const observer = new ResizeObserver(layout);
    observer.observe(frame);
    return () => {
      img.removeEventListener("load", layout);
      observer.disconnect();
    };
  }, [focusX, focusY]);

  return (
    <div ref={frameRef} className="hero-frame">
      <img ref={imgRef} src={src} alt="" />
    </div>
  );
}

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
          <FramedPhoto key={photo.src} {...photo} />
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
