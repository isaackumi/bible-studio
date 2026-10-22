<script lang="ts" module>
  export type Platform = "mac" | "windows" | "linux" | "other";
  export type Browser = "chrome" | "edge" | "safari" | "firefox" | "other";

  /** "macos" / "web-windows" → the system; "Edge 129" → the browser (null for the installed app). */
  export function platformOf(os: string | undefined, browser: string | undefined): { platform: Platform; browser: Browser | null } {
    const system = (os ?? "").replace(/^web-/, "");
    const platform: Platform = system === "macos" ? "mac" : system === "windows" ? "windows" : system === "linux" ? "linux" : "other";
    if (!(os ?? "").startsWith("web")) return { platform, browser: null };
    const name = (browser ?? "").toLowerCase();
    const kind: Browser = name.startsWith("edge") ? "edge" : name.startsWith("chrom") ? "chrome" : name.startsWith("safari") ? "safari" : name.startsWith("firefox") ? "firefox" : "other";
    return { platform, browser: kind };
  }
</script>

<script lang="ts">
  // A computer's mark: its system's own glyph on a tile in that system's colour, and for the browser
  // version a small badge of the browser, so a list of computers reads at a glance.
  let { platform, browser = null, size = 38 }: { platform: Platform; browser?: Browser | null; size?: number } = $props();
  const uid = $props.id();
</script>

<span class="mark {platform}" style:--size="{size}px" aria-hidden="true">
  <svg class="glyph" viewBox="0 0 24 24">
    {#if platform === "mac"}
      <path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.1zM14 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    {:else if platform === "windows"}
      <g fill="currentColor"><rect x="3" y="3" width="7.7" height="7.7" rx=".5" /><rect x="13.3" y="3" width="7.7" height="7.7" rx=".5" /><rect x="3" y="13.3" width="7.7" height="7.7" rx=".5" /><rect x="13.3" y="13.3" width="7.7" height="7.7" rx=".5" /></g>
    {:else if platform === "linux"}
      <ellipse cx="12" cy="13.5" rx="6.6" ry="8.2" fill="#1d1d22" />
      <ellipse cx="12" cy="15.6" rx="4.1" ry="5.3" fill="#fbfbfd" />
      <circle cx="10.2" cy="9.4" r="1.25" fill="#fff" /><circle cx="13.8" cy="9.4" r="1.25" fill="#fff" />
      <circle cx="10.4" cy="9.6" r=".55" fill="#111" /><circle cx="13.6" cy="9.6" r=".55" fill="#111" />
      <ellipse cx="12" cy="11.5" rx="1.9" ry="1.05" fill="#ffb21a" />
      <ellipse cx="8.6" cy="21.4" rx="2.4" ry="1.1" fill="#ffb21a" /><ellipse cx="15.4" cy="21.4" rx="2.4" ry="1.1" fill="#ffb21a" />
    {:else}
      <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></g>
    {/if}
  </svg>
  {#if browser}
    <svg class="badge" viewBox="0 0 24 24">
      <defs>
        <linearGradient id="{uid}-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#35c1f1" /><stop offset=".55" stop-color="#1d8bd8" /><stop offset="1" stop-color="#3dd68c" /></linearGradient>
        <radialGradient id="{uid}-safari" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#5fd0ff" /><stop offset="1" stop-color="#1062e6" /></radialGradient>
        <linearGradient id="{uid}-fox" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcf3a" /><stop offset=".5" stop-color="#ff7139" /><stop offset="1" stop-color="#e3197a" /></linearGradient>
      </defs>
      {#if browser === "chrome"}
        <path fill="#ea4335" d="M12 12 3.34 7A10 10 0 0 1 20.66 7z" /><path fill="#fbbc04" d="M12 12 20.66 7A10 10 0 0 1 12 22z" /><path fill="#34a853" d="M12 12 12 22A10 10 0 0 1 3.34 7z" />
        <circle cx="12" cy="12" r="4.7" fill="#fff" /><circle cx="12" cy="12" r="3.7" fill="#4285f4" />
      {:else if browser === "edge"}
        <circle cx="12" cy="12" r="10" fill="url(#{uid}-edge)" /><path d="M7.2 13.4a5 5 0 1 1 9.6 1.6c-1 1.5-3.4 1.9-5 .9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
      {:else if browser === "safari"}
        <circle cx="12" cy="12" r="10" fill="url(#{uid}-safari)" /><path fill="#ff3b30" d="M10.6 10.6 17.6 6.4 13.4 13.4z" /><path fill="#fff" d="M10.6 10.6 6.4 17.6 13.4 13.4z" />
      {:else if browser === "firefox"}
        <circle cx="12" cy="12" r="10" fill="url(#{uid}-fox)" /><circle cx="12.8" cy="12.6" r="5.4" fill="#5b2bd0" /><path d="M7.2 9.5c1.6-2.6 4.6-3.6 7.4-2.6" fill="none" stroke="#ffd567" stroke-width="1.6" stroke-linecap="round" />
      {:else}
        <circle cx="12" cy="12" r="10" fill="#2f6fe0" /><g fill="none" stroke="#fff" stroke-width="1.6"><circle cx="12" cy="12" r="6.5" /><path d="M5.5 12h13M12 5.5c2 2.2 2 10.8 0 13M12 5.5c-2 2.2-2 10.8 0 13" /></g>
      {/if}
    </svg>
  {/if}
</span>

<style>
  .mark {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: calc(var(--size) * 0.3);
    /* Each system in its own colour: a lit top edge and a deeper base, like a key on a keyboard. */
    background: linear-gradient(160deg, var(--top), var(--base));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(0 0 0 / 0.35);
    color: var(--ink);
  }
  .mac { --top: #5b5d66; --base: #24252b; --ink: #f4f4f7; }
  .windows { --top: #2b9bff; --base: #0057b8; --ink: #fff; }
  .linux { --top: #ffd45c; --base: #f39a00; --ink: #1d1d22; }
  .other { --top: #4a4f5c; --base: #2a2d35; --ink: #c9ccd6; }
  .glyph { width: 56%; height: 56%; }
  .linux .glyph { width: 66%; height: 66%; }
  .badge {
    position: absolute;
    right: calc(var(--size) * -0.14);
    bottom: calc(var(--size) * -0.14);
    width: 50%;
    height: 50%;
    border-radius: 50%;
    background: var(--badge-ring, #16171c);
    padding: 1.5px;
  }
</style>
