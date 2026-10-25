import { describe, expect, it } from "vitest";
import { screenLoss } from "./screen-loss";

const status = (over: { desired?: boolean; online?: boolean; displayName?: string } = {}) => ({ desired: true, online: true, displayName: "HISENSE", ...over });

describe("the audience screen dropping out", () => {
  it("is lost when it was showing and goes dark while still wanted, named by the screen it was on", () => {
    expect(screenLoss(null, status(), status({ online: false, displayName: "" }))).toEqual({ lost: "HISENSE" });
  });

  it("stays lost, by the same name, until it comes back", () => {
    expect(screenLoss("HISENSE", status({ online: false, displayName: "" }), status({ online: false, displayName: "" }))).toEqual({ lost: "HISENSE" });
    expect(screenLoss("HISENSE", status({ online: false }), status())).toEqual({ lost: null, back: "HISENSE" });
  });

  it("is not lost when the operator closed it, or when it was never showing", () => {
    expect(screenLoss(null, status(), status({ desired: false, online: false }))).toEqual({ lost: null });
    expect(screenLoss(null, status({ online: false }), status({ online: false }))).toEqual({ lost: null });
    expect(screenLoss("HISENSE", status({ online: false }), status({ desired: false, online: false }))).toEqual({ lost: null });
  });
});
