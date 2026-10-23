import { api } from "../db/api";
import { gameRequest, parseGame, type GameAudience, type GameLevel, type GameSource } from "../ai/games";
import { parseSlides, slidesRequest, type SlideSource } from "../ai/slides";
import { findSongRequest, hymnRequest, parseHymn, parseSongMatches, parseSongSuggestions, suggestSongsRequest, wordsAreFree, type SongMatch } from "../ai/songs";
import { aiFeatureOn, aiReady, modelsRequest, parseModels, parseSummary, replyText, summaryRequest, type AiFeature, type AiRequest, type AiSettings, type SermonSummary } from "../ai/summarize";
import { parseHeardVerses, versesRequest, VERSE_ASK_GAP_SECONDS, type HeardVerse } from "../ai/verses";
import { liveNotesRequest, parseLiveNotes } from "../ai/live-notes";
import { deckFromOutline, type SlideDeck } from "../domain/decks";
import type { Game } from "../domain/games";
import { parseLyrics, sanitizeSong } from "../domain/song";
import type { Sermon, Song } from "../domain/types";
import { currentLanguage, t, tn } from "../i18n/core";

/** What the assistant needs from the session: the church's AI settings and songs, and where results go. */
export type AiHost = {
  settings: () => AiSettings;
  songs: () => Song[];
  saveDeck: (deck: SlideDeck) => void;
  addDeckToService: (deckId: string, sectionId?: string) => Promise<void>;
  say: (message: string) => void;
};

/**
 * Everything the church's own AI does (Settings › AI assistant): sermon summaries, slides, songs,
 * verses by meaning and quizzes. Each feature asks only when the AI is set up and switched on for
 * it, and nothing is sent until the operator asks (verses by meaning: only phrases that sound like
 * scripture, and only when switched on).
 */
export class AiAssistant {
  private verseAskedAt = 0;
  private verseAsking = false;

  constructor(private readonly host: AiHost) {}

  /** Refuse a feature that is not set up or switched off, saying which. */
  private settingsFor(feature: AiFeature): AiSettings {
    const settings = this.host.settings();
    if (!aiReady(settings)) throw new Error(t("Set up the AI in Settings › AI assistant first."));
    if (!aiFeatureOn(settings, feature)) throw new Error(t("This AI feature is switched off in Settings › AI assistant."));
    return settings;
  }

  /** Send a request to the church's AI (any feature; callers check it is switched on). */
  post(request: AiRequest): Promise<unknown> {
    return this.reach(() => api.aiPost(request));
  }

