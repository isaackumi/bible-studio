import { describe, expect, it } from "vitest";
import { createKeyboardManager, defaultShortcuts } from "./manager";

function press(code: string, tag?: string) {
  let prevented = false;
  return {
    event: {
      code,
      target: tag ? { tagName: tag } : null,
      preventDefault() {
        prevented = true;
      },
    },
    prevented: () => prevented,
  };
}

describe("keyboard manager", () => {
  it("routes live keys through one map and ignores them while typing", () => {
    const seen: string[] = [];
    const manager = createKeyboardManager(defaultShortcuts, {
      take: () => seen.push("take"),
      clear: () => seen.push("clear"),
      escape: () => seen.push("escape"),
    });
    const take = press("Space");
    manager.onKeyDown(take.event);
    expect(seen).toEqual(["take"]);
    expect(take.prevented()).toBe(true);

    const typing = press("Space", "INPUT");
    manager.onKeyDown(typing.event);
    expect(seen).toEqual(["take"]);
    expect(typing.prevented()).toBe(false);

    const escape = press("Escape", "INPUT");
    manager.onKeyDown(escape.event);
    expect(seen).toEqual(["take", "escape"]);
  });
});
