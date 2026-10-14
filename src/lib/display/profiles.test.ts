import { describe, expect, it } from "vitest";
import type { DisplayInfo } from "../domain/types";
import { deleteProfile, factoryProfiles, resolveAudience, sameScreen, setAssignment } from "./profiles";

function display(patch: Partial<DisplayInfo> & Pick<DisplayInfo, "key" | "name" | "primary">): DisplayInfo {
  return {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    scale: 1,
    audience: false,
    ...patch,
  };
}

const mac = display({ key: "mac|2560x1600|2.00", name: "Built-in", primary: true, width: 2560, height: 1600, scale: 2 });
const dell = display({ key: "dell|1920x1200|1.00", name: "Dell U2415", primary: false, width: 1920, height: 1200 });

describe("display profiles", () => {
  it("uses the external display automatically and refuses to fall back when the assignment is gone", () => {
    expect(resolveAudience(null, [mac, dell])).toMatchObject({ mode: "auto", display: dell, missing: false });
    expect(resolveAudience("gone|1x1|1.00", [mac, dell])).toMatchObject({ mode: "assigned", display: null, missing: true });
  });

  it("keeps a laptop-only audience closed until the operator assigns that screen", () => {
    expect(resolveAudience(null, [mac]).missing).toBe(true);
    expect(resolveAudience(mac.key, [mac])).toMatchObject({ missing: false, display: mac });
  });

  it("does not delete the built-in profile and warns when operator and audience are the same screen", () => {
    expect(deleteProfile(factoryProfiles(), "profile-this-computer")).toBeNull();
    const profile = setAssignment(factoryProfiles()[0], "audience", mac.key);
    const both = setAssignment(profile, "operator", mac.key);
    expect(sameScreen(both.assignments)).toBe(true);
  });
});
