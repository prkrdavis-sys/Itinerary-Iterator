"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#e07a3d", "#2b6f9a", "#a33b32", "#e3b15a", "#1f6f5b", "#f7f3ea"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
};

export function Confetti({ burst }: { burst: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (burst === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    const particles: Particle[] = Array.from({ length: 70 }, () => ({
      x: width / 2,
      y: height * 0.42,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -12 - 4,
      size: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#e3b15a",
      life: 1,
    }));

    let frame = 0;
    const tick = () => {
      context.clearRect(0, 0, width, height);
      let alive = false;
      for (const particle of particles) {
        particle.vy += 0.18;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.012;
        if (particle.life <= 0) continue;
        alive = true;
        context.globalAlpha = Math.max(particle.life, 0);
        context.fillStyle = particle.color;
        context.fillRect(particle.x, particle.y, particle.size, particle.size * 0.7);
      }
      context.globalAlpha = 1;
      if (alive) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [burst]);

  return <canvas ref={canvasRef} className="confetti" aria-hidden="true" />;
}
