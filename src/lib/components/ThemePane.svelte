<script lang="ts">
  import { session } from "../app/session.svelte";

  const theme = $derived(session.theme());
</script>

<div class="pane">
  <p class="hint">Church name, used on the logo frame</p>
  <input class="field" value={session.workspace.churchName} aria-label="Church name" oninput={(event) => session.setChurchName(event.currentTarget.value)} />
  <p class="hint">Layout</p>
  <select
    class="field"
    value={theme.layout}
    aria-label="Verse layout"
    onchange={(event) => session.saveTheme({ ...theme, layout: event.currentTarget.value === "lower-third" ? "lower-third" : "frame" })}
  >
    <option value="frame">Full frame</option>
    <option value="lower-third">Lower third</option>
  </select>
  <p class="hint">Background</p>
  <input
    class="field"
    type="color"
    value={theme.background.type === "color" ? theme.background.color : "#050505"}
    aria-label="Background color"
    oninput={(event) => session.saveTheme({ ...theme, background: { type: "color", color: event.currentTarget.value } })}
  />
  <p class="hint">Text</p>
  <input class="field" type="color" value={theme.color} aria-label="Text color" oninput={(event) => session.saveTheme({ ...theme, color: event.currentTarget.value })} />
  <p class="hint">Size {theme.fontSize}</p>
  <input class="field" type="range" min="28" max="120" value={theme.fontSize} aria-label="Font size" oninput={(event) => session.saveTheme({ ...theme, fontSize: Number(event.currentTarget.value) })} />
  <p class="hint">Alignment</p>
  <select
    class="field"
    value={theme.align}
    aria-label="Text alignment"
    onchange={(event) => session.saveTheme({ ...theme, align: event.currentTarget.value as typeof theme.align })}
  >
    <option value="left">Left</option>
    <option value="center">Center</option>
    <option value="right">Right</option>
  </select>
  <p class="hint">Position</p>
  <select
    class="field"
    value={theme.vertical}
    aria-label="Text position"
    onchange={(event) => session.saveTheme({ ...theme, vertical: event.currentTarget.value as typeof theme.vertical })}
  >
    <option value="top">Top</option>
    <option value="middle">Middle</option>
    <option value="bottom">Bottom</option>
  </select>
  <p class="hint">Margin {theme.margin}</p>
  <input class="field" type="range" min="24" max="240" value={theme.margin} aria-label="Margin" oninput={(event) => session.saveTheme({ ...theme, margin: Number(event.currentTarget.value) })} />
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
  <p class="hint">Reference and translation stay on the scripture layout. Cut still jumps. Take uses this transition.</p>
</div>
