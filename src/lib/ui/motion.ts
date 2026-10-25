import * as svelte from "svelte/transition";

// Svelte's transitions, quiet when the computer asks for reduced motion or the desk is set to Calm
// (Settings › Appearance): things then appear and go at once instead of sliding or fading.

/** Whether motion should be left out now. */
export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.hasAttribute("data-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function quiet<P>(run: (node: Element, params?: P) => svelte.TransitionConfig) {
  return (node: Element, params?: P): svelte.TransitionConfig => (reducedMotion() ? { duration: 0 } : run(node, params));
}

export const fade = quiet(svelte.fade);
export const fly = quiet(svelte.fly);
export const slide = quiet(svelte.slide);
export const scale = quiet(svelte.scale);
export const blur = quiet(svelte.blur);
