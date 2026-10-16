import { describe, expect, it } from "vitest";
import { createKeyboardManager, defaultShortcuts } from "./manager";

function press(code: string, tag?: string) {
  let prevented = false;
  return {
    event: {
      code,
      target: tag ? { tagName: tag } : null,
      modified: false,
      defaultPrevented: false,
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
      cut: () => seen.push("cut"),
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

    // A focused button (even BLACK) never turns Space into its own click: Space is Take.
    const spaceOnButton = press("Space", "BUTTON");
    manager.onKeyDown(spaceOnButton.event);
    expect(seen).toEqual(["take", "escape", "take"]);
    expect(spaceOnButton.prevented()).toBe(true);

    const cutOnButton = press("KeyC", "BUTTON");
    manager.onKeyDown(cutOnButton.event);
    expect(seen).toEqual(["take", "escape", "take", "cut"]);
    expect(cutOnButton.prevented()).toBe(true);

    const handled = press("ArrowRight");
    handled.event.defaultPrevented = true;
    manager.onKeyDown(handled.event);
    expect(seen).toEqual(["take", "escape", "take", "cut"]);
  });

  it("steps with the arrows on a focused button but leaves them to pane resizers", () => {
    const seen: string[] = [];
    const manager = createKeyboardManager(defaultShortcuts, { next: () => seen.push("next") });
    const onButton = press("ArrowRight", "BUTTON");
    manager.onKeyDown(onButton.event);
    expect(seen).toEqual(["next"]);
    expect(onButton.prevented()).toBe(true);
    const resizer = { ...press("ArrowRight").event, target: { tagName: "DIV", role: "separator" } };
    let prevented = false;
    manager.onKeyDown({ ...resizer, preventDefault: () => (prevented = true) });
    expect(seen).toEqual(["next"]);
    expect(prevented).toBe(false);
  });

  it("keeps desk keys off program and out of text fields", () => {
    const seen: string[] = [];
    const manager = createKeyboardManager(defaultShortcuts, {
      focus: () => seen.push("focus"),
      find: () => seen.push("find"),
      take: () => seen.push("take"),
    });
    const focus = press("KeyF");
    manager.onKeyDown(focus.event);
    expect(seen).toEqual(["focus"]);

    const modified = press("KeyF");
    modified.event.modified = true;
    manager.onKeyDown(modified.event);
    expect(seen).toEqual(["focus"]);
    expect(modified.prevented()).toBe(false);

    const slash = press("Slash", "INPUT");
    manager.onKeyDown(slash.event);
    expect(seen).toEqual(["focus"]);
    expect(slash.prevented()).toBe(false);
  });
});
