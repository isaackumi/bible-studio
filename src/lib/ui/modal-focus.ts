// Modal focus for a dialog that is not a DeskDialog (Settings, Plans): focus moves in when it
// opens (to `initial`, else the first control), Tab and Shift+Tab stay inside it, and focus goes
// back to what had it when the dialog closes. Use as `use:modalFocus` or `use:modalFocus={"input"}`.

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function modalFocus(node: HTMLElement, initial?: string) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const start = (initial ? node.querySelector<HTMLElement>(initial) : null) ?? node.querySelector<HTMLElement>(FOCUSABLE) ?? node;
  queueMicrotask(() => start.focus());

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const inside = node.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  };
  node.addEventListener("keydown", onKey);
  return {
    destroy() {
      node.removeEventListener("keydown", onKey);
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    },
  };
}
