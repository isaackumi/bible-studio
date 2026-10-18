<script lang="ts">
  import { t } from "../i18n/core";
  // The one star used everywhere: hollow until starred, filled gold after. It never steals the
  // click from the row it sits on.
  let { on, label, onclick, size = 14 }: { on: boolean; label: string; onclick: () => void; size?: number } = $props();
</script>

<button
  type="button"
  class="fav-star"
  class:on
  aria-pressed={on}
  aria-label={on ? t("Remove {label} from favorites", { label }) : t("Add {label} to favorites", { label })}
  title={on ? t("Favorite. Click to remove") : t("Add to favorites")}
  onclick={(event) => {
    event.stopPropagation();
    onclick();
  }}
  ondblclick={(event) => event.stopPropagation()}
>
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.8l2.84 5.75 6.35.92-4.6 4.48 1.09 6.32L12 17.27l-5.68 3 1.09-6.32-4.6-4.48 6.35-.92z" />
  </svg>
</button>

<style>
  .fav-star {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .fav-star svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
  .fav-star:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .fav-star.on { color: #f5b301; }
  .fav-star.on svg { fill: currentColor; }
  .fav-star:focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 1px; }
</style>
