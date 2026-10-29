"use client";

import { useState } from "react";
import { publicMapboxToken, type MapSettings } from "@/lib/map-settings";
import { mapSaveMessage, type MapSaveStatus } from "@/lib/offline-archive";

type SettingsPanelProps = {
  token: string;
  dusk: boolean;
  mapSaveStatus: MapSaveStatus;
  onBack: () => void;
  onSave: (draft: MapSettings) => string | null;
  onClear: () => void;
};

export function SettingsPanel({
  token,
  dusk,
  mapSaveStatus,
  onBack,
  onSave,
  onClear,
}: SettingsPanelProps) {
  const [draftToken, setDraftToken] = useState(token);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function save() {
    const message = onSave({ token: draftToken, dusk });
    if (message) {
      setError(message);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice("Saved on this device.");
  }

  function toggleDusk() {
    const next = !dusk;
    if (next && !publicMapboxToken(token)) {
      setError("Save a public token that starts with pk. before turning dusk on.");
      setNotice(null);
      return;
    }
    const message = onSave({ token, dusk: next });
    if (message) {
      setError(message);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
  }

  function clear() {
    setDraftToken("");
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
      <p
        className={`settings-save-marker${
          mapSaveStatus === "error" ? " is-error" : mapSaveStatus === "saving" ? " is-saving" : ""
        }`}
      >
        {mapSaveMessage(mapSaveStatus)}
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
          aria-pressed={dusk}
          onClick={toggleDusk}
          className={dusk ? "chip chip-on" : "chip"}
        >
          {dusk ? "Dusk style on" : "Dusk style off"}
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