  /** When nothing answers on this computer, the AI app is most likely closed: say so. */
  private async reach(send: () => Promise<unknown>): Promise<unknown> {
    try {
      return await send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.host.settings().provider === "local" && /could not be reached|failed to fetch|load failed|connection refused/i.test(message)) {
        throw new Error(t("Nothing answered on this computer. Open Ollama or LM Studio, and check the address."));
      }
      throw error;
    }
  }

  /**
   * Verses the preacher paraphrased or described, from the church's AI. Empty when the feature is
   * off, a question is already out, or one was asked in the last few seconds.
   */
  versesFromSpeech = async (heard: string): Promise<HeardVerse[]> => {
    const settings = this.host.settings();
    if (!aiReady(settings) || !aiFeatureOn(settings, "verses") || this.verseAsking) return [];
    if (Date.now() - this.verseAskedAt < VERSE_ASK_GAP_SECONDS * 1000) return [];
    this.verseAsking = true;
    this.verseAskedAt = Date.now();
    try {
      return parseHeardVerses(replyText(settings.provider, await this.post(versesRequest(settings, heard))));
    } catch {
      return [];
    } finally {
      this.verseAsking = false;
    }
  };

  /**
   * Summarize sermon notes into a short summary and screen-ready points with the church's own
   * AI service. Nothing is sent anywhere until the operator asks.
   */
  summarizeSermon = async (input: { title: string; notes: string }): Promise<SermonSummary> => {
    const settings = this.settingsFor("summary");
    if (!input.notes.trim()) throw new Error(t("Write some notes first; the summary is made from them."));
    const reply = await this.post(summaryRequest(settings, input));
    return parseSummary(replyText(settings.provider, reply));
  };

  /** AI slide generation: a deck from notes, a passage or a topic, saved to the slide library. */
  generateSlides = async (input: { source: SlideSource; text: string; title?: string; count: number; addToService?: boolean; sectionId?: string }): Promise<SlideDeck> => {
    const settings = this.settingsFor("slides");
    if (!input.text.trim()) throw new Error(input.source === "topic" ? t("Type a topic first.") : input.source === "passage" ? t("Type a Bible passage first.") : t("Write some notes first; the slides are made from them."));
    const reply = await this.post(slidesRequest(settings, input));
    const outline = parseSlides(replyText(settings.provider, reply));
    const deck = deckFromOutline(input.title?.trim() || outline.title, outline.slides);
    this.host.saveDeck(deck);
    if (input.addToService) await this.host.addDeckToService(deck.id, input.sectionId);
    this.host.say(t("{name}: {pages} made. Edit them on the Production Desk › Media › Slides.", { name: deck.name, pages: tn(deck.pages.length, "{n} slide", "{n} slides") }));
    return deck;
  };

  /** The models the chosen AI offers, for Settings › AI assistant. */
  models = async (): Promise<string[]> => {
    const settings = this.host.settings();
    if (settings.provider !== "local" && !settings.key) throw new Error(t("Paste your key first."));
    const models = parseModels(await this.reach(() => api.aiGet(modelsRequest(settings))));
    if (!models.length) throw new Error(settings.provider === "local" ? t("No models yet. Download one in Ollama or LM Studio first.") : t("The AI service listed no models for this key."));
    return models;
  };

  /** Songs the AI thinks the typed words are: a title, a line remembered, or what it is about. */
  findSongs = async (query: string): Promise<SongMatch[]> => {
    const settings = this.settingsFor("songLookup");
    if (!query.trim()) throw new Error(t("Type a title, a line you remember, or what the song is about."));
    const songs = parseSongMatches(replyText(settings.provider, await this.post(findSongRequest(settings, query))));
    if (!songs.length) throw new Error(t("The AI found no song for that. Try other words."));
    return songs;
  };

  /** A public-domain hymn's words, as a new song to check and save. Never for copyrighted songs. */
  hymn = async (match: SongMatch, folder: string): Promise<Song> => {
    const settings = this.settingsFor("songLookup");
    if (!wordsAreFree(match)) throw new Error(t("These words are under copyright. Get the song from SongSelect."));
    const words = parseHymn(replyText(settings.provider, await this.post(hymnRequest(settings, match))));
    const parsed = parseLyrics(words);
    if (!parsed.sections.length) throw new Error(t("The AI answer was not in the expected shape. Try again."));
    return sanitizeSong({ id: crypto.randomUUID(), title: match.title, author: match.authors, sections: parsed.sections, folder, ...(match.ccli ? { ccli: match.ccli } : {}) });
  };

  /** Songs for a sermon: picks from the church's own library first, then a few it could add. */
  suggestSongs = async (input: { title: string; notes: string }): Promise<{ library: Array<{ song: Song; why: string }>; others: Array<{ title: string; authors: string; why: string }> }> => {
    const settings = this.settingsFor("songSuggest");
    if (!input.notes.trim() && !input.title.trim()) throw new Error(t("Give the sermon a title or some notes first."));
    const songs = [...this.host.songs()].sort((a, b) => a.title.localeCompare(b.title));
    const picks = parseSongSuggestions(replyText(settings.provider, await this.post(suggestSongsRequest(settings, { ...input, songs }))), songs.length);
    return { library: picks.library.map((pick) => ({ song: songs[pick.index]!, why: pick.why })), others: picks.others };
  };

  /** Live sermon notes: the notes so far, updated with the newest words heard (live-notes.svelte.ts). */
  tidyNotes = async (input: { title: string; notes: string; heard: string }): Promise<string> => {
    const settings = this.settingsFor("notes");
    const notes = parseLiveNotes(replyText(settings.provider, await this.post(liveNotesRequest(settings, input))));
    if (!notes) throw new Error(t("The AI answer was not in the expected shape. Try again."));
    return notes;
  };

  /** A quiz written by the AI, not saved: the operator checks every question in the editor first. */
  makeGame = async (input: { source: GameSource; title: string; text: string; count: number; level: GameLevel; audience: GameAudience }): Promise<Game> => {
    const settings = this.settingsFor("games");
    if (!input.text.trim()) throw new Error(input.source === "topic" ? t("Type a topic first.") : input.source === "passage" ? t("Type a Bible passage first.") : input.source === "reading" ? t("Paste the summary of what was read first.") : input.source === "text" ? t("Paste some text first.") : t("This sermon has no notes yet. Add notes or a summary first."));
    return parseGame(replyText(settings.provider, await this.post(gameRequest(settings, { ...input, language: currentLanguage() }))), input);
  };
}

/** A sermon as plain words for the AI: its notes, then each part's name, notes, slides and verses, then notes taken live. */
export function sermonText(sermon: Sermon): string {
  const parts = [sermon.notes.trim()];
  for (const section of sermon.sections) {
    const lines = [section.name, section.notes, ...section.items.map((item) => (item.slide ? `${item.slide.heading}\n${item.slide.body}` : item.bible ? item.title : ""))].map((line) => line.trim()).filter(Boolean);
    if (lines.length) parts.push(lines.join("\n"));
  }
  if (sermon.live?.notes.trim()) parts.push(`Notes taken while it was preached:\n${sermon.live.notes.trim()}`);
  return parts.filter(Boolean).join("\n\n");
}
