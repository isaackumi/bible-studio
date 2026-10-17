import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OnlineBibleError,
  USFM_BOOKS,
  clearOnlineCache,
  fetchOnlineChapter,
  fetchOnlinePassage,
  listOnlineBibles,
  parseVerseText,
  passageId,
  reportFums,
} from "./online";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async (..._args: Parameters<typeof fetch>) => jsonResponse(body, status)) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function passageBody(content: string, extra: Record<string, unknown> = {}) {
  return {
    data: { id: "JHN.3.16-JHN.3.18", bibleId: "b1", orgId: "o", content, reference: "John 3:16-18", verseCount: 3, copyright: "Scripture © Publisher. Used by permission.", ...extra },
    meta: { fums: "<script></script>", fumsId: "fid-1", fumsJsInclude: "", fumsJs: "", fumsNoScript: '<img src="https://fums.api.bible/f3?t=tok123" height="1" width="1"/>' },
  };
}

beforeEach(() => clearOnlineCache());

describe("passage ids", () => {
  it("has 66 USFM codes in canon order", () => {
    expect(USFM_BOOKS).toHaveLength(66);
    expect(USFM_BOOKS[0]).toBe("GEN");
    expect(USFM_BOOKS[42]).toBe("JHN");
    expect(USFM_BOOKS[65]).toBe("REV");
  });

  it("builds verse, range and chapter ids", () => {
    expect(passageId(43, 3, 16, 18)).toBe("JHN.3.16-JHN.3.18");
    expect(passageId(43, 3, 16)).toBe("JHN.3.16");
    expect(passageId(43, 3, 16, 16)).toBe("JHN.3.16");
    expect(passageId(43, 3)).toBe("JHN.3");
  });

  it("maps numbered and single-chapter books", () => {
    expect(passageId(46, 13, 4, 7)).toBe("1CO.13.4-1CO.13.7");
    expect(passageId(65, 1, 24)).toBe("JUD.1.24");
    expect(passageId(57, 1)).toBe("PHM.1");
    expect(() => passageId(67, 1)).toThrow();
  });
});

