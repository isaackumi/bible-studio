import { describe, expect, it } from "vitest";
import { licenceToOffer, usableLicences } from "./licences";

const own = { license: "aaaa", plan: "premium" as const, revoked: false, owner: true };
const theirs = { license: "bbbb", plan: "church" as const, revoked: false, owner: false, by: "Grace" };

describe("a licence someone was added to", () => {
  it("is offered on a computer already on another", () => {
    expect(licenceToOffer([own, theirs], "aaaa", [])?.license).toBe("bbbb");
  });

  it("is not offered once answered, or when it is the one here", () => {
    expect(licenceToOffer([own, theirs], "aaaa", ["bbbb"])).toBeNull();
    expect(licenceToOffer([own, theirs], "bbbb", [])).toBeNull();
  });

  it("is not offered when refunded, or when the owner took them off it", () => {
    expect(licenceToOffer([own, { ...theirs, revoked: true }], "aaaa", [])).toBeNull();
    expect(licenceToOffer([own, { ...theirs, removed: true }], "aaaa", [])).toBeNull();
  });

  it("waits on a computer with no licence: the account's plan comes to it anyway", () => {
    expect(licenceToOffer([theirs], "", [])).toBeNull();
  });

  it("never offers the person's own licence", () => {
    expect(licenceToOffer([{ ...own, license: "cccc" }], "aaaa", [])).toBeNull();
  });

  it("lists only what can be used", () => {
    expect(usableLicences([own, { ...theirs, removed: true }]).map((entry) => entry.license)).toEqual(["aaaa"]);
  });
});
