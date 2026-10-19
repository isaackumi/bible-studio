import { describe, expect, it } from "vitest";
import { cleanSettings, pickSettings, withoutSettings } from "./service-settings";
import type { Service } from "./types";

const service: Service = { id: "s", name: "S", updatedAt: "", sections: [], autoAdvance: "next", versesPerScreen: 2, leaderTo: "screen", showLeaders: true };

describe("service settings", () => {
  it("picks what a service changed, and resets it", () => {
    expect(pickSettings(service)).toEqual({ autoAdvance: "next", versesPerScreen: 2, leaderTo: "screen" });
    const reset = withoutSettings(service);
    expect(pickSettings(reset)).toEqual({});
    expect(reset.showLeaders).toBeUndefined();
    expect(reset.name).toBe("S");
  });

  it("cleans saved defaults", () => {
    expect(cleanSettings({ autoAdvance: "sideways", versesPerScreen: 99, advanceGrace: 2.4, leaderTo: "preview", liveOnClick: false, junk: 1 })).toEqual({
      versesPerScreen: 20,
      advanceGrace: 2,
      leaderTo: "preview",
      liveOnClick: false,
    });
    expect(cleanSettings("nope")).toEqual({});
  });
});
