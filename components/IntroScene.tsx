"use client";

import { motion } from "framer-motion";

type IntroSceneProps = {
  title: string;
  subtitle?: string;
  range: string;
  onBegin: () => void;
};

export function IntroScene({ title, subtitle, range, onBegin }: IntroSceneProps) {
  return (
    <motion.section
      className="intro"
      initial={{ y: 0 }}
      exit={{ y: "-110%", transition: { duration: 0.85, ease: [0.76, 0, 0.24, 1] } }}
    >
      <div className="intro-sky" />
      <p className="eyebrow">Northwestern Europe</p>
      <h1>{title}</h1>
      {subtitle ? <p className="intro-sub">{subtitle}</p> : null}
      <svg className="intro-route" viewBox="0 0 320 150" aria-hidden="true">
        <path
          className="intro-path"
          d="M40 28 C 90 28, 110 70, 150 78 S 230 40, 286 118"
        />
        <circle cx="40" cy="28" r="6" />
        <circle cx="168" cy="86" r="6" />
        <circle cx="286" cy="118" r="6" />
        <text x="52" y="24">Amsterdam</text>
        <text x="148" y="112">Rotterdam</text>
        <text x="214" y="146">Bruges</text>
      </svg>
      <p className="intro-meta">{range}</p>
      <button type="button" className="begin" onClick={onBegin}>
        Trace the route
      </button>
    </motion.section>
  );
}
