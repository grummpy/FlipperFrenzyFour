import { sanitizeBindings } from "../core/input.js";
import { clamp } from "../core/math.js";

const SETTINGS_KEY = "flipperfrenzyfour.settings";
const BINDINGS_KEY = "flipperfrenzyfour.bindings";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadInto(game) {
  const settings = readJson(SETTINGS_KEY);
  if (settings) {
    if (typeof settings.volume === "number") game.volume = clamp(settings.volume, 0, 1);
    if (typeof settings.muted === "boolean") game.muted = settings.muted;
    if (typeof settings.winsNeeded === "number") {
      game.winsNeeded = clamp(Math.round(settings.winsNeeded), 1, 9);
    }
  }
  const bindings = readJson(BINDINGS_KEY);
  if (bindings) game.bindings = sanitizeBindings(bindings);
}

export function saveGame(game) {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        volume: game.volume,
        muted: game.muted,
        winsNeeded: game.winsNeeded,
      }),
    );
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(game.bindings));
  } catch {
    // Private mode and full storage can reject writes. Play continues either way.
  }
}
