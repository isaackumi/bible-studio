import { describe, expect, it } from "vitest";
import { keepsOutgoing, transitionFrames } from "./transitions";

describe("screen transitions", () => {
  it("keeps the old frame only for moves that need it", () => {
    expect(keepsOutgoing("cut")).toBe(false);
    expect(keepsOutgoing("fade")).toBe(false);
    expect(keepsOutgoing("push-left")).toBe(true);
    expect(keepsOutgoing("dissolve")).toBe(true);
  });

  it("pushes both frames the same way, and dips through the background", () => {
    const push = transitionFrames("push-left")!;
    expect(push.incoming[0]).toEqual({ transform: "translateX(100%)" });
    expect(push.outgoing![1]).toEqual({ transform: "translateX(-100%)" });
    const dip = transitionFrames("dip")!;
    expect(dip.outgoing![1]).toMatchObject({ opacity: 0, offset: 0.5 });
    expect(dip.incoming[1]).toMatchObject({ opacity: 0, offset: 0.5 });
    expect(transitionFrames("cut")).toBeNull();
  });
});
