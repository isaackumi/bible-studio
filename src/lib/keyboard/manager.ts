import type { ShortcutAction, ShortcutMap } from "../domain/types";

export const defaultShortcuts: ShortcutMap = {
  take: ["Space"],
  cut: ["KeyC"],
  previous: ["ArrowLeft", "ArrowUp"],
  next: ["ArrowRight", "ArrowDown"],
  clear: ["Backspace"],
  black: ["KeyB"],
  logo: ["KeyL"],
  escape: ["Escape"],
  focus: ["KeyF"],
  library: ["BracketLeft"],
  queue: ["BracketRight"],
  find: ["Slash"],
};

export type KeyInput = {
  code: string;
  target: { tagName?: string; isContentEditable?: boolean; role?: string | null } | null;
  modified?: boolean;
  defaultPrevented?: boolean;
  preventDefault: () => void;
};

const ORDER: ShortcutAction[] = ["escape", "take", "cut", "previous", "next", "clear", "black", "logo", "focus", "library", "queue", "find"];
const DESK_ACTIONS = new Set<ShortcutAction>(["focus", "library", "queue", "find"]);

export function shortcutFor(map: ShortcutMap, code: string): ShortcutAction | null {
  for (const action of ORDER) {
    if (map[action].includes(code)) return action;
  }
  return null;
}

export function isTypingTarget(target: KeyInput["target"]): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(target.isContentEditable);
}

function holdsNavigation(target: KeyInput["target"]): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === "BUTTON" || tag === "A" || target.role === "button" || target.role === "separator";
}

export function createKeyboardManager(map: ShortcutMap, handlers: Partial<Record<ShortcutAction, () => void>>) {
  return {
    onKeyDown(event: KeyInput) {
      if (event.defaultPrevented) return;
      const action = shortcutFor(map, event.code);
      if (!action) return;
      if (DESK_ACTIONS.has(action) && event.modified) return;
      if (isTypingTarget(event.target)) {
        if (action !== "escape") return;
        handlers.escape?.();
        event.preventDefault();
        return;
      }
      if (holdsNavigation(event.target)) {
        if (action === "previous" || action === "next") {
          event.preventDefault();
          return;
        }
        if (action === "take") return;
      }
      handlers[action]?.();
      event.preventDefault();
    },
  };
}

export function shortcutLabel(map: ShortcutMap, action: ShortcutAction): string {
  const code = map[action][0] ?? "";
  const labels: Record<string, string> = {
    Space: "Space",
    Backspace: "⌫",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
    BracketLeft: "[",
    BracketRight: "]",
    Slash: "/",
  };
  return labels[code] ?? code.replace(/^Key/, "");
}
