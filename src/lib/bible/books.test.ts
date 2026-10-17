import { describe, expect, it } from "vitest";
import { closestBook, nameScore, normalizeOrdinals } from "./books";
import { CANON, parseReference } from "./reference";
import { spokenReference } from "../voice/detect";

const ref = (hit: ReturnType<typeof parseReference>) => (hit ? `${hit.bookName} ${hit.chapter}:${hit.startVerse}` : null);

describe("numbered books: first, 1st, one, I and 1 are the same", () => {
  it("rewrites ordinals only before a numbered book", () => {
    expect(normalizeOrdinals("first corinthians 13")).toBe("1 corinthians 13");
    expect(normalizeOrdinals("the second letter to timothy 3")).toBe("2 timothy 3");
    expect(normalizeOrdinals("the first epistle of john 4")).toBe("1 john 4");
    expect(normalizeOrdinals("3rd john 2")).toBe("3 john 2");
    expect(normalizeOrdinals("first of all")).toBe("first of all");
    expect(normalizeOrdinals("i believe in one god")).toBe("i believe in one god");
  });

  it("finds the same book whichever way it is typed", () => {
    for (const typed of ["1 Corinthians 13:4", "first corinthians 13:4", "1st Cor 13:4", "one corinthians 13:4", "I Corinthians 13:4", "1cor 13:4"]) {
      expect(ref(parseReference(typed))).toBe("1 Corinthians 13:4");
    }
    expect(ref(parseReference("second kings 2:11"))).toBe("2 Kings 2:11");
    expect(ref(parseReference("third john 1:2"))).toBe("3 John 1:2");
    expect(ref(parseReference("first corinthians 13 4"))).toBe("1 Corinthians 13:4");
    expect(ref(parseReference("john 3v16"))).toBe("John 3:16");
  });

  it("hears them the same in speech", () => {
    expect(ref(spokenReference("turn with me to first corinthians thirteen four"))).toBe("1 Corinthians 13:4");
    expect(ref(spokenReference("one corinthians thirteen verse four"))).toBe("1 Corinthians 13:4");
    expect(ref(spokenReference("second timothy three sixteen"))).toBe("2 Timothy 3:16");
    expect(ref(spokenReference("the first epistle of john chapter four verse eight"))).toBe("1 John 4:8");
  });
});

describe("misheard and misspelled book names", () => {
  it("scores sound-alikes high and strangers low", () => {
    expect(nameScore("ga tians", "galatians")).toBeGreaterThan(0.7);
    expect(nameScore("siah", "isaiah")).toBeGreaterThan(0.7);
    expect(nameScore("galations", "galatians")).toBeGreaterThan(0.85);
    expect(nameScore("philipians", "philippians")).toBeGreaterThan(0.85);
    expect(nameScore("tians", "corinthians")).toBeLessThan(0.66);
    expect(nameScore("meeting", "matthew")).toBeLessThan(0.66);
  });

  it("finds the book from the part that was heard", () => {
    expect(ref(spokenReference("please turn to ga tians five twenty two"))).toBe("Galatians 5:22");
    expect(ref(spokenReference("siah fifty three five"))).toBe("Isaiah 53:5");
    expect(ref(spokenReference("in a siah forty verse thirty one"))).toBe("Isaiah 40:31");
    expect(ref(spokenReference("fill a peons four thirteen"))).toBe("Philippians 4:13");
    expect(ref(spokenReference("revelations twenty one four"))).toBe("Revelation 21:4");
    expect(ref(spokenReference("first corinth ians thirteen four"))).toBe("1 Corinthians 13:4");
  });

  it("types the same way", () => {
    expect(ref(parseReference("galations 5:22"))).toBe("Galatians 5:22");
    expect(ref(parseReference("isiah 53:5"))).toBe("Isaiah 53:5");
    expect(ref(parseReference("1 corintians 13:4"))).toBe("1 Corinthians 13:4");
    expect(ref(parseReference("phillipians 4:13"))).toBe("Philippians 4:13");
  });

  it("does not invent a book from ordinary words", () => {
    expect(spokenReference("we meet at ten thirty on sunday")).toBeNull();
    expect(spokenReference("page three sixteen of the bulletin")).toBeNull();
    expect(spokenReference("i have two kids and one dog")).toBeNull();
    // The numbers must fit the book: Jude has one chapter.
    expect(closestBook("jude", CANON)?.book.name).toBe("Jude");
    expect(spokenReference("jew twelve four")).toBeNull();
  });

  it("opens a chapter when only the chapter is said", () => {
    expect(ref(spokenReference("let us read romans chapter eight"))).toBe("Romans 8:1");
    expect(ref(spokenReference("psalm chapter twenty three"))).toBe("Psalms 23:1");
  });
});
