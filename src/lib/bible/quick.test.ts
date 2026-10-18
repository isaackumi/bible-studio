import { describe, expect, it } from "vitest";
import { bookMatches, quickLabel, quickRead } from "./quick";

const label = (text: string, here: { bookOrd: number; chapter: number } | null = null) => quickRead(text, here).refs.map((ref) => quickLabel(ref));
const john3 = { bookOrd: 43, chapter: 3 };

describe("quick scripture find", () => {
  it("reads squashed references", () => {
    expect(label("jn316")[0]).toBe("John 3:16");
    expect(label("j3 16")[0]).toBe("John 3:16");
    expect(label("1co13")[0]).toBe("1 Corinthians 13");
    expect(label("1co134")[0]).toBe("1 Corinthians 13:4");
    expect(label("rom828")[0]).toBe("Romans 8:28");
    expect(label("ps119105")[0]).toBe("Psalms 119:105");
    expect(label("rom 8 28-30")[0]).toBe("Romans 8:28-30");
    expect(label("jn3.16")[0]).toBe("John 3:16");
    expect(label("jude4")[0]).toBe("Jude 4");
  });

  it("opens a chapter, and offers the verse split too", () => {
    expect(label("ps23")).toEqual(["Psalms 23", "Psalms 2:3"]);
    expect(quickRead("ps23", null).chapter).toEqual({ bookOrd: 19, chapter: 23, prefix: "" });
    expect(label("John 3:")).toEqual(["John 3"]);
    expect(quickRead("John 3:1", null).chapter).toEqual({ bookOrd: 43, chapter: 3, prefix: "1" });
  });

  it("uses the book and chapter already open", () => {
    expect(label("3:16", { bookOrd: 45, chapter: 1 })[0]).toBe("Romans 3:16");
    expect(label("16", john3)[0]).toBe("John 3:16");
    expect(label("5", john3)).toEqual(["John 3:5", "John 5"]);
    expect(label("c5", john3)).toEqual(["John 5"]);
    expect(label("v5", john3)).toEqual(["John 3:5"]);
    expect(label("16-18", john3)[0]).toBe("John 3:16-18");
  });

  it("lists the books a prefix could be, most used first", () => {
    expect(bookMatches("jo").slice(0, 4).map((book) => book.name)).toEqual(["John", "Job", "Joshua", "Joel"]);
    expect(bookMatches("jo").map((book) => book.name)).toContain("1 John");
    expect(bookMatches("cor").map((book) => book.name)).toEqual(["1 Corinthians", "2 Corinthians"]);
    expect(quickRead("phil", null).books.map((book) => book.name)).toEqual(["Philippians", "Philemon"]);
    expect(quickRead("galations", null).books[0]?.name).toBe("Galatians");
  });

  it("searches the words otherwise", () => {
    expect(quickRead("so loved the world", null).phrase).toBe("so loved the world");
    expect(quickRead("shepherd", null).phrase).toBe("shepherd");
    expect(quickRead("jn316", null).phrase).toBeNull();
  });
});
