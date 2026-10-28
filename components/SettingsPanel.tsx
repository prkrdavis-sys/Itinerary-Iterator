"use client";

import { useState } from "react";
import type { MapSettings } from "@/lib/map-settings";

type SettingsPanelProps = {
  token: string;
  dusk: boolean;
  onBack: () => void;
  onSave: (draft: MapSettings) => string | null;
  onClear: () => void;
};

export function SettingsPanel({ token, dusk, onBack, onSave, onClear }: SettingsPanelProps) {
  const [draftToken, setDraftToken] = useState(token);
  const [draftDusk, setDraftDusk] = useState(dusk);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function save() {
    const message = onSave({ token: draftToken, dusk: draftDusk });
    if (message) {
      setError(message);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice("Saved on this device.");
    if (!draftToken.trim()) setDraftDusk(false);
  }

  function clear() {
    setDraftToken("");
    setDraftDusk(false);
    setError(null);
    setNotice("Token cleared.");
    onClear();
  }

  return (
    <section role="dialog" aria-label="Settings" className="glass settings-sheet">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-3xl text-cream">Settings</h2>
        <button type="button" onClick={onBack} className="back-button">
          Back
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-mist">
        This is a public browser token from mapbox.com, and route geometry is already built in.
        Dusk is used while this phone is online. Offline, the map is the copy saved on the phone.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <button
          type="button"
          aria-pressed={draftDusk}
          onClick={() => {
            setDraftDusk((current) => !current);
            setNotice(null);
          }}
          className={draftDusk ? "chip chip-on" : "chip"}
        >
          {draftDusk ? "Dusk style on" : "Dusk style off"}
        </button>
        <label className="block text-sm text-cream">
          Mapbox public token
          <input
            value={draftToken}
            onChange={(event) => {
              setDraftToken(event.target.value);
              setNotice(null);
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="pk."
            inputMode="text"
            name="mapbox-public-token"
            className="settings-input mt-1"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-gold">
            {error}
          </p>
        ) : null}
        {notice ? <p className="text-sm text-mist">{notice}</p> : null}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="dock-button bg-gold text-ink">
            Save
          </button>
          <button type="button" onClick={clear} className="dock-button glass text-cream">
            Clear token
          </button>
        </div>
      </form>
    </section>
  );
}
