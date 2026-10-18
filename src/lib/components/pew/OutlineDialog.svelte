<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { buildOutline, outlineHtml, outlineText, type OutlineOptions } from "../../domain/outline";
  import type { Service } from "../../domain/types";
  import DeskDialog from "../sources/DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";

  // The service on one page: a run sheet for the team or an order of service for the
  // congregation. What is shown here is exactly what prints (or saves as a PDF).
  let { service, onclose }: { service: Service; onclose: () => void } = $props();

  let options = $state<OutlineOptions>({ style: "run-sheet", times: true, items: true });
  let frame = $state<HTMLIFrameElement | undefined>();
  let note = $state("");

  const outline = $derived(buildOutline(service, session.songs, session.workspace.churchName, new Date()));
  const html = $derived(outlineHtml(outline, options));
  const text = $derived(outlineText(outline, options));

  function setStyle(style: OutlineOptions["style"]) {
    options = style === "order" ? { style, times: false, items: true } : { style, times: true, items: true };
  }

  /** The print window, where macOS and Windows both offer Save as PDF. */
  function print() {
    const win = frame?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    note = t("In the print window, choose Save as PDF to keep a file, or a printer for paper.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      note = t("Copied. Paste it into a message or an email.");
    } catch {
      note = t("This window could not copy. Select the text in the page and copy it.");
    }
  }

  function download() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${service.name.replace(/[^\w\- ]+/g, "").trim() || "service"}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note = t("Saved as a page you can open in any browser, print or send.");
  }
</script>

<DeskDialog title={t("Programme outline")} huge {onclose}>
  <div class="outline">
    <aside class="controls">
      <div class="group">
        <p class="label">{t("For")}</p>
        <div class="seg" role="radiogroup" aria-label={t("Outline style")}>
          <button type="button" role="radio" aria-checked={options.style === "run-sheet"} onclick={() => setStyle("run-sheet")}>
            <strong>{t("The team")}</strong><span>{t("Run sheet: times, lengths, every item")}</span>
          </button>
          <button type="button" role="radio" aria-checked={options.style === "order"} onclick={() => setStyle("order")}>
            <strong>{t("The congregation")}</strong><span>{t("Order of service: parts, songs, readings")}</span>
          </button>
        </div>
      </div>
      <div class="group">
        <p class="label">{t("Show")}</p>
        <label class="check"><input type="checkbox" bind:checked={options.times} /> {t("Times")}</label>
        <label class="check"><input type="checkbox" bind:checked={options.items} /> {t("Songs and readings")}</label>
      </div>
      <div class="group actions">
        <button type="button" class="btn primary" onclick={print}><Icon name="download" size={14} /> {t("Print or save as PDF")}</button>
        <button type="button" class="btn" onclick={() => void copy()}><Icon name="copy" size={14} /> {t("Copy as text")}</button>
        <button type="button" class="btn ghost" onclick={download}><Icon name="files" size={14} /> {t("Save as a web page")}</button>
        {#if note}<p class="note" role="status">{note}</p>{/if}
      </div>
    </aside>
    <div class="paper-wrap">
      <iframe bind:this={frame} class="paper" title={t("Programme outline")} srcdoc={html}></iframe>
    </div>
  </div>
</DeskDialog>

<style>
  .outline { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 18px; height: min(76vh, 760px); }
  .controls { display: flex; flex-direction: column; gap: 18px; }
  .group { display: grid; gap: 6px; }
  .label { margin: 0; font-size: 12px; font-weight: 650; color: var(--muted); }
  .seg { display: grid; gap: 6px; }
  .seg button { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: none; color: var(--ink); font: inherit; text-align: left; }
  .seg button strong { font-size: 13px; }
  .seg button span { font-size: 12px; color: var(--muted); }
  .seg button[aria-checked="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .actions { margin-top: auto; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn.ghost { background: none; }
  .note { margin: 4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
  .paper-wrap { min-height: 0; overflow: auto; padding: 18px; border-radius: 12px; background: color-mix(in srgb, var(--ink) 6%, var(--panel)); display: flex; justify-content: center; }
  .paper { width: min(100%, 720px); height: 100%; min-height: 600px; border: 0; border-radius: 4px; background: #fff; box-shadow: 0 10px 30px rgb(0 0 0 / 0.35); }
  @media (max-width: 860px) {
    .outline { grid-template-columns: 1fr; height: auto; }
    .paper { min-height: 70vh; }
  }
</style>
