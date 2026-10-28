"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { IntroCard } from "@/components/IntroCard";
import { ItineraryList } from "@/components/ItineraryList";
import { SettingsPanel } from "@/components/SettingsPanel";
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
import {
  publicMapboxToken,
  readMapSettings,
  writeMapSettings,
  type MapSettings,
} from "@/lib/map-settings";
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
  const [status, setStatus] = useState(
    () =>
      `${daysOf(itinerary).length} days · ${formatRange(itinerary.trip.start, itinerary.trip.end)}`,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<MapSettings>({ token: "", dusk: false });
  const [mapReady, setMapReady] = useState(false);
  const chromeRef = useRef<HTMLElement>(null);

  const selected = selectedId ? findStop(itinerary, selectedId) : undefined;
  const incoming = selected ? (legInto(itinerary, selected.id) ?? null) : null;
  const outgoingIndex = selected ? legIndexFrom(itinerary, selected.id) : -1;
  const outgoing = outgoingIndex >= 0 ? itinerary.legs[outgoingIndex] : null;
  const nextStop = outgoing ? findStop(itinerary, outgoing.to) : undefined;
  const days = daysOf(itinerary);
  const stopIndex = selectedId
    ? itinerary.stops.findIndex((stop) => stop.id === selectedId)
    : -1;
  const previousStop = stopIndex > 0 ? itinerary.stops[stopIndex - 1] : undefined;
  const mapboxToken = settings.dusk ? publicMapboxToken(settings.token) : null;

  function tripStatus(nextDay: number | null): string {
    if (nextDay === null) {
      return `${days.length} days · ${formatRange(itinerary.trip.start, itinerary.trip.end)}`;
    }
    return `Day ${nextDay} · ${dayCities(itinerary, nextDay)}`;
  }

  useEffect(() => {
    const stored = readMapSettings();
    if (stored) {
      setSettings(stored);
    } else {
      const token = publicMapboxToken(process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
      if (token) setSettings({ token, dusk: true });
    }
    setMapReady(true);
  }, []);

  useEffect(() => {
    const node = chromeRef.current;
    const phone = node?.closest(".phone");
    if (!node || !(phone instanceof HTMLElement)) return;
    const apply = () => {
      phone.style.setProperty("--chrome-bottom", `${Math.ceil(node.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase, day, status, settingsOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setListOpen(false);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openMap() {
    setPhase("ready");
    setStatus("Drawing the route");
    for (let attempt = 0; attempt < 30 && !mapRef.current; attempt += 1) {
      await wait(50);
    }
    await mapRef.current?.showOverview();
    setStatus((current) => (current === "Drawing the route" ? tripStatus(null) : current));
  }

  function chooseStop(id: string) {
    if (playing) stopPlayback();
    setListOpen(false);
    setSettingsOpen(false);
    setSelectedId(id);
    setCelebrate(false);
    mapRef.current?.focusStop(id);
  }

  function dismissDetails() {
    if (playing || listOpen || settingsOpen) return;
    setSelectedId(null);
  }

  function stopPlayback() {
    playToken.current += 1;
    mapRef.current?.cancel();
    setPlaying(false);
    setStatus(tripStatus(day));
  }

  function chooseDay(value: number | null) {
    if (playing) stopPlayback();
    setSelectedId(null);
    const next = value !== null && value === day ? null : value;
    setDay(next);
    setStatus(tripStatus(next));
  }

  function showStop(id: string) {
    const stop = findStop(itinerary, id);
    if (!stop) return;
    if (day !== null && stop.day !== day) {
      setDay(stop.day);
      setStatus(tripStatus(stop.day));
    }
    chooseStop(id);
  }

  function goPrevious() {
    if (stopIndex < 0) {
      const last = itinerary.stops[itinerary.stops.length - 1];
      if (last) showStop(last.id);
      return;
    }
    if (previousStop) showStop(previousStop.id);
  }

  function goNext() {
    if (stopIndex < 0) {
      const first = itinerary.stops[0];
      if (first) showStop(first.id);
      return;
    }
    if (outgoingIndex < 0) return;
    void playNext();
  }

  function openSettings() {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (playing) stopPlayback();
    setListOpen(false);
    setSelectedId(null);
    setSettingsOpen(true);
  }

  function saveSettings(draft: MapSettings): string | null {
    const trimmed = draft.token.trim();
    if (!trimmed) {
      const next = { token: "", dusk: false };
      writeMapSettings(next);
      setSettings(next);
      return null;
    }
    const token = publicMapboxToken(trimmed);
    if (!token) return "Paste a public token that starts with pk.";
    const next = { token, dusk: draft.dusk };
    writeMapSettings(next);
    setSettings(next);
    return null;
  }

  function clearSettings() {
    const next = { token: "", dusk: false };
    writeMapSettings(next);
    setSettings(next);
  }

  async function playLeg(index: number) {
    const leg = itinerary.legs[index];
    const destination = leg ? findStop(itinerary, leg.to) : undefined;
    if (!leg || !destination) return;
    setPlaying(true);
    setCelebrate(false);
    setStatus(`${modeStyle(leg.mode).verb} to ${destination.name}`);
    await mapRef.current?.playLeg(index);
  }

  async function playTrip(fromIndex = 0) {
    const token = ++playToken.current;
    setPlaying(true);
    setDay(null);
    setListOpen(false);
    setSettingsOpen(false);
    setCelebrate(false);
    for (let index = fromIndex; index < itinerary.legs.length; index += 1) {
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
    } else {
      setStatus(formatRange(itinerary.trip.start, itinerary.trip.end));
    }
  }

  async function playNext() {
    if (outgoingIndex < 0) return;
    const token = ++playToken.current;
    const leg = itinerary.legs[outgoingIndex];
    const destination = leg ? findStop(itinerary, leg.to) : undefined;
    setPlaying(true);
    await playLeg(outgoingIndex);
    if (playToken.current !== token) return;
    const nextDay = destination && day !== null && destination.day !== day ? destination.day : day;
    if (nextDay !== day) setDay(nextDay);
    if (leg) setSelectedId(leg.to);
    setPlaying(false);
    setStatus(tripStatus(nextDay));
  }

  function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    if (selectedId) {
      void playNext();
      return;
    }
    void playTrip(0);
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="phone">
          {mapReady ? (
            <TripMap
              itinerary={itinerary}
              routes={routes}
              day={day}
              selectedId={selectedId}
              playing={playing}
              reducedMotion={reduced}
              routesRevealed={phase === "ready"}
              mapboxToken={mapboxToken}
              onSelect={chooseStop}
              onMapClick={dismissDetails}
              onReady={registerMap}
            />
          ) : (
            <div className="map-canvas absolute inset-0" style={{ zIndex: 0 }} />
          )}

          <AnimatePresence>
            {phase === "intro" ? <IntroCard itinerary={itinerary} onOpen={() => void openMap()} /> : null}
          </AnimatePresence>

          {phase === "ready" ? (
            <header
              ref={chromeRef}
              className="chrome absolute inset-x-0 top-0 px-3 pt-[max(0.65rem,env(safe-area-inset-top))]"
            >
              <div className="glass flex items-center gap-3 rounded-[22px] py-2.5 pr-2.5 pl-3">
                <img
                  src="/logo.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-[14px]"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-[1.28rem] leading-[1.05] text-balance text-cream">
                    {itinerary.trip.title}
                  </h1>
                  <p className="mt-1 truncate text-[13px] text-mist">{status}</p>
                </div>
                <button
                  type="button"
                  className="settings-launch"
                  aria-label="Settings"
                  aria-expanded={settingsOpen}
                  onClick={openSettings}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path
                      fill="currentColor"
                      fillRule="evenodd"
                      d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42L9.25 5.32c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
                    />
                  </svg>
                </button>
              </div>
              <div className="glass mt-2 rounded-full px-1.5 py-1.5">
                <div className="chip-row">
                  <button
                    type="button"
                    aria-pressed={day === null}
                    onClick={() => chooseDay(null)}
                    className={day === null ? "chip chip-on" : "chip"}
                  >
                    All
                  </button>
                  {days.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={day === value}
                      onClick={() => chooseDay(value)}
                      className={day === value ? "chip chip-on" : "chip"}
                    >
                      Day {value}
                      <span>{dateForDay(itinerary.trip.start, value).split(" ")[0]}</span>
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
            {selected && phase === "ready" && !listOpen && !playing && !settingsOpen ? (
              <StopSheet
                key={selected.id}
                stop={selected}
                incoming={incoming}
                outgoing={outgoing ?? null}
                nextStop={nextStop ?? null}
                playing={playing}
                onClose={() => setSelectedId(null)}
                onPrevious={previousStop ? () => showStop(previousStop.id) : null}
                onNext={() => void playNext()}
              />
            ) : null}
          </AnimatePresence>

          {phase === "ready" && !listOpen && !settingsOpen ? (
            <div className="play-dock glass absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[32]">
              <button
                type="button"
                onClick={goPrevious}
                disabled={stopIndex === 0}
                aria-label="Previous stop"
                className="dock-button"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={!playing && selectedId !== null && outgoingIndex < 0}
                aria-pressed={playing}
                className={playing ? "dock-button is-play is-pause" : "dock-button is-play"}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={stopIndex >= 0 && outgoingIndex < 0}
                aria-label="Next stop"
                className="dock-button"
              >
                Next
              </button>
              <motion.button
                type="button"
                layoutId="directory"
                onClick={() => {
                  if (playing) stopPlayback();
                  setListOpen(true);
                  setSelectedId(null);
                }}
                className="dock-button"
              >
                List
              </motion.button>
            </div>
          ) : null}

          {settingsOpen && phase === "ready" ? (
            <SettingsPanel
              token={settings.token}
              dusk={settings.dusk}
              onBack={() => setSettingsOpen(false)}
              onSave={saveSettings}
              onClear={clearSettings}
            />
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