describe("listing translations", () => {
  it("parses, dedupes and sorts English first then by name", async () => {
    const fetchImpl = mockFetch({
      data: [
        { id: "es1", abbreviation: "RVR", name: "Reina Valera", description: "Spanish", language: { id: "spa", name: "Spanish" } },
        { id: "en2", abbreviation: "NKJV", name: "New King James Version", description: "", language: { id: "eng", name: "English" } },
        { id: "en1", abbreviation: "KJV", name: "King James (Authorised) Version", description: "Protestant", language: { id: "eng", name: "English" } },
        { id: "en2", abbreviation: "NKJV", name: "New King James Version", description: "", language: { id: "eng", name: "English" } },
        { id: "en3", abbreviation: "KJV", name: "King James (Authorised) Version", description: "copy", language: { id: "eng", name: "English" } },
      ],
    });
    const bibles = await listOnlineBibles("k", { fetch: fetchImpl });
    expect(bibles.map((bible) => bible.id)).toEqual(["en1", "en2", "es1"]);
    expect(bibles[0]).toEqual({ id: "en1", abbreviation: "KJV", name: "King James (Authorised) Version", language: "English", description: "Protestant" });
  });

  it("sends the key and language filter", async () => {
    const fetchImpl = mockFetch({ data: [] });
    await listOnlineBibles("secret", { language: "eng", fetch: fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.scripture.api.bible/v1/bibles?language=eng");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("secret");
  });
});

describe("verse parsing", () => {
  it("splits [n] markers with or without spaces", () => {
    expect(parseVerseText("[1]In the beginning was the Word. [2] He was with God.")).toEqual([
      { verse: 1, text: "In the beginning was the Word." },
      { verse: 2, text: "He was with God." },
    ]);
  });

  it("handles newlines, paragraph indentation and leading whitespace", () => {
    const content = "     [16] For God so loved the world,\n that he gave his one and only Son.\n     [17] For God did not send his Son\n\n     [18]  Whoever believes in him is not condemned ";
    expect(parseVerseText(content)).toEqual([
      { verse: 16, text: "For God so loved the world, that he gave his one and only Son." },
      { verse: 17, text: "For God did not send his Son" },
      { verse: 18, text: "Whoever believes in him is not condemned" },
    ]);
  });

  it("cleans text and joins a verse split across paragraphs", () => {
    expect(parseVerseText("[3] the LORD . [3] again")).toEqual([{ verse: 3, text: "the LORD. again" }]);
  });

  it("returns nothing for text without markers", () => {
    expect(parseVerseText("no markers")).toEqual([]);
  });
});

describe("fetching passages", () => {
  it("returns verses, copyright, reference and the FUMS token", async () => {
    const fetchImpl = mockFetch(passageBody("[16] For God so loved the world. [17] For God sent. [18] Whoever believes."));
    const passage = await fetchOnlinePassage("k", "b1", 43, 3, 16, 18, { fetch: fetchImpl });
    expect(passage.verses.map((verse) => verse.verse)).toEqual([16, 17, 18]);
    expect(passage.copyright).toBe("Scripture © Publisher. Used by permission.");
    expect(passage.reference).toBe("John 3:16-18");
    expect(passage.fums).toBe("tok123");
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("/bibles/b1/passages/JHN.3.16-JHN.3.18?content-type=text");
    expect(url).toContain("include-verse-numbers=true");
  });

  it("falls back to fumsId and to the asked verse when there are no markers", async () => {
    const body = passageBody("For God so loved the world.");
    body.meta.fumsNoScript = "";
    const passage = await fetchOnlinePassage("k", "b1", 43, 3, 16, null, { fetch: mockFetch(body) });
    expect(passage.verses).toEqual([{ verse: 16, text: "For God so loved the world." }]);
    expect(passage.fums).toBe("fid-1");
  });

  it("serves the same passage from the cache", async () => {
    const fetchImpl = mockFetch(passageBody("[1] In the beginning."));
    await fetchOnlinePassage("k", "b1", 1, 1, 1, 1, { fetch: fetchImpl });
    await fetchOnlinePassage("k", "b1", 1, 1, 1, 1, { fetch: fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await fetchOnlinePassage("k", "b2", 1, 1, 1, 1, { fetch: fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fetches a whole chapter by its chapter id", async () => {
    const fetchImpl = mockFetch(passageBody("[1] Jude, a servant. [2] Mercy to you."));
    const passage = await fetchOnlineChapter("k", "b1", 65, 1, { fetch: fetchImpl });
    expect(passage.verses).toHaveLength(2);
    expect(fetchImpl.mock.calls[0]![0]).toContain("/passages/JUD.1?");
    await expect(fetchOnlineChapter("k", "b1", 65, 2, { fetch: fetchImpl })).rejects.toMatchObject({ kind: "missing" });
  });
});

describe("errors", () => {
  it.each([
    [401, "key", "The API.Bible key was not accepted. Check it in Settings › Bible."],
    [403, "license", "Your API.Bible key is not licensed for this translation."],
    [404, "missing", "That passage is not in this translation."],
    [429, "rate", "API.Bible is busy. Try again in a minute."],
    [503, "network", "No internet connection, so online translations are unavailable. Bundled translations still work."],
  ])("maps status %i to %s", async (status, kind, message) => {
    const fetchImpl = mockFetch({ error: "x" }, status);
    const error = await fetchOnlinePassage("k", "b1", 43, 3, 16, null, { fetch: fetchImpl }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(OnlineBibleError);
    expect(error).toMatchObject({ kind, message, status });
  });

  it("maps a thrown fetch to a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(listOnlineBibles("k", { fetch: fetchImpl })).rejects.toMatchObject({ kind: "network" });
  });

  it("does not cache failures", async () => {
    const bad = mockFetch({}, 429);
    await expect(fetchOnlinePassage("k", "b1", 43, 3, 16, null, { fetch: bad })).rejects.toMatchObject({ kind: "rate" });
    const good = mockFetch(passageBody("[16] For God so loved the world."));
    await expect(fetchOnlinePassage("k", "b1", 43, 3, 16, null, { fetch: good })).resolves.toMatchObject({ verses: [{ verse: 16 }] });
  });
});

describe("FUMS reporting", () => {
  it("GETs the FUMS pixel with the token and ids", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    expect(await reportFums("tok123", fetchImpl, { deviceId: "dev", sessionId: "ses" })).toBe(true);
    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://fums.api.bible/f3");
    expect(url.searchParams.get("t")).toBe("tok123");
    expect(url.searchParams.get("dId")).toBe("dev");
    expect(url.searchParams.get("sId")).toBe("ses");
    expect(url.searchParams.get("uId")).toBe("anonymous");
  });

  it("never throws", async () => {
    const throwing = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(reportFums("tok", throwing)).resolves.toBe(false);
    await expect(reportFums(null, throwing)).resolves.toBe(false);
    const failing = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    await expect(reportFums("tok", failing)).resolves.toBe(false);
  });
});
