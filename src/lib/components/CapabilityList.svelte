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

<section class="rows">
  {#each rows as row (row.id)}
    <div class="row" class:dim={!row.available}>
      <div class="row-copy">
        <strong>{row.label}</strong>
        <span>{row.detail}</span>
      </div>
      <span class="pill" class:ok={row.available} class:muted={!row.available}>{row.available ? "Ready" : "Not here"}</span>
    </div>
  {/each}
</section>
