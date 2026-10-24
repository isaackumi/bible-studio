// The game music's styles, by name, for the desk to choose from. Kept apart from the sound engine
// (sounds.ts), which loads only on the audience screen or when the desk listens to one.

export const MUSIC_STYLES = ["classic", "upbeat", "arcade", "gospel", "epic", "chill"] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number] | "surprise";

/** Each style's name and what it sounds like, for the desk. */
export const MUSIC_STYLE_INFO: Record<MusicStyle, { name: string; hint: string }> = {
  classic: { name: "Game show", hint: "Bright and friendly, the original" },
  upbeat: { name: "Upbeat pop", hint: "Claps and a bouncing bass" },
  arcade: { name: "Arcade", hint: "8-bit, like an old video game" },
  gospel: { name: "Gospel shuffle", hint: "Organ, swing and handclaps" },
  epic: { name: "Epic", hint: "Big drums and strings, for a final" },
  chill: { name: "Lo-fi", hint: "Calm and gentle, for little ones or a quiet room" },
  surprise: { name: "Surprise me", hint: "A different style each game" },
};

export const sanitizeMusicStyle = (value: unknown): MusicStyle => (typeof value === "string" && Object.hasOwn(MUSIC_STYLE_INFO, value) ? (value as MusicStyle) : "classic");

