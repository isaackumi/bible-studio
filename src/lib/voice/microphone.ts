// Which microphone listening uses. A real microphone always hears a little hiss, so it is never
// exactly silent; a virtual one with nothing behind it (a phone-as-webcam app with no phone, a
// virtual mixer), a muted one or one that is not really there sends exact zeros. So a dead
// microphone is found in a second, without anyone speaking, and listening moves to one that is live.
// A working microphone the church chose is never swapped for one that is merely louder.

/** What the desktop core heard from one microphone (src-tauri/src/noise.rs probe_inputs). */
export type MicHeard = { name: string; peak: number; live: boolean; error: string | null };

export type MicChoice = {
  /** The microphone to listen on, or null for none at all. */
  name: string | null;
  /** Why it is not the one the church chose (or the computer's default): said to the operator. */
  moved: null | { from: string; because: "silent" | "unplugged" };
  /** Every microphone is silent: nothing will be heard, whichever is used. */
  allSilent: boolean;
};

/**
 * `wanted`: the church's choice on this computer (null: the computer's default). `fallback`: the
 * computer's default microphone.
 */
export function pickMicrophone(heard: MicHeard[], wanted: string | null, fallback: string | null): MicChoice {
  const usable = heard.filter((entry) => !entry.error);
  const live = usable.filter((entry) => entry.live).sort((a, b) => b.peak - a.peak);
  const plugged = wanted ? heard.some((entry) => entry.name === wanted) : false;
  const first = wanted && plugged ? wanted : fallback;
  const allSilent = live.length === 0;
  const found = usable.find((entry) => entry.name === first);
  // The one in use is live: keep it, even if another is louder.
  if (found?.live) return { name: first, moved: wanted && !plugged ? { from: wanted, because: "unplugged" } : null, allSilent };
  // It is silent, missing or would not open: the liveliest other one, if any is live.
  const best = live[0];
  if (best) return { name: best.name, moved: { from: wanted && !plugged ? wanted : (first ?? wanted ?? best.name), because: wanted && !plugged ? "unplugged" : "silent" }, allSilent };
  return { name: first, moved: null, allSilent };
}

/** The probe found the microphone in use dead: true when it sent nothing but silence (or could not be opened). */
export const micDead = (heard: MicHeard[], name: string | null) => {
  const entry = heard.find((item) => item.name === name);
  return !entry || !!entry.error || !entry.live;
};

/** A microphone's name as the desk shows it: "Microphone (2- Realtek(R) Audio)" reads "Realtek(R) Audio". */
export function micLabel(name: string): string {
  const inner = /^(?:microphone|mic|input)\s*\((.+)\)$/i.exec(name.trim())?.[1] ?? name.trim();
  return inner.replace(/^\d+-\s*/, "");
}

const KEY = "church-studio:microphone";

/** The microphone chosen on this computer (never synced: another computer's names mean nothing here). */
export function savedMicrophone(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function saveMicrophone(name: string | null) {
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {
    // Private storage off: the choice lasts until the app closes.
  }
}
