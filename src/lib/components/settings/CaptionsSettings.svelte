<script lang="ts">
  import QRCode from "qrcode";
  import { session } from "../../app/session.svelte";
  import { CAPTION_LANGUAGES } from "../../domain/captions";
  import { presentQr } from "../../domain/overlays";
  import { isDesktop } from "../../platform/runtime";
  import { t } from "../../i18n/core";

  // Live captions: on the audience screen, and on people's phones from a QR code, translated
  // with the church's own AI key. Words come from the same listening that finds verses.
  let { onai }: { onai: () => void } = $props();

  let token = $state<string | null>(null);
  let qr = $state("");
  let copied = $state(false);

  const settings = $derived(session.workspace.captions);
  const link = $derived(token && session.remoteLanUrl ? new URL(`/captions?token=${encodeURIComponent(token)}`, session.remoteLanUrl).toString() : "");
  const hasLink = $derived(session.remoteDevices.some((device) => device.captions));
  const listening = $derived(session.voice.status === "listening");

  $effect(() => {
    const url = link;
    qr = "";
    if (!url) return;
    let cancelled = false;
    void QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => {
      if (!cancelled) qr = svg;
    });
    return () => {
      cancelled = true;
    };
  });

  function toggleLanguage(code: string, on: boolean) {
    const next = on ? [...settings.languages, code] : settings.languages.filter((entry) => entry !== code);
    session.setCaptionSettings({ languages: next.slice(0, 4) });
  }

  /** The QR code on Preview, for the congregation to scan; LIVE shows it. */
  function qrOnPreview() {
    if (!link) return;
    session.previewModel(presentQr({ theme: session.theme(), data: link, caption: t("Live captions on your phone") }), null);
    session.message = t("Captions QR code is on Preview. LIVE shows it to the congregation.");
  }
</script>

<section class="rows">
  <div class="row">
    <div class="row-copy">
      <strong>{t("Live captions")}</strong>
      <span>
        {#if session.captionsOn && listening}{settings.screen ? t("On. What is said shows as it is heard, on the screen too.") : t("On. What is said shows as it is heard.")}
        {:else if session.captionsOn}{t("On, waiting for the microphone.")}
        {:else}{t("What the speaker says, as words on the screen and on phones. It uses the listening that finds verses; nothing is recorded.")}{/if}
      </span>
    </div>
    <input type="checkbox" class="switch" role="switch" aria-label={t("Live captions")} checked={session.captionsOn} onchange={(event) => void session.setCaptions(event.currentTarget.checked)} />
  </div>
  {#if session.captions.lines.length}
    <div class="row">
      <div class="row-copy"><strong>{t("So far")}</strong><span class="last">“{session.captions.lines[session.captions.lines.length - 1]?.text}”</span></div>
      <button type="button" class="btn" onclick={() => session.clearCaptions()}>{t("Clear")}</button>
    </div>
  {/if}
</section>

<p class="section-label">{t("On the screen")}</p>
<section class="rows">
  <div class="row">
    <div class="row-copy"><strong>{t("Show on the audience screen")}</strong><span>{t("Two lines over whatever is on the screen. Program itself does not change.")}</span></div>
    <input type="checkbox" class="switch" role="switch" aria-label={t("Captions on the audience screen")} checked={settings.screen} onchange={(event) => session.setCaptionSettings({ screen: event.currentTarget.checked })} />
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Where")}</strong></div>
    <select class="field" aria-label={t("Caption position")} value={settings.position} onchange={(event) => session.setCaptionSettings({ position: event.currentTarget.value === "top" ? "top" : "bottom" })}>
      <option value="bottom">{t("Bottom")}</option>
      <option value="top">{t("Top")}</option>
    </select>
  </div>
  <div class="row">
    <div class="row-copy"><strong>{t("Size")}</strong></div>
    <select class="field" aria-label={t("Caption size")} value={settings.size} onchange={(event) => session.setCaptionSettings({ size: event.currentTarget.value as "s" | "m" | "l" })}>
      <option value="s">{t("Small")}</option>
      <option value="m">{t("Medium")}</option>
      <option value="l">{t("Large")}</option>
    </select>
  </div>
</section>

<p class="section-label">{t("On phones")}</p>
<section class="rows">
  <div class="row">
    <div class="row-copy">
      <strong>{t("Captions link")}</strong>
      <span>{isDesktop() ? t("People scan a QR code and follow the captions on their own phone, in their language, on the church Wi-Fi. It shows captions only.") : t("Captions on phones work with the desktop app, which runs the network server.")}</span>
    </div>
    <button type="button" class="btn primary" disabled={!isDesktop()} onclick={async () => { token = await session.createCaptionsLink(); copied = false; }}>{hasLink ? t("New link") : t("Make link")}</button>
  </div>
  {#if link}
    <div class="row new-link">
      <div class="qr" aria-label={t("Captions QR code")}>{@html qr}</div>
      <div class="row-copy">
        <strong>{t("Scan to follow along")}</strong>
        <span>{t("Put the code on the screen before the sermon, or print it for the seats. A new link stops the old one.")}</span>
        <code>{link}</code>
        <span class="actions">
          <button type="button" class="btn small" onclick={qrOnPreview}>{t("QR code on Preview")}</button>
          <button type="button" class="btn small" onclick={() => { void navigator.clipboard?.writeText(link); copied = true; }}>{copied ? t("Copied") : t("Copy link")}</button>
        </span>
      </div>
    </div>
  {:else if hasLink}
    <div class="row"><div class="row-copy"><span>{t("A captions link is active. Make a new one to see its QR code again (the old one then stops).")}</span></div></div>
  {/if}
</section>

<p class="section-label">{t("Translate for phones")}</p>
<section class="rows">
  <div class="row stack">
    <div class="row-copy">
      <strong>{t("Languages")}</strong>
      <span>
        {#if session.aiReady}{t("Each phrase is translated with your AI service as it is said; phones choose their language. Up to four.")}
        {:else}{t("Translation uses your own AI key.")} <button type="button" class="link" onclick={onai}>{t("Add it in AI assistant")}</button>.{/if}
      </span>
    </div>
    <div class="langs">
      {#each CAPTION_LANGUAGES as language (language.code)}
        {@const on = settings.languages.includes(language.code)}
        <label class="lang" class:on>
          <input type="checkbox" checked={on} disabled={!on && settings.languages.length >= 4} onchange={(event) => toggleLanguage(language.code, event.currentTarget.checked)} />
          {language.name}
        </label>
      {/each}
    </div>
  </div>
</section>

<style>
  .last { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 420px; display: block; }
  .new-link { align-items: center !important; gap: 18px !important; flex-wrap: wrap; }
  .qr { width: 164px; height: 164px; background: #fff; border-radius: 12px; padding: 8px; flex: none; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  code { display: block; margin-top: 6px; font-size: 12px; word-break: break-all; color: var(--ink); }
  .actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .langs { display: flex; flex-wrap: wrap; gap: 6px; }
  .lang { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: 15px; font-size: 13px; cursor: pointer; }
  .lang.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .lang input { margin: 0; }
  .link { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
</style>
