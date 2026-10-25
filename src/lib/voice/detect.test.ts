import { describe, expect, it } from "vitest";
import { bundledQuoteCatalog } from "../bible/texts";
import { buildQuoteIndex, chooseHeard, detectVerse, matchSpoken, spokenReference, type QuoteVerse } from "./detect";

const genesis = { ord: 1, name: "Genesis", chapters: 50 };

describe("voice verse detection", () => {
  it("matches a spoken verse from the open chapter", () => {
    const hit = detectVerse(
      "In the beginning God created the heaven and the earth",
      [
        { verse: 1, text: "In the beginning God created the heaven and the earth." },
        { verse: 2, text: "And the earth was without form, and void." },
      ],
      genesis,
      1,
      "kjv",
    );
    expect(hit?.reference).toBe("Genesis 1:1");
    expect(hit?.startVerse).toBe(1);
  });

  it("hears a spoken reference without a colon", () => {
    expect(spokenReference("John 3 16")?.startVerse).toBe(16);
    expect(spokenReference("john chapter 3 verse 16")?.chapter).toBe(3);
  });

  it("reads the way speech writes a reference", () => {
    expect(spokenReference("John 316")).toMatchObject({ bookOrd: 43, chapter: 3, startVerse: 16 });
    expect(spokenReference("joshua one verse eight")).toMatchObject({ bookOrd: 6, chapter: 1, startVerse: 8 });
    expect(spokenReference("john three sixteen")?.startVerse).toBe(16);
  });

  it("shows the latest reference in a noisy transcript", () => {
    const hit = spokenReference(
      "Efficient was 12 best off Don't resist John 316 John three Thank you Joshua one verse eight mosquito Joshua one verse eight I draw a line",
    );
    expect(hit).toMatchObject({ bookOrd: 6, chapter: 1, startVerse: 8 });
  });

  it("does not invent a live take from a short fragment", () => {
    expect(detectVerse("and the", [{ verse: 1, text: "In the beginning God created the heaven and the earth." }], genesis, 1, "kjv")).toBeNull();
  });

  it("finds a quoted verse in another book", () => {
    const catalog: QuoteVerse[] = [
      {
        bookOrd: 1,
        bookName: "Genesis",
        chaptersInBook: 50,
        chapter: 1,
        verse: 1,
        text: "In the beginning God created the heaven and the earth.",
        normalized: "in the beginning god created the heaven and the earth",
      },
      {
        bookOrd: 43,
        bookName: "John",
        chaptersInBook: 21,
        chapter: 3,
        verse: 16,
        text: "For God so loved the world, that he gave his only begotten Son.",
        normalized: "for god so loved the world that he gave his only begotten son",
      },
    ];
    const hit = matchSpoken("For God so loved the world that he gave", catalog, "kjv");
    expect(hit?.item.reference).toBe("John 3:16");
    expect(hit?.item).not.toHaveProperty("action");
  });

  it("does not link a vague sentence to a verse", () => {
    const catalog: QuoteVerse[] = [
      {
        bookOrd: 43,
        bookName: "John",
        chaptersInBook: 21,
        chapter: 3,
        verse: 16,
        text: "For God so loved the world, that he gave his only begotten Son.",
        normalized: "for god so loved the world that he gave his only begotten son",
      },
    ];
    expect(matchSpoken("please pass the microphone to the sound booth", catalog, "kjv")).toBeNull();
  });

  it("hears a citation inside a sentence and can leave the open book", () => {
    const hit = matchSpoken("please turn to john chapter 3 verse 16", [], "kjv");
    expect(hit?.item).toMatchObject({ bookOrd: 43, chapter: 3, startVerse: 16 });
  });

  it("finds John 3:16 in the King James catalog", async () => {
    const catalog = await bundledQuoteCatalog("kjv");
    const hit = matchSpoken("for god so loved the world", catalog, "kjv");
    expect(hit?.item.reference).toBe("John 3:16");
    expect(matchSpoken("god so loved the world he gave his son", catalog, "kjv")?.item.reference).toBe("John 3:16");
    expect(matchSpoken("for god so loved the wrld that he gave his only begoten son", catalog, "kjv")?.item.reference).toBe("John 3:16");
    expect(
      matchSpoken("joshua one verse eight for god so loved the world that he gave his only begotten son", catalog, "kjv")?.item.reference,
    ).toBe("John 3:16");
    expect(matchSpoken("please pass the microphone to the sound booth", catalog, "kjv")).toBeNull();
    expect(chooseHeard(["efficient was twelve", "for god so loved the world"], catalog, "kjv")?.item.reference).toBe("John 3:16");
    // Builds the whole KJV quote catalog (~4s alone, 20s+ when the machine is busy with the full suite).
  }, 60_000);

  it("returns a preview passage, not a program action", () => {
    const hit = detectVerse(
      "In the beginning God created the heaven and the earth",
      [{ verse: 1, text: "In the beginning God created the heaven and the earth." }],
      genesis,
      1,
      "kjv",
    );
    expect(hit).toMatchObject({ translationId: "kjv", startVerse: 1, endVerse: 1 });
    expect(hit).not.toHaveProperty("action");
  });
});


