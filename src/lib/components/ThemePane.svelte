<script lang="ts">
  import { session } from "../app/session.svelte";
  import OutputType from "./OutputType.svelte";

  const theme = $derived(session.theme());
</script>

<div class="pane">
  <p class="hint">Church name, used on the logo frame</p>
  <input class="field" value={session.workspace.churchName} aria-label="Church name" oninput={(event) => session.setChurchName(event.currentTarget.value)} />
  <OutputType />
  <p class="hint">Take transition</p>
  <select
    class="field"
    value={theme.transition.type}
    aria-label="Transition"
    onchange={(event) =>
      session.saveTheme({
        ...theme,
        transition: { ...theme.transition, type: event.currentTarget.value as "cut" | "fade" },
      })}
  >
    <option value="fade">Fade</option>
    <option value="cut">Cut</option>
  </select>
  <p class="hint">Cut still jumps. Take uses this transition.</p>
</div>
