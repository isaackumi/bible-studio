// Starter content a church adds when it wants it: quiz packs (static/starter/quizzes), the sample
// service (static/starter/services) and, through the Songs window, song packs. Each is a small
// file shipped with the app, read only when asked for, so nothing weighs on the desk until then.

import { formatReference, parseReference } from "../bible/reference";
import { sanitizeGame, type Game } from "../domain/games";
import { buildSample, sanitizeSample } from "../domain/sample-service";
import type { BibleItem } from "../domain/types";
import { t, tn } from "../i18n/core";
import { session } from "./session.svelte";

export type QuizPack = { id: string; name: string; description: string; file: string; count: number };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valid packs from index.json: an id, a name and a .json file name without a path. */
export function sanitizeQuizPacks(value: unknown): QuizPack[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): QuizPack[] => {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const id = text(record.id, 60);
    const name = text(record.name, 80);
    const file = text(record.file, 120);
    if (!id || !name || !/^[\w.-]+\.json$/i.test(file) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, description: text(record.description, 200), file, count: Math.max(0, Math.round(Number(record.count) || 0)) }];
  });
}

/** A pack's games with ids of their own ("pack:<pack>:<n>"), so adding twice changes nothing. */
export function packGames(packId: string, value: unknown): Game[] {
  const list = value && typeof value === "object" && Array.isArray((value as { games?: unknown }).games) ? (value as { games: unknown[] }).games : [];
  return list.flatMap((raw, index) => {
    const game = sanitizeGame(raw);
    return game && game.questions.length ? [{ ...game, id: `pack:${packId}:${index + 1}`, updatedAt: new Date().toISOString() }] : [];
  });
}

class QuizPacks {
  packs = $state<QuizPack[]>([]);
  busy = $state<string | null>(null);
  error = $state("");
  private loaded = false;

  load = async () => {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const response = await fetch("starter/quizzes/index.json", { cache: "no-store" });
      this.packs = response.ok ? sanitizeQuizPacks(await response.json()) : [];
    } catch {
      this.packs = [];
    }
  };

  installed = (id: string) => (session.workspace.games ?? []).some((game) => game.id.startsWith(`pack:${id}:`));

  install = async (pack: QuizPack) => {
    this.busy = pack.id;
    this.error = "";
    try {
      const response = await fetch(`starter/quizzes/${pack.file}`);
      if (!response.ok) throw new Error(String(response.status));
      const games = packGames(pack.id, await response.json());
      // Oldest first, so the pack keeps its own order at the top of the list.
      for (const game of [...games].reverse()) session.saveGame(game);
      session.message = t("{name}: {games} added.", { name: pack.name, games: tn(games.length, "{n} game", "{n} games") });
    } catch {
      this.error = t("{name} could not be added. Try again.", { name: pack.name });
    } finally {
      this.busy = null;
    }
  };
}

export const quizPacks = new QuizPacks();

/** The Bible a sample reading uses: the desk's, then the King James, then any on this computer. */
function sampleTranslation(): string | null {
  const installed = (id: string | null | undefined) => (id && session.translations.some((entry) => entry.id === id) ? id : null);
  return installed(session.workspace.deskTranslationId) ?? installed("kjv") ?? session.translations.find((entry) => !entry.id.startsWith("api:"))?.id ?? session.translations[0]?.id ?? null;
}

function sampleBible(reference: string, translationId: string | null): BibleItem | null {
  const parsed = translationId ? parseReference(reference, session.books) : null;
  if (!parsed?.startVerse || !translationId) return null;
  const end = parsed.endVerse ?? parsed.startVerse;
  const chapters = session.books.find((book) => book.ord === parsed.bookOrd)?.chapters ?? 1;
  return { translationId, bookOrd: parsed.bookOrd, chapter: parsed.chapter, startVerse: parsed.startVerse, endVerse: end, reference: formatReference(parsed.bookName, parsed.chapter, parsed.startVerse, end, chapters) };
}

const fold = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The sample Sunday service, built with this computer's songs and Bible: the classic hymns are
 * added first when they are not in the library yet, then the service, its sermon and its quiz.
 */
export const sampleService = new (class {
  busy = $state(false);

  install = async (): Promise<boolean> => {
    if (this.busy) return false;
    this.busy = true;
    try {
      const response = await fetch("starter/services/sunday-sample.json");
      if (!response.ok) throw new Error(String(response.status));
      const raw = (await response.json()) as { games?: unknown };
      const spec = sanitizeSample(raw);
      if (!spec) throw new Error("sample");
      const wanted = spec.sections.flatMap((section) => section.items.flatMap((item) => ("song" in item ? [item.song] : [])));
      const has = (title: string) => session.songs.some((song) => fold(song.title) === fold(title));
      if (wanted.some((title) => !has(title))) {
        await session.loadSongPacks();
        const starter = session.songPacks.find((pack) => pack.starter);
        if (starter && !session.workspace.installedPacks.includes(starter.id)) await session.installSongPack(starter);
      }
      const translationId = sampleTranslation();
      const built = buildSample(
        spec,
        {
          song: (title) => {
            const song = session.songs.find((entry) => fold(entry.title) === fold(title));
            const first = song?.sections[0];
            return song && first ? { songId: song.id, sectionId: first.id } : null;
          },
          bible: (reference) => sampleBible(reference, translationId),
        },
        () => crypto.randomUUID(),
      );
      await session.openNewService(built.service);
      if (built.sermon) await session.saveSermon(built.sermon);
      for (const game of packGames("sample-service-v1", raw)) if (!(session.workspace.games ?? []).some((entry) => entry.id === game.id)) session.saveGame(game);
      const parts = tn(built.service.sections.length, "{n} part", "{n} parts");
      session.message = built.missing.length
        ? t("{name} is ready with {parts}. Not added: {missing}.", { name: built.service.name, parts, missing: built.missing.join(", ") }) + (translationId ? "" : ` ${t("Install a Bible in Settings › Bible for the readings.")}`)
        : t("{name} is ready with {parts}: songs, readings, the sermon, announcements and a quiz.", { name: built.service.name, parts });
      return true;
    } catch {
      session.warn(t("The sample service could not be added. Try again."));
      return false;
    } finally {
      this.busy = false;
    }
  };
})();

/** Packs a new church starts with, when it keeps "Start with samples" on in setup. */
const STARTER_QUIZ_PACKS = ["sunday-school-v1", "church-polls-v1"];

/**
 * Everything to try the app with, in one go: the classic hymns and the sample Sunday service (with
 * its sermon and quiz), and two quiz packs. Quiet: each piece that fails is simply left out.
 */
export async function installStarterKit(): Promise<void> {
  await sampleService.install().catch(() => false);
  await quizPacks.load();
  for (const pack of quizPacks.packs.filter((entry) => STARTER_QUIZ_PACKS.includes(entry.id) && !quizPacks.installed(entry.id))) await quizPacks.install(pack);
  session.message = t("Samples added: classic hymns, a sample Sunday service with its sermon, and quizzes. Change or delete any of them.");
}
