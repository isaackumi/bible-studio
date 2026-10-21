<script lang="ts">
  import { page } from "$app/state";

  // When the app cannot start in this browser: say why in plain words, with the details to send us,
  // instead of a bare "500 Internal Error".
  const message = $derived(page.error?.message ?? "Something went wrong.");
  const browser = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const details = $derived(`${page.status} · ${message}\n${browser}\n${typeof location !== "undefined" ? location.href : ""}`);
  let copied = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<main>
  <div class="card">
    <h1>Church Studio could not start here</h1>
    <p>This browser stopped the app while it was opening. Reloading usually fixes it after an update.</p>
    <div class="actions">
      <button type="button" class="primary" onclick={() => location.reload()}>Reload</button>
      <button type="button" onclick={copy}>{copied ? "Copied" : "Copy details"}</button>
    </div>
    <pre>{details}</pre>
    <p class="small">Still stuck? Send the details to <a href="mailto:support@heitechinc.com">support@heitechinc.com</a>, or use the desktop app.</p>
  </div>
</main>

<style>
  main { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #07070a; color: #f5f5f7; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }
  .card { width: min(560px, 100%); padding: 28px; border: 1px solid rgba(255,255,255,.1); border-radius: 18px; background: #121217; }
  h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -.01em; }
  p { margin: 0 0 16px; color: #a0a0ab; }
  .actions { display: flex; gap: 10px; margin-bottom: 16px; }
  button { height: 40px; padding: 0 16px; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: transparent; color: inherit; font: inherit; font-weight: 650; cursor: pointer; }
  button.primary { border-color: transparent; background: #fa4f00; color: #fff; }
  pre { margin: 0 0 16px; padding: 12px; border-radius: 10px; background: #000; color: #ffb38a; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  .small { font-size: 13px; } a { color: #ff9a4d; }
</style>
