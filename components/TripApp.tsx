"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { IntroCard } from "@/components/IntroCard";
import { ItineraryList } from "@/components/ItineraryList";
import { StopSheet } from "@/components/StopSheet";
import type { TripMapHandle } from "@/components/TripMap";
import {
  dateForDay,
  dayCities,
  daysOf,
  findStop,
  formatRange,
  legIndexFrom,
  legInto,
} from "@/lib/itinerary";
import { cityEmoji, modeStyle } from "@/lib/modes";
import type { Itinerary } from "@/lib/schema";
import type { RouteSet } from "@/lib/routes";

const TripMap = dynamic(() => import("@/components/TripMap").then((mod) => mod.TripMap), {
  ssr: false,
});

type TripAppProps = {
  itinerary: Itinerary;
  routes: RouteSet;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function TripApp({ itinerary, routes }: TripAppProps) {
  const reduced = useReducedMotion() ?? false;
  const mapRef = useRef<TripMapHandle | null>(null);
  const registerMap = useCallback((handle: TripMapHandle | null) => {
    mapRef.current = handle;
  }, []);
  const playToken = useRef(0);
  const [phase, setPhase] = useState<"intro" | "ready">("intro");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [status, setStatus] = useState("Northwestern Europe");

  const selected = selectedId ? findStop(itinerary, selectedId) : undefined;
  const incoming = selected ? (legInto(itinerary, selected.id) ?? null) : null;
  const outgoingIndex = selected ? legIndexFrom(itinerary, selected.id) : -1;
  const outgoing = outgoingIndex >= 0 ? itinerary.legs[outgoingIndex] : null;
  const nextStop = outgoing ? findStop(itinerary, outgoing.to) : undefined;
  const days = daysOf(itinerary);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setListOpen(false);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openMap() {
    setPhase("ready");
    setStatus("Drawing the route");
    await mapRef.current?.showOverview();
    setStatus((current) =>
      current === "Drawing the route"
        ? formatRange(itinerary.trip.start, itinerary.trip.end)
        : current,
    );
  }

  function chooseStop(id: string) {
    setListOpen(false);
    setSelectedId(id);
    setCelebrate(false);
    mapRef.current?.focusStop(id);
  }

  function stopPlayback() {
    playToken.current += 1;
    mapRef.current?.cancel();
    setPlaying(false);
    setStatus(formatRange(itinerary.trip.start, itinerary.trip.end));
  }

  async function playLeg(index: number) {
    const leg = itinerary.legs[index];
    const destination = leg ? findStop(itinerary, leg.to) : undefined;
    if (!leg || !destination) return;
    setDay(null);
    setPlaying(true);
    setCelebrate(false);
    setStatus(`${modeStyle(leg.mode).verb} to ${destination.name}`);
    await mapRef.current?.playLeg(index);
  }

  async function playTrip() {
    const token = ++playToken.current;
    setSelectedId(null);
    setListOpen(false);
    setCelebrate(false);
    for (let index = 0; index < itinerary.legs.length; index += 1) {
      if (playToken.current !== token) return;
      const leg = itinerary.legs[index];
      if (!leg) return;
      setSelectedId(leg.from);
      await playLeg(index);
      if (playToken.current !== token) return;
      setSelectedId(leg.to);
      await wait(reduced ? 0 : 520);
    }
    if (playToken.current !== token) return;
    setPlaying(false);
    const last = itinerary.stops[itinerary.stops.length - 1];
    if (last?.city === "Bruges") {
      setCelebrate(true);
      setStatus("Bruges");
      window.setTimeout(() => setCelebrate(false), 4200);
    }
  }

  async function playNext() {
    if (outgoingIndex < 0) return;
    const token = ++playToken.current;
    await playLeg(outgoingIndex);
    if (playToken.current !== token) return;
    const leg = itinerary.legs[outgoingIndex];
    if (leg) setSelectedId(leg.to);
    setPlaying(false);
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="phone">
          <TripMap
            itinerary={itinerary}
            routes={routes}
            day={day}
            selectedId={selectedId}
            playing={playing}
            reducedMotion={reduced}
            onSelect={chooseStop}
            onReady={registerMap}
          />

          <AnimatePresence>
            {phase === "intro" ? <IntroCard itinerary={itinerary} onOpen={() => void openMap()} /> : null}
          </AnimatePresence>

          {phase === "ready" ? (
            <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
              <div className="glass pointer-events-auto rounded-[24px] px-4 pt-3 pb-3">
                <p className="text-[11px] tracking-[0.22em] text-gold uppercase">{status}</p>
                <h1 className="font-display text-[1.7rem] leading-none text-cream">
                  {itinerary.trip.title}
                </h1>
                <div className="chip-row mt-3">
                  <button
                    type="button"
                    aria-pressed={day === null}
                    onClick={() => setDay(null)}
                    className={day === null ? "chip chip-on" : "chip"}
                  >
                    All
                  </button>
                  {days.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={day === value}
                      onClick={() => setDay(value)}
                      className={day === value ? "chip chip-on" : "chip"}
                    >
                      Day {value}
                      <span className="mt-0.5 block text-[10px] font-normal tracking-normal text-mist normal-case">
                        {dateForDay(itinerary.trip.start, value).slice(0, 3)} ·{" "}
                        {dayCities(itinerary, value).split(" · ")[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </header>
          ) : null}

          <AnimatePresence>
            {celebrate ? (
              <motion.div
                className="pointer-events-none absolute inset-x-0 top-36 z-30 flex justify-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="relative">
                  {Array.from({ length: 14 }, (_, index) => {
                    const angle = (index / 14) * Math.PI * 2;
                    return (
                      <motion.span
                        key={index}
                        className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full bg-gold"
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{
                          x: Math.cos(angle) * 92,
                          y: Math.sin(angle) * 64,
                          opacity: 0,
                        }}
                        transition={{ duration: reduced ? 0.01 : 0.9, ease: "easeOut" }}
                      />
                    );
                  })}
                  <p className="glass rounded-full px-4 py-2 font-display text-lg text-cream">
                    {cityEmoji("Bruges")} You made it to Bruges
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {selected && phase === "ready" && !listOpen && !playing ? (
              <StopSheet
                key={selected.id}
                stop={selected}
                incoming={incoming}
                outgoing={outgoing ?? null}
                nextStop={nextStop ?? null}
                playing={playing}
                onClose={() => setSelectedId(null)}
                onNext={() => void playNext()}
              />
            ) : null}
          </AnimatePresence>

          {phase === "ready" && (!selected || playing) ? (
            <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex items-center gap-2">
              {playing ? (
                <button type="button" onClick={stopPlayback} className="dock-button bg-cream text-ink">
                  Stop
                </button>
              ) : (
                <button type="button" onClick={() => void playTrip()} className="dock-button bg-gold text-ink">
                  Play trip
                </button>
              )}
              {!listOpen ? (
                <motion.button
                  type="button"
                  layoutId="directory"
                  onClick={() => {
                    setListOpen(true);
                    setSelectedId(null);
                  }}
                  className="dock-button glass text-cream"
                >
                  List
                </motion.button>
              ) : null}
            </div>
          ) : null}

          <AnimatePresence>
            {listOpen ? (
              <ItineraryList
                itinerary={itinerary}
                day={day}
                onClose={() => setListOpen(false)}
                onPick={chooseStop}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