describe("finding a verse from part of it (KJV)", async () => {
  const { buildQuoteIndex, searchQuotes } = await import("./detect");
  const index = buildQuoteIndex(await bundledQuoteCatalog("kjv"));
  const heard = (text: string) => matchSpoken(text, index, "kjv")?.item.reference ?? null;

  it("pulls the verse from the middle of it", () => {
    expect(heard("charity suffereth long and is kind")).toBe("1 Corinthians 13:4");
    expect(heard("they shall mount up with wings as eagles")).toBe("Isaiah 40:31");
    expect(heard("i can do all things through christ")).toBe("Philippians 4:13");
  });

  it("survives a misheard word", () => {
    // "strengtheneth" heard as "strength in it", "eagles" as "eagle".
    expect(heard("all things through christ which strength in it me")).toBe("Philippians 4:13");
    expect(heard("mount up with wings as eagle they shall run")).toBe("Isaiah 40:31");
  });

  it("ranks a typed phrase by the words it contains, slips allowed", () => {
    const first = (query: string) => {
      const hit = searchQuotes(query, index)[0];
      return hit ? `${hit.bookName} ${hit.chapter}:${hit.verse}` : null;
    };
    expect(first("charity suffereth long kind")).toBe("1 Corinthians 13:4");
    expect(first("lord is my shepherd")).toBe("Psalms 23:1");
    expect(first("wings eagles run weary")).toBe("Isaiah 40:31");
    expect(first("shepard want")).toBe("Psalms 23:1");
    expect(searchQuotes("the and of", index)).toEqual([]);
  });

  it("hears references the way preachers say them (found missing in a real service)", () => {
    // "and verse" between the chapter and the verse.
    expect(spokenReference("Open your Bibles to Philippians 4 and verse 13.")).toMatchObject({ bookName: "Philippians", chapter: 4, startVerse: 13 });
    // The verse said a few words after the chapter.
    expect(spokenReference("Luke 15, the parable of the prodigal son, verse 11.")).toMatchObject({ bookName: "Luke", chapter: 15, startVerse: 11 });
    expect(spokenReference("Romans 8, and look at verse 28")).toMatchObject({ chapter: 8, startVerse: 28 });
    // A chapter on its own, after "turn to", "go with me to"…, and any Psalm: from its first verse.
    expect(spokenReference("Go with me to Psalm 23.")).toMatchObject({ bookName: "Psalms", chapter: 23, startVerse: 1 });
    expect(spokenReference("Turn with me to Isaiah 53")).toMatchObject({ bookName: "Isaiah", chapter: 53, startVerse: 1 });
    expect(spokenReference("open to the book of Ruth chapter 1")).toMatchObject({ bookName: "Ruth", chapter: 1, startVerse: 1 });
    // Ranges said with "to" after "verse".
    expect(spokenReference("First Corinthians thirteen verse four to seven")).toMatchObject({ chapter: 13, startVerse: 4, endVerse: 7 });
  });

  it("does not take every number after a book's name for a reference", () => {
    // A name with a number that is not a reference: no cue, not a Psalm, no verse.
    expect(spokenReference("Mark 2 people came in late")).toBeNull();
    expect(spokenReference("John 5 of you stood up")).toBeNull();
    // A verse word too far away, with other numbers between, is not this chapter's verse.
    expect(spokenReference("Luke 15 was 20 years ago verse 11")?.startVerse ?? null).not.toBe(11);
  });

  it("finds a famous verse from a short phrase of it, said the way people say it (KJV)", async () => {
    const index = buildQuoteIndex(await bundledQuoteCatalog("kjv"));
    const found = (said: string) => matchSpoken(said, index, "kjv")?.item.reference ?? null;
    expect(found("in him is life")).toBe("John 1:4");
    expect(found("in him was life")).toBe("John 1:4");
    expect(found("the lord is my shepherd")).toBe("Psalms 23:1");
    expect(found("jesus wept")).toBe("John 11:35");
    expect(found("be still and know that I am God")).toBe("Psalms 46:10");
    expect(found("rejoice in the Lord always")).toBe("Philippians 4:4");
    // Inside what a preacher says around it.
    expect(found("church John tells us that in him was life and that is good news")).toBe("John 1:4");
    // Everyday church words are not verses.
    for (const said of ["good morning church", "please be seated", "turn to your neighbour and say", "God is good all the time", "thank you very much", "let us pray", "lift your hands"]) {
      expect(found(said), said).toBeNull();
    }
  });

  it("finds a verse quoted in modern words by matching King James and the World English Bible together", async () => {
    const index = buildQuoteIndex([...(await bundledQuoteCatalog("kjv")), ...(await bundledQuoteCatalog("web"))]);
    const found = (said: string) => matchSpoken(said, index, "kjv")?.item.reference ?? null;
    // Modern wording the King James does not have, at the start of a long verse.
    expect(found("love is patient")).toBe("1 Corinthians 13:4");
    expect(found("for God so loved the world that he gave his only born son")).toBe("John 3:16");
    // The same verse in two versions is one verse, not two choices.
    expect(found("the lord is my shepherd")).toBe("Psalms 23:1");
    expect(found("jesus wept")).toBe("John 11:35");
    // The World English Bible says "Yahweh" where people say "the Lord".
    expect(found("this is the day that the lord has made")).toBe("Psalms 118:24");
    // Shown in the desk's own version, whichever version the words matched.
    expect(matchSpoken("love is patient", index, "kjv")?.item.translationId).toBe("kjv");
    for (const said of ["good morning church", "turn to your neighbour and say", "God is good all the time", "please be seated", "close your eyes and bow your heads"]) expect(found(said), said).toBeNull();
  });

  it("with the Berean Standard Bible too, finds what people quote from modern Bibles", async () => {
    const index = buildQuoteIndex([...(await bundledQuoteCatalog("kjv")), ...(await bundledQuoteCatalog("web")), ...(await bundledQuoteCatalog("bsb"))]);
    const found = (said: string) => matchSpoken(said, index, "kjv")?.item.reference ?? null;
    expect(found("for I know the plans I have for you")).toBe("Jeremiah 29:11");
    expect(found("love is patient love is kind")).toBe("1 Corinthians 13:4");
    expect(found("in him is life")).toBe("John 1:4");
    for (const said of ["good morning church", "turn to your neighbour and say", "God is good all the time", "close your eyes and bow your heads", "please be seated"]) expect(found(said), said).toBeNull();
  });
});

