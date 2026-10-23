// A top bar that always fits: when its contents are wider than the bar (a narrow window, large text,
// a drawer beside the desk, a long church name), it tightens in steps (squeeze-1, -2, -3) until they
// fit, instead of pushing the tools on the right (and Settings) off the screen. app.css says what
// each step hides. Use as `use:fitBar` on the bar.

export const SQUEEZE_STEPS = 3;

/** The tightest step needed: the first at which the contents fit (or the last). */
export function squeezeFor(overflows: (step: number) => boolean, steps = SQUEEZE_STEPS): number {
  for (let step = 0; step < steps; step++) if (!overflows(step)) return step;
  return steps;
}

export function fitBar(node: HTMLElement) {
  const apply = (step: number) => {
    for (let level = 1; level <= SQUEEZE_STEPS; level++) node.classList.toggle(`squeeze-${level}`, level <= step);
  };
  let busy = false;
  const fit = () => {
    if (busy) return;
    busy = true;
    // Reading scrollWidth lays the bar out at once, so each step is measured as it is applied.
    squeezeFor((step) => {
      apply(step);
      return node.scrollWidth > node.clientWidth;
    });
    busy = false;
  };
  // The bar's own width, and its groups' (a drawer's name appearing, music starting, NDI on).
  const observer = new ResizeObserver(() => requestAnimationFrame(fit));
  const watch = () => {
    observer.disconnect();
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
  };
  const children = new MutationObserver(watch);
  children.observe(node, { childList: true });
  watch();
  fit();
  return {
    destroy() {
      observer.disconnect();
      children.disconnect();
      apply(0);
    },
  };
}
