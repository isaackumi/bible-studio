// Calls back once, when the element first comes near the visible part of its scrolling box: long
// galleries draw a card's preview only when someone could see it.
export function inView(node: HTMLElement, onvisible: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    onvisible();
    return {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      onvisible();
    },
    { rootMargin: "300px" },
  );
  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
