import { beforeAll, describe, expect, it } from "vitest";
import { bundledQuoteCatalog } from "../bible/texts";
import { buildQuoteIndex, chooseHeard, type QuoteIndex } from "./detect";
import { CORPUS } from "./confidence-corpus";
import { rateMatch, tierOf } from "./confidence";

let index: QuoteIndex;
beforeAll(async () => {
  index = buildQuoteIndex([...(await bundledQuoteCatalog("kjv")), ...(await bundledQuoteCatalog("web")), ...(await bundledQuoteCatalog("bsb"))]);
}, 120_000);

const rate = (said: string, alternatives?: string[]) => {
  const phrases = alternatives ?? [said];
  const match = chooseHeard(phrases, index, "kjv");
  return match ? { reference: match.item.reference, ...rateMatch(match, { phrases, index }) } : null;
};

describe("how sure listening is of a verse", () => {
  it("is never sure of a wrong verse in what churches actually say", () => {
    const wrongButSure: string[] = [];
    let sure = 0;
    for (const line of CORPUS) {
      const rated = rate(line.said, line.alternatives);
      if (!rated || rated.tier !== "sure") continue;
      sure += 1;
      if (rated.reference !== line.means) wrongButSure.push(`${line.said} -> ${rated.reference}`);
    }
    expect(wrongButSure).toEqual([]);
    // And sure often enough to be worth it: most of the right finds.
    expect(sure).toBeGreaterThanOrEqual(40);
  }, 120_000);

  it("is sure of a reference read out with its markers, and less of bare numbers", () => {
    expect(rate("turn with me to John chapter 3 verse 16")).toMatchObject({ reference: "John 3:16", tier: "sure" });
    expect(rate("Micah 6 8")?.tier).toBe("likely");
  });

  it("is less sure when the recognizer's other hearings land elsewhere", () => {
    const alone = rate("mark 2 3")!;
    const doubted = rate("mark 2 3", ["mark 2 3", "mark to three", "market three"])!;
    expect(doubted.p).toBeLessThan(alone.p);
    expect(doubted.tier).toBe("maybe");
  });

  it("never finds a verse past the end of its chapter", () => {
    for (const said of ["John 3 verse 99", "Psalm 23 verse 12", "Jude 1 verse 40"]) expect(rate(said), said).toBeNull();
  });

  it("does not take counting or amounts for references", () => {
    for (const said of ["John 1 2 3 testing testing", "Mark 4 5 6 seats are free", "I have known Daniel 10 12 years"]) expect(rate(said), said).toBeNull();
    expect(rate("Proverbs 3 verse 5 and 6")?.reference).toBe("Proverbs 3:5-6");
  });

  it("takes a looser sound-alike book only when chapter or verse is said with it", () => {
    expect(rate("efficient two verse eight")?.reference).toBe("Ephesians 2:8");
    expect(rate("efficient two eight")).toBeNull();
  });

  it("names its tiers at fixed lines", () => {
    expect([tierOf(0.95), tierOf(0.7), tierOf(0.3)]).toEqual(["sure", "likely", "maybe"]);
  });
});
