// Where the congregation hears Church Studio. The computer running it is often a laptop whose own
// speakers are for the operator, while the room hears the church's sound system: a USB interface
// into the mixer, or a display's audio over HDMI or DisplayPort. Automatic picks the church's
// output when one is connected and falls back to the computer's own when none is; a chosen output
// is kept while it is connected, and stands in again when it comes back.

export type Transport = "built-in" | "usb" | "hdmi" | "displayport" | "thunderbolt" | "firewire" | "pci" | "bluetooth" | "airplay" | "virtual" | "aggregate" | "unknown";

/** A sound output as the computer reports it (audio_out.rs). */
export type AudioOutputDevice = { id: string; name: string; transport: Transport; isDefault: boolean };

/** "auto", or the id of the output the church chose. */
export type OutputChoice = string;

export type OutputDecision = {
  /** The output the congregation should hear; null when the computer has none to offer. */
  output: AudioOutputDevice | null;
  why: "chosen" | "default-external" | "interface" | "display" | "computer";
  /** The chosen output, when it is not connected. */
  missing: boolean;
};

const INTERFACES: readonly Transport[] = ["usb", "thunderbolt", "firewire", "pci"];
const DISPLAYS: readonly Transport[] = ["hdmi", "displayport"];

/**
 * Plugged into the room's sound: an interface or a display's audio. Bluetooth (the operator's
 * headphones), AirPlay (seconds of delay), virtual devices (meeting apps) and the computer's own
 * speakers are never picked by themselves; any of them can still be chosen by hand.
 */
export const isRoomOutput = (output: AudioOutputDevice) => INTERFACES.includes(output.transport) || DISPLAYS.includes(output.transport);

const byName = (a: AudioOutputDevice, b: AudioOutputDevice) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The output to use, in this order:
 * 1. the output chosen in Church Studio, while it is connected;
 * 2. the computer's own sound output, when it already is the room's (someone set it on purpose);
 * 3. an audio interface (USB, Thunderbolt…): a church that plugged one in means its mixer;
 * 4. the audience screen's own audio (a projector or TV with speakers, over HDMI or DisplayPort).
 *    Only the audience screen's: a desk monitor lists audio too, often with no speakers behind it;
 * 5. the computer's sound output as it is (its speakers, on a laptop with nothing plugged in).
 * Ties go by name, so the same outputs always give the same answer.
 */
export function chooseOutput(outputs: AudioOutputDevice[], choice: OutputChoice, audienceScreens: string[] = []): OutputDecision {
  const chosen = choice !== "auto" && choice ? outputs.find((output) => output.id === choice) : undefined;
  const missing = choice !== "auto" && !!choice && !chosen;
  if (chosen) return { output: chosen, why: "chosen", missing: false };
  const current = outputs.find((output) => output.isDefault) ?? null;
  if (current && isRoomOutput(current)) return { output: current, why: "default-external", missing };
  const interfaces = outputs.filter((output) => INTERFACES.includes(output.transport)).sort(byName);
  if (interfaces[0]) return { output: interfaces[0], why: "interface", missing };
  const displays = outputs.filter((output) => DISPLAYS.includes(output.transport)).sort(byName);
  const screen = displays.find((output) => audienceScreens.some((name) => sameName(name, output.name)));
  if (screen) return { output: screen, why: "display", missing };
  return { output: current ?? outputs.find((output) => output.transport === "built-in") ?? null, why: "computer", missing };
}

/** The same outputs, whatever order the computer lists them in: a change means one came or went. */
export const outputsKey = (outputs: AudioOutputDevice[]) =>
  outputs
    .map((output) => `${output.id}:${output.transport}`)
    .sort()
    .join("|");

export const TRANSPORT_LABELS: Record<Transport, string> = {
  "built-in": "This computer",
  usb: "USB",
  hdmi: "HDMI",
  displayport: "DisplayPort",
  thunderbolt: "Thunderbolt",
  firewire: "FireWire",
  pci: "Sound card",
  bluetooth: "Bluetooth",
  airplay: "AirPlay",
  virtual: "Virtual",
  aggregate: "Combined",
  unknown: "Other",
};

export function sanitizeTransport(value: unknown): Transport {
  return typeof value === "string" && Object.hasOwn(TRANSPORT_LABELS, value) ? (value as Transport) : "unknown";
}

/** What to do after the outputs changed (or the church chose): switch or not, and what to tell the desk. */
export type OutputPlan = {
  decision: OutputDecision;
  /** The output to make the computer's sound output now; null leaves it as it is. */
  switchTo: AudioOutputDevice | null;
  notice: { kind: "unplugged"; name: string; output: string } | { kind: "moved"; output: string; cause: "plugged-in" | "unplugged" | "screen" | "other" } | { kind: "start"; output: string } | null;
};

/**
 * `before` is the list from the last check (null at start, or when the church just chose).
 * The computer's own sound output is never touched to fall back to it, only to move to the room's
 * (or to what the church chose), so a laptop with nothing plugged in keeps the sound it has.
 */
export function planOutput(before: AudioOutputDevice[] | null, outputs: AudioOutputDevice[], choice: OutputChoice, audienceScreens: string[], options: { chosenNow?: boolean; chosenName?: string } = {}): OutputPlan {
  const decision = chooseOutput(outputs, choice, audienceScreens);
  const target = decision.output;
  const current = outputs.find((output) => output.isDefault) ?? null;
  if (!target) return { decision, switchTo: null, notice: null };
  const moving = target.id !== current?.id && (decision.why !== "computer" || !!options.chosenNow);
  const switchTo = moving ? target : null;
  if (!before) return { decision, switchTo, notice: moving && !options.chosenNow ? { kind: "start", output: target.name } : null };
  const came = outputs.filter((output) => !before.some((old) => old.id === output.id));
  const went = before.filter((old) => !outputs.some((output) => output.id === old.id));
  const wasInUse = before.find((output) => output.isDefault);
  const lost = !!wasInUse && went.some((output) => output.id === wasInUse.id);
  if (decision.missing && went.length) return { decision, switchTo, notice: { kind: "unplugged", name: options.chosenName ?? "", output: target.name } };
  if (!moving && !lost) return { decision, switchTo, notice: null };
  const cause = came.some((output) => output.id === target.id) ? "plugged-in" : lost ? "unplugged" : decision.why === "display" ? "screen" : "other";
  return { decision, switchTo, notice: { kind: "moved", output: target.name, cause } };
}
