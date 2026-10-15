<script lang="ts">
  import { session } from "../app/session.svelte";
  import Icon from "./Icon.svelte";
</script>

<nav class="desk-switch" aria-label="Desk">
  <button
    type="button"
    class:on={session.workspace.appearance.desk === "pewbeam"}
    aria-label="Presenter Desk"
    aria-pressed={session.workspace.appearance.desk === "pewbeam"}
    data-tip="Presenter Desk — Scripture, songs and service presentation."
    onclick={() => session.setAppearance({ desk: "pewbeam" })}
  >
    <Icon name="pew" size={16} />
    <span class="label">Presenter Desk</span>
  </button>
  <button
    type="button"
    class:on={session.workspace.appearance.desk === "obs"}
    aria-label="Production Desk"
    aria-pressed={session.workspace.appearance.desk === "obs"}
    data-tip="Production Desk — Live production, cameras, compositions and output control."
    onclick={() => session.setAppearance({ desk: "obs" })}
  >
    <Icon name="obs" size={16} />
    <span class="label">Production Desk</span>
  </button>
</nav>
