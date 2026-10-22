<script lang="ts">
  import TextWords from "../TextWords.svelte";
  import InlineWords from "../InlineWords.svelte";
  import { untrack } from "svelte";
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import { openCamera, stopCameraStream } from "../../domain/camera";
  import { LOWER_THIRD_TEMPLATES } from "../../domain/composition";
  import type { SourceFields } from "../../domain/sources";
  import { webTarget } from "../../domain/web";
  import { listNdiSources, ndiShortName } from "../../domain/ndi";
  import type { TimerMode } from "../../domain/timer";
  import DeskDialog from "./DeskDialog.svelte";
  import Icon from "../Icon.svelte";
  import Screen from "../Screen.svelte";
  import DeckThumb from "../decks/DeckThumb.svelte";
  import { sourceMeta } from "../obs/source-meta";
  import { buildSource, sourceKindLabel } from "../../domain/sources";
  import { compileSource } from "../../domain/composition";
  import { emptyModel } from "../../domain/theme";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import type { TextStyle } from "../../domain/types";
  import { msg, t } from "../../i18n/core";

  let {
    name: initialName,
    fields: initialFields,
    readonly,
    notice,
    onsave,
    onclose,
    returnTo,
  }: {
    name: string;
    fields: SourceFields;
    readonly: boolean;
    notice: string | null;
    onsave: (name: string, fields: SourceFields) => void;
    onclose: () => void;
    returnTo?: () => HTMLElement | null | undefined;
  } = $props();

  // Local drafts; the dialog is remounted per edit, so initial props are read once.
  let name = $state(untrack(() => initialName));
  let fields = $state<SourceFields>(untrack(() => structuredClone($state.snapshot(initialFields)) as SourceFields));
  const meta = $derived(sourceMeta(fields.type));
  /** The source as it will paint, from the fields as they are now. */
  const previewModel = $derived.by(() => {
    try {
      return compileSource(buildSource($state.snapshot(fields) as SourceFields), { theme: session.theme(), now: Date.now() });
    } catch {
      return emptyModel(session.theme());
    }
  });
  let error = $state<string | null>(null);
  let video = $state<HTMLVideoElement | undefined>();
  let lookingUp = $state(false);

  const modes: { id: TimerMode; label: string }[] = [
    { id: "countdown", label: msg("Countdown") },
    { id: "countup", label: msg("Count up") },
    { id: "clock", label: msg("Clock") },
    { id: "target", label: msg("Target time") },
  ];

  const deviceId = $derived(fields.type === "camera" ? fields.deviceId : null);
  const song = $derived.by(() => {
    const current = fields;
    return current.type === "song" ? session.songs.find((entry) => entry.id === current.songId) : undefined;
  });

  // Cameras load asynchronously; choose the first one once it arrives if none is set.
  $effect(() => {
    const first = session.cameras[0];
    if (!first) return;
    untrack(() => {
      if (fields.type === "camera" && !fields.deviceId) fields = { ...fields, deviceId: first.deviceId, label: first.label };
    });
  });

  // Camera thumbnail: a private stream for this dialog only. Never touches Preview.
  $effect(() => {
    const id = deviceId;
    const node = video;
    if (!id || !node || !navigator.mediaDevices) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    error = null;
    openCamera(navigator.mediaDevices, id)
      .then((opened) => {
        if (cancelled) {
          stopCameraStream(opened as MediaStream);
          return;
        }
        stream = opened as MediaStream;
        node.srcObject = stream;
      })
      .catch((reason: unknown) => {
        if (!cancelled) error = reason instanceof Error ? reason.message : t("Church Studio cannot open that camera.");
      });
    return () => {
      cancelled = true;
      node.srcObject = null;
      stopCameraStream(stream);
    };
  });

  function pickCamera(id: string) {
    if (fields.type !== "camera") return;
    const camera = session.cameras.find((entry) => entry.deviceId === id);
    fields = { ...fields, deviceId: id, label: camera?.label ?? fields.label };
  }

  async function lookUp() {
    if (fields.type !== "scripture") return;
    lookingUp = true;
    error = null;
    const found = await session.scriptureFields(fields.reference);
    lookingUp = false;
    if (!found) {
      error = t("Reference not found.");
      return;
    }
    // Keep the style the operator already chose.
    fields = found.type === "scripture" && fields.type === "scripture" ? { ...found, style: fields.style } : found;
    if (!name.trim() || name === initialName) name = found.type === "scripture" ? found.reference : name;
  }

  function pickSong(id: string) {
    if (fields.type !== "song") return;
    const next = session.songs.find((entry) => entry.id === id);
    const section = next?.sections[0];
    fields = {
      ...fields,
      songId: id,
      sectionId: section?.id ?? "",
      label: next && section ? `${next.title} — ${section.label}` : (next?.title ?? ""),
      body: section?.lines.join("\n") ?? "",
    };
  }

  function pickSection(id: string) {
    if (fields.type !== "song" || !song) return;
    const section = song.sections.find((entry) => entry.id === id);
    if (!section) return;
    fields = { ...fields, sectionId: id, label: `${song.title} — ${section.label}`, body: section.lines.join("\n") };
  }

  function targetValue(at: number | null): string {
    if (!at) return "";
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const valid = $derived(
    name.trim().length > 0 &&
      (fields.type !== "camera" || fields.deviceId.length > 0) &&
      (fields.type !== "scripture" || fields.body.length > 0) &&
      (fields.type !== "song" || fields.body.length > 0) &&
      (fields.type !== "image" || fields.imageUrl.length > 0) &&
      (fields.type !== "video" || fields.videoUrl.length > 0) &&
      (fields.type !== "qr" || (fields.data.trim().length > 0 && fields.data.trim() !== "https://")) &&
      (fields.type !== "slide" || fields.deckId.length > 0),
  );

  function save() {
    if (readonly || !valid) return;
    onsave(name.trim(), $state.snapshot(fields) as SourceFields);
  }

  // NDI: the sources the hub on this computer sees (null when NDI is not available here).
  let ndiSources = $state<string[] | null>([]);
  async function refreshNdi() {
    ndiSources = await listNdiSources();
  }
  $effect(() => {
    if (fields.type === "ndi") void refreshNdi();
  });
</script>

<DeskDialog title={t("Properties for “{initialName}”", { initialName })} {onclose} {returnTo} wide>
  {#if notice}
    <p class="notice" role="status">{notice}</p>
  {/if}
  <div class="layout" style:--tint={meta.color}>
  <div class="form">
  <div class="intro">
    <span class="type-icon"><Icon name={meta.icon} size={18} /></span>
    <span><strong>{sourceKindLabel(fields.type)}</strong><em>{t(meta.blurb)}</em></span>
  </div>
  <fieldset disabled={readonly}>
    <label class="row">
      <span>{t("Name")}</span>
      <input class="field" aria-label={t("Name")} bind:value={name} />
    </label>

    {#if fields.type === "camera"}
      <label class="row">
        <span>{t("Device")}</span>
        <span class="inline">
          <select class="field" aria-label={t("Device")} value={fields.deviceId} onchange={(event) => pickCamera(event.currentTarget.value)}>
            {#if session.cameras.length === 0}
              <option value="">{t("No camera found")}</option>
            {/if}
            {#each session.cameras as camera (camera.deviceId)}
              <option value={camera.deviceId}>{camera.label}</option>
            {/each}
          </select>
          <button type="button" class="desk-btn" onclick={() => void session.loadCameras()}>{t("Refresh")}</button>
        </span>
      </label>
      <label class="check">
        <input type="checkbox" checked={fields.mirror} onchange={(event) => fields.type === "camera" && (fields = { ...fields, mirror: event.currentTarget.checked })} />
        {t("Mirror")}
      </label>
      <div class="thumb">
        {#if fields.deviceId}
          <video bind:this={video} class:mirror={fields.mirror} autoplay muted playsinline></video>
        {:else}
          <p class="note">{t("No camera found. Connect one, then Refresh.")}</p>
        {/if}
      </div>
    {:else if fields.type === "scripture"}
      <label class="row">
        <span>{t("Reference")}</span>
        <span class="inline">
          <input
            class="field"
            aria-label={t("Reference")}
            placeholder={t("John 3:16")}
            value={fields.reference}
            oninput={(event) => fields.type === "scripture" && (fields = { ...fields, reference: event.currentTarget.value, body: "" })}
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void lookUp();
              }
            }}
          />
          <button type="button" class="desk-btn" disabled={lookingUp} onclick={() => void lookUp()}>{t("Look up")}</button>
        </span>
      </label>
      {#if fields.body}
        <blockquote class="preview">{fields.body} <cite>{fields.attribution}</cite></blockquote>
      {/if}
    {:else if fields.type === "song"}
      <label class="row">
        <span>{t("Song")}</span>
        <select class="field" aria-label={t("Song")} value={fields.songId} onchange={(event) => pickSong(event.currentTarget.value)}>
          <option value="" disabled>{t("Choose a song")}</option>
          {#each session.songs as entry (entry.id)}
            <option value={entry.id}>{entry.title}</option>
          {/each}
        </select>
      </label>
      {#if song}
        <label class="row">
          <span>{t("Section")}</span>
          <select class="field" aria-label={t("Section")} value={fields.sectionId} onchange={(event) => pickSection(event.currentTarget.value)}>
            {#each song.sections as section (section.id)}
              <option value={section.id}>{section.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if session.songs.length === 0}
        <p class="note">{t("No songs yet. Add songs on Presenter Desk.")}</p>
      {/if}
      {#if fields.body}
        <pre class="preview">{fields.body}</pre>
      {/if}
    {:else if fields.type === "text"}
      <div class="row words-row">
        <span>{t("Words")}</span>
        <TextWords heading={fields.heading} body={fields.body} rich={fields.rich ?? null} onchange={(words) => fields.type === "text" && (fields = { ...fields, ...words })} />
      </div>
    {:else if fields.type === "timer"}
      <label class="row">
        <span>{t("Mode")}</span>
        <select class="field" aria-label={t("Mode")} value={fields.mode} onchange={(event) => fields.type === "timer" && (fields = { ...fields, mode: event.currentTarget.value as TimerMode })}>
          {#each modes as mode (mode.id)}
            <option value={mode.id}>{t(mode.label)}</option>
          {/each}
        </select>
      </label>
      {#if fields.mode === "countdown" || fields.mode === "countup"}
        <label class="row">
          <span>{t("Minutes")}</span>
          <input
            class="field"
            type="number"
            min="0"
            max="600"
            aria-label={t("Minutes")}
            value={Math.round(fields.durationMs / 60_000)}
            oninput={(event) => fields.type === "timer" && (fields = { ...fields, durationMs: Math.max(0, Number(event.currentTarget.value) || 0) * 60_000 })}
          />
        </label>
      {:else if fields.mode === "target"}
        <label class="row">
          <span>{t("Target")}</span>
          <input
            class="field"
            type="datetime-local"
            aria-label={t("Target time")}
            value={targetValue(fields.targetAt)}
            oninput={(event) => {
              const at = Date.parse(event.currentTarget.value);
              if (fields.type === "timer") fields = { ...fields, targetAt: Number.isFinite(at) ? at : null };
            }}
          />
        </label>
      {/if}
      <label class="row">
        <span>{t("Label")}</span>
        <input class="field" aria-label={t("Label")} value={fields.label} oninput={(event) => fields.type === "timer" && (fields = { ...fields, label: event.currentTarget.value })} />
      </label>
      {#if fields.mode !== "clock"}
        <label class="row">
          <span>{t("Red at")}</span>
          <span class="inline">
            <input
              class="field"
              type="number"
              min="0"
              max="3600"
              aria-label={t("Warning seconds")}
              value={Math.round(fields.warningMs / 1000)}
              oninput={(event) => fields.type === "timer" && (fields = { ...fields, warningMs: Math.max(0, Number(event.currentTarget.value) || 0) * 1000 })}
            />
            <span class="unit">{t("seconds left (turns red and pulses)")}</span>
          </span>
        </label>
      {/if}
    {:else if fields.type === "clock"}
      <label class="row">
        <span>{t("Label")}</span>
        <input class="field" aria-label={t("Label")} placeholder={t("Optional, e.g. Local time")} value={fields.label} oninput={(event) => fields.type === "clock" && (fields = { ...fields, label: event.currentTarget.value })} />
      </label>
    {:else if fields.type === "lower-third"}
      <label class="row">
        <span>{t("Template")}</span>
        <select class="field" aria-label={t("Template")} value={fields.templateId} onchange={(event) => fields.type === "lower-third" && (fields = { ...fields, templateId: event.currentTarget.value })}>
          {#each LOWER_THIRD_TEMPLATES as template (template.id)}
            <option value={template.id}>{template.name}</option>
          {/each}
        </select>
      </label>
      <div class="row words-row">
        <span>{t("Title")}</span>
        <InlineWords text={fields.title} rich={fields.titleRich ?? null} label={t("Title")} onchange={(words) => fields.type === "lower-third" && (fields = { ...fields, title: words.text, titleRich: words.rich })} />
      </div>
      <div class="row words-row">
        <span>{t("Subtitle")}</span>
        <InlineWords text={fields.subtitle} rich={fields.subtitleRich ?? null} label={t("Subtitle")} onchange={(words) => fields.type === "lower-third" && (fields = { ...fields, subtitle: words.text, subtitleRich: words.rich })} />
      </div>
    {:else if fields.type === "slide"}
      {@const deckId = fields.type === "slide" ? fields.deckId : ""}
      {@const pageIndex = fields.type === "slide" ? fields.page : 0}
      {@const deck = session.decks.find((entry) => entry.id === deckId)}
      <label class="row">
        <span>{t("Deck")}</span>
        <select class="field" aria-label={t("Deck")} value={deckId} onchange={(event) => fields.type === "slide" && (fields = { ...fields, deckId: event.currentTarget.value, page: 0 })}>
          <option value="" disabled>{t("Choose a deck")}</option>
          {#each session.decks as entry (entry.id)}<option value={entry.id}>{entry.name}</option>{/each}
        </select>
      </label>
      {#if deck}
        <div class="slide-pages" role="radiogroup" aria-label={t("Page")}>
          {#each deck.pages as page, index (index)}
            <button type="button" role="radio" aria-checked={pageIndex === index} class:on={pageIndex === index} title={page.name} onclick={() => fields.type === "slide" && (fields = { ...fields, page: index })}>
              <DeckThumb {page} />
              <span>{index + 1}</span>
            </button>
          {/each}
        </div>
        <p class="hint">{t("A page with no background shows what is behind it, like a lower third over a camera. Edit the deck and this layer changes too.")}</p>
      {:else if !session.decks.length}
        <p class="hint">{t("Design a page in Slides first: a lower third, a logo or a bar.")}</p>
      {/if}
    {:else if fields.type === "ndi"}
      <div class="row">
        <span>{t("Source")}</span>
        <span class="inline ndi-pick">
          <select
            class="field"
            aria-label={t("NDI source")}
            value={fields.name}
            onchange={(event) => {
              if (fields.type !== "ndi") return;
              const chosen = event.currentTarget.value;
              // A source still called by its kind takes the camera's own name.
              if (chosen && (!name.trim() || /^NDI source( \d+)?$/.test(name.trim()))) name = ndiShortName(chosen);
              fields = { ...fields, name: chosen };
            }}
          >
            <option value="">{ndiSources === null ? t("NDI is not available here") : ndiSources.length ? t("Choose a source…") : t("Looking for sources…")}</option>
            {#if fields.name && !(ndiSources ?? []).includes(fields.name)}<option value={fields.name}>{t("{name} (not seen now)", { name: fields.name })}</option>{/if}
            {#each ndiSources ?? [] as name, index (`${index}:${name}`)}<option value={name}>{name}</option>{/each}
          </select>
          <button type="button" class="choice" onclick={() => void refreshNdi()}>{t("Refresh")}</button>
        </span>
      </div>
      <p class="hint">
        {#if ndiSources === null}{t("NDI sources show in the Church Studio app for Mac, with the free NDI Tools installed")} (<a href="https://ndi.video/tools" target="_blank" rel="noreferrer">ndi.video/tools</a>).
        {:else if ndiSources.length === 0}{t("No NDI sources found yet. Check the camera or computer sending NDI is on the same network, then Refresh.")}
        {:else}{t("Cameras, OBS or vMix outputs and other computers sending NDI on this network. NDI® is a registered trademark of Vizrt NDI AB.")}{/if}
      </p>
    {:else if fields.type === "web"}
      {@const target = webTarget(fields.url)}
      <label class="row">
        <span>{t("Link")}</span>
        <input
          class="field"
          aria-label={t("Web address")}
          placeholder={t("yourchurch.org/live, a YouTube or Vimeo link, a Google Slides link")}
          value={fields.url}
          oninput={(event) => fields.type === "web" && (fields = { ...fields, url: event.currentTarget.value })}
        />
      </label>
      <p class="hint">
        {#if !fields.url.trim()}{t("Paste any link. YouTube, Vimeo and Google Slides links become a full-screen player.")}
        {:else if !target}{t("That does not look like a web address.")}
        {:else if target.kind === "website"}{t("Shows {label} live. Some sites refuse to be shown inside other apps; if the preview stays blank, that site does not allow it.", { label: target.label })}
        {:else}{target.kind === "youtube" ? t("Plays as a YouTube player.") : target.kind === "vimeo" ? t("Plays as a Vimeo player.") : t("Plays as a Google Slides slideshow.")}{/if}
      </p>
      {#if target && target.kind !== "slides"}
        <div class="row">
          <span>{t("Sound")}</span>
          <span class="inline" role="radiogroup" aria-label={t("Sound")}>
            <button type="button" role="radio" class="choice" aria-checked={!fields.mute} onclick={() => fields.type === "web" && (fields = { ...fields, mute: false })}>{t("On the audience screen")}</button>
            <button type="button" role="radio" class="choice" aria-checked={fields.mute} onclick={() => fields.type === "web" && (fields = { ...fields, mute: true })}>{t("Off")}</button>
          </span>
        </div>
      {/if}
      {#if target?.kind === "website"}
        <div class="row">
          <span>{t("Page size")}</span>
          <span class="inline" role="radiogroup" aria-label={t("Page size")}>
            {#each [[0.75, "Smaller"], [1, "Normal"], [1.5, "Larger"], [2, "Largest"]] as [zoom, label] (zoom)}
              <button type="button" role="radio" class="choice" aria-checked={fields.zoom === zoom} onclick={() => fields.type === "web" && (fields = { ...fields, zoom: Number(zoom) })}>{label}</button>
            {/each}
          </span>
        </div>
      {/if}
    {:else if fields.type === "qr"}
      <label class="row">
        <span>{t("Link")}</span>
        <input
          class="field"
          aria-label={t("QR link")}
          placeholder="https://yourchurch.org/give"
          value={fields.data}
          oninput={(event) => fields.type === "qr" && (fields = { ...fields, data: event.currentTarget.value })}
        />
      </label>
      <div class="row">
        <span>{t("Style")}</span>
        <span class="inline" role="radiogroup" aria-label={t("QR style")}>
          {#each ["rounded", "dots", "square"] as style (style)}
            <button
              type="button"
              role="radio"
              class="choice"
              aria-checked={fields.pattern === style}
              onclick={() => fields.type === "qr" && (fields = { ...fields, pattern: style as "square" | "rounded" | "dots" })}
            >{style[0]!.toUpperCase() + style.slice(1)}</button>
          {/each}
        </span>
      </div>
      <div class="row">
        <span>{t("Colors")}</span>
        <span class="inline">
          <label class="swatch">{t("Code")} <input type="color" aria-label={t("QR code color")} value={fields.dark} oninput={(event) => fields.type === "qr" && (fields = { ...fields, dark: event.currentTarget.value })} /></label>
          <label class="swatch">{t("Background")} <input type="color" aria-label={t("QR background color")} value={fields.light} oninput={(event) => fields.type === "qr" && (fields = { ...fields, light: event.currentTarget.value })} /></label>
        </span>
      </div>
      <label class="row">
        <span>{t("Caption")}</span>
        <input class="field" aria-label={t("QR caption")} placeholder={t("Scan to give")} maxlength="80" value={fields.caption} oninput={(event) => fields.type === "qr" && (fields = { ...fields, caption: event.currentTarget.value })} />
      </label>
      <p class="note">{t("Keep strong contrast (dark code on a light background) so every phone can scan it.")}</p>
    {:else if fields.type === "video"}
      {#if !session.media.some((asset) => asset.kind === "video")}
        <p class="note">{t("No videos yet. Import one in Media.")}</p>
      {:else}
        <div class="media" role="listbox" aria-label={t("Videos")}>
          {#each session.media.filter((asset) => asset.kind === "video") as asset (asset.id)}
            <button
              type="button"
              role="option"
              aria-selected={fields.assetId === asset.id}
              class:on={fields.assetId === asset.id}
              onclick={() => {
                if (fields.type === "video") fields = { ...fields, assetId: asset.id, name: asset.name, videoUrl: mediaUrl(asset) ?? "" };
              }}
            >{asset.name}</button>
          {/each}
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" checked={fields.loop} onchange={(event) => fields.type === "video" && (fields = { ...fields, loop: event.currentTarget.checked })} />
        {t("Loop")}
      </label>
      <label class="check">
        <input type="checkbox" checked={fields.muted} onchange={(event) => fields.type === "video" && (fields = { ...fields, muted: event.currentTarget.checked })} />
        {t("No sound on the audience screen")}
      </label>
    {:else if fields.type === "image"}
      {#if !session.media.some((asset) => asset.kind === "image")}
        <p class="note">{t("No images yet. Import images in Settings → Media.")}</p>
      {:else}
        <div class="media" role="listbox" aria-label={t("Images")}>
          {#each session.media.filter((asset) => asset.kind === "image") as asset (asset.id)}
            <button
              type="button"
              role="option"
              aria-selected={fields.assetId === asset.id}
              class:on={fields.assetId === asset.id}
              onclick={() => {
                if (fields.type === "image") fields = { ...fields, assetId: asset.id, name: asset.name, imageUrl: mediaUrl(asset) ?? "" };
              }}
            >{asset.name}</button>
          {/each}
        </div>
      {/if}
    {/if}
    {#if "style" in fields}
      <TextStyleEditor
        style={fields.style}
        label={fields.type === "timer" || fields.type === "clock" ? t("Look and position") : t("Text style")}
        onchange={(style: TextStyle) => {
          if ("style" in fields) fields = { ...fields, style } as SourceFields;
        }}
      />
    {/if}
  </fieldset>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  </div>
  <figure class="live-preview">
    <figcaption>{t("How it looks")}</figcaption>
    <div class="screen-box"><Screen model={previewModel} /></div>
    <p class="note">{t("Changes show on Preview. Program updates when you go live.")}</p>
  </figure>
  </div>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>{readonly ? t("Close") : t("Cancel")}</button>
    {#if !readonly}
      <button type="button" class="desk-btn primary" disabled={!valid} onclick={save}>{t("OK")}</button>
    {/if}
  {/snippet}
</DeskDialog>

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); gap: 18px; align-items: start; }
  .form { display: grid; gap: 12px; min-width: 0; }
  .intro { display: flex; align-items: center; gap: 10px; }
  .intro span:last-child { display: grid; gap: 1px; }
  .intro strong { font-size: 14px; }
  .intro em { font-style: normal; font-size: 12px; color: var(--muted); }
  .type-icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 10px; background: color-mix(in srgb, var(--tint) 18%, transparent); color: var(--tint); }
  .live-preview { position: sticky; top: 0; margin: 0; display: grid; gap: 8px; }
  .live-preview figcaption { font-size: 12px; font-weight: 650; color: var(--muted); }
  .screen-box { container-type: inline-size; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #000; }
  @media (max-width: 820px) { .layout { grid-template-columns: 1fr; } .live-preview { position: static; } }
  fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .row { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: center; gap: 10px; }
  .row > span:first-child { color: var(--muted); }
  .row.words-row { align-items: start; }
  .row.words-row > span:first-child { padding-top: 6px; }
  .inline { display: flex; gap: 6px; min-width: 0; }
  .inline .field { flex: 1; min-width: 0; }
  .unit { color: var(--muted); font-size: 12px; align-self: center; }
  .choice { min-height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; }
  .choice[aria-checked="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .swatch { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
  .swatch input { width: 34px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }
  .field {
    height: var(--control-h);
    border-radius: var(--radius-control);
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 0 10px;
    font: inherit;
    min-width: 0;
  }
  .check { display: flex; align-items: center; gap: 8px; margin-left: 94px; }
  .hint { margin: -6px 0 0 94px; font-size: 12px; line-height: 1.45; color: var(--muted); }
  .thumb {
    margin-left: 94px;
    aspect-ratio: 16 / 9;
    background: #000;
    border-radius: var(--radius-control);
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  .thumb video { width: 100%; height: 100%; object-fit: cover; }
  .thumb video.mirror { transform: scaleX(-1); }
  .preview {
    margin: 0 0 0 94px;
    padding: 8px 10px;
    border-left: 2px solid var(--line);
    color: var(--muted);
    white-space: pre-wrap;
    font: inherit;
    max-height: 140px;
    overflow: auto;
  }
  .preview cite { font-style: normal; opacity: 0.7; }
  .media { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow: auto; border: 1px solid var(--line); border-radius: var(--radius-control); padding: 4px; }
  .media button { text-align: left; border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: var(--ink); padding: 6px 8px; }
  .media button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .note { margin: 0; color: var(--muted); }
  .notice { margin: 0; padding: 8px 10px; border-radius: var(--radius-control); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .error { margin: 0; color: var(--live, #ff5a5a); }
  .slide-pages { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; max-height: 260px; overflow: auto; padding: 2px; }
  .slide-pages button { position: relative; padding: 0; border: 2px solid transparent; border-radius: 10px; background: none; cursor: pointer; overflow: hidden; }
  .slide-pages button.on { border-color: var(--accent); }
  .slide-pages button span { position: absolute; left: 6px; top: 4px; font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgb(0 0 0 / 0.8); }
</style>
