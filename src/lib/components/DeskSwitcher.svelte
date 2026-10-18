<script lang="ts">
  import { session } from "../app/session.svelte";
  import Icon from "./Icon.svelte";

  /** Compact: icons only, names in the tooltip. */
  let { compact = false }: { compact?: boolean } = $props();
</script>

<nav class="desk-switch" class:compact aria-label="Desk">
  <button
    type="button"
    class:on={session.workspace.appearance.desk === "pewbeam" || !session.entitled("production")}
    aria-label="Presenter Desk"
    aria-pressed={session.workspace.appearance.desk === "pewbeam" || !session.entitled("production")}
    data-tip="Presenter Desk: scripture, songs and sermons"
    onclick={() => session.setAppearance({ desk: "pewbeam" })}
  >
    <Icon name="pew" size={16} />
    <span class="label">Presenter Desk</span>
    <span class="short">Presenter</span>
  </button>
  <button
    type="button"
    class:on={session.workspace.appearance.desk === "obs" && session.entitled("production")}
    aria-label="Production Desk"
    aria-pressed={session.workspace.appearance.desk === "obs" && session.entitled("production")}
    data-tip="Production Desk: scenes, cameras and video"
    onclick={() => session.requireFeature("production") && session.setAppearance({ desk: "obs" })}
  >
    <Icon name="obs" size={16} />
    <span class="label">Production Desk</span>
    <span class="short">Production</span>
  </button>
</nav>

<style>
  .short { display: none; }
  .compact .label { display: none; }
  .compact button { width: var(--tool-size); padding: 0; justify-content: center; }
  /* With room in the bar, the compact switch names its desks too. */
  @media (min-width: 1400px) {
    .compact .short { display: inline; font-size: 12px; font-weight: 650; }
    .compact button { width: auto; padding: 0 10px; gap: 6px; }
  }
</style>
