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

  it("leaves Alt+arrow to the page (moving a service item), so the desk does not also step", () => {
    const seen: string[] = [];
    const manager = createKeyboardManager(defaultShortcuts, { next: () => seen.push("next"), previous: () => seen.push("previous") });
    const plain = press("ArrowRight");
    manager.onKeyDown(plain.event);
    const withAlt = press("ArrowDown");
    withAlt.event.modified = true;
    manager.onKeyDown(withAlt.event);
    expect(seen).toEqual(["next"]);
    expect(withAlt.prevented()).toBe(false);
  });
});

describe("changing shortcuts", () => {
  it("moves a key that another action had, and refuses reserved keys", async () => {
    const { assignShortcut, canAssign, defaultShortcuts, shortcutLabels } = await import("./manager");
    const { map, taken } = assignShortcut(defaultShortcuts, "black", "KeyL");
    expect(map.black).toEqual(["KeyL"]);
    expect(map.logo).toEqual([]);
    expect(taken).toBe("logo");
    expect(assignShortcut(defaultShortcuts, "take", "Tab").map).toBe(defaultShortcuts);
    expect(canAssign("Enter")).toBe(false);
    expect(shortcutLabels(defaultShortcuts, "previous")).toBe("← / ↑");
    expect(shortcutLabels(map, "logo")).toBe("—");
  });

  it("does not clear the screen with Backspace just after typing in a box (fixing a typo after clicking away)", () => {
    let clock = 1_000_000;
    const seen: string[] = [];
    const manager = createKeyboardManager(defaultShortcuts, { clear: () => seen.push("clear") }, () => clock);
    manager.onKeyDown(press("KeyJ", "INPUT").event);
    clock += 800;
    const early = press("Backspace");
    manager.onKeyDown(early.event);
    expect(seen).toEqual([]);
    expect(early.prevented()).toBe(true);
    clock += 2500;
    manager.onKeyDown(press("Backspace").event);
    expect(seen).toEqual(["clear"]);
  });
});

