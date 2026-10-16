<script lang="ts">
  import { capabilityReport } from "../platform/capability-report";
  import { detectOutputCapabilities, probeFromWindow } from "../platform/output-capabilities";
  import { isDesktop } from "../platform/runtime";

  // What this computer can do in this window, and why not — shown instead of dead buttons.
  const desktop = isDesktop();
  const rows = capabilityReport({
    desktop,
    caps: detectOutputCapabilities(probeFromWindow(desktop, typeof window === "undefined" ? undefined : window)),
    speech: typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    screenDetails: typeof window !== "undefined" && "getScreenDetails" in window,
    secure: typeof window === "undefined" || window.isSecureContext,
    mac: typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent),
  });
</script>

<ul class="capabilities">
  {#each rows as row (row.id)}
    <li data-available={row.available}>
      <span class="mark" aria-hidden="true">{row.available ? "✓" : "—"}</span>
      <span class="text">
        <strong>{row.label}</strong>
        <small>{row.available ? "" : "Unavailable. "}{row.detail}</small>
      </span>
    </li>
  {/each}
</ul>

<style>
  .capabilities { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .mark { width: 18px; text-align: center; font-weight: 700; color: #3ccf6e; }
  li[data-available="false"] .mark { color: var(--muted); }
  li[data-available="false"] strong { color: var(--muted); }
  .text { display: flex; flex-direction: column; gap: 2px; }
  small { color: var(--muted); }
</style>
