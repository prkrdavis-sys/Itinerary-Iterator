"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PhotoViewerProps = {
  name: string;
  photos: string[];
  onClose: () => void;
};

export function PhotoViewer({ name, photos, onClose }: PhotoViewerProps) {
  const [index, setIndex] = useState(0);
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const node = document.querySelector(".phone");
    return node instanceof HTMLElement ? node : null;
  });
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragStart = useRef<number | null>(null);
  const src = photos[index] ?? photos[0];
  const many = photos.length > 1;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.stopImmediatePropagation();
        setIndex((current) => Math.min(photos.length - 1, current + 1));
      } else if (event.key === "ArrowLeft") {
        event.stopImmediatePropagation();
        setIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, photos.length]);

  if (!host || !src) return null;

  return createPortal(
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={many ? `Photos of ${name}` : `Photo of ${name}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        const start = dragStart.current;
        dragStart.current = null;
        if (start === null || !many) return;
        const delta = event.clientX - start;
        if (delta > 48) setIndex((current) => Math.max(0, current - 1));
        else if (delta < -48) setIndex((current) => Math.min(photos.length - 1, current + 1));
      }}
    >
      {/* Place photos are local files or any https host, so they stay outside the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`${name}, photo ${index + 1}`} className="photo-viewer-image" />
      <div className="photo-viewer-top">
        <button ref={closeRef} type="button" className="back-button" onClick={onClose}>
          Close
        </button>
        <p className="text-sm text-cream">
          {many ? `${index + 1} of ${photos.length}` : name}
        </p>
      </div>
      {many ? (
        <>
          <button
            type="button"
            className="photo-nav is-prev"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                d="M14.5 6.5 8.5 12l6 5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="photo-nav is-next"
            aria-label="Next photo"
            disabled={index === photos.length - 1}
            onClick={() => setIndex((current) => Math.min(photos.length - 1, current + 1))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                d="m9.5 6.5 6 5.5-6 5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="photo-dots">
            {photos.map((photo, dot) => (
              <button
                key={photo}
                type="button"
                aria-label={`Photo ${dot + 1}`}
                aria-current={dot === index ? "true" : undefined}
                className={dot === index ? "photo-dot is-on" : "photo-dot"}
                onClick={() => setIndex(dot)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>,
    host,
  );
}
