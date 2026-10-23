// Keep the display on while the audience screen is up. A projector that goes dark after ten idle
// minutes, because nobody touched the mouse, is a Sunday-morning classic on Windows. The screen
// wake lock is released by the browser whenever the page is hidden, so it is asked for again each
// time the page shows.

type WakeLock = { release(): Promise<void>; addEventListener?(type: "release", listener: () => void): void };
type Navigator = globalThis.Navigator & { wakeLock?: { request(kind: "screen"): Promise<WakeLock> } };

/** Start keeping the screen awake; call the returned function to stop. Harmless where unsupported. */
export function keepScreenAwake(): () => void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return () => {};
  let lock: WakeLock | null = null;
  let stopped = false;
  const ask = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      lock = (await (navigator as Navigator).wakeLock?.request("screen")) ?? null;
    } catch {
      lock = null;
    }
  };
  const onShow = () => void ask();
  document.addEventListener("visibilitychange", onShow);
  void ask();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onShow);
    void lock?.release().catch(() => {});
    lock = null;
  };
}
