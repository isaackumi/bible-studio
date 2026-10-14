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
};

export type KeyInput = {
  code: string;
  target: { tagName?: string; isContentEditable?: boolean } | null;
  preventDefault: () => void;
};

const ORDER: ShortcutAction[] = ["escape", "take", "cut", "previous", "next", "clear", "black", "logo"];

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

export function createKeyboardManager(map: ShortcutMap, handlers: Partial<Record<ShortcutAction, () => void>>) {
  return {
    onKeyDown(event: KeyInput) {
      const action = shortcutFor(map, event.code);
      if (!action) return;
      if (isTypingTarget(event.target)) {
        if (action !== "escape") return;
        handlers.escape?.();
        event.preventDefault();
        return;
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
  };
  return labels[code] ?? code.replace(/^Key/, "");
}
