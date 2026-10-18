<script lang="ts">
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
  import { sourceMeta } from "../obs/source-meta";
  import { buildSource, sourceKindLabel } from "../../domain/sources";
  import { compileSource } from "../../domain/composition";
  import { emptyModel } from "../../domain/theme";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import type { TextStyle } from "../../domain/types";

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
    { id: "countdown", label: "Countdown" },
    { id: "countup", label: "Count up" },
    { id: "clock", label: "Clock" },
    { id: "target", label: "Target time" },
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
        if (!cancelled) error = reason instanceof Error ? reason.message : "Church Studio cannot open that camera.";
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
      error = "Reference not found.";
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
      (fields.type !== "qr" || (fields.data.trim().length > 0 && fields.data.trim() !== "https://")),
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

<DeskDialog title={`Properties for “${initialName}”`} {onclose} {returnTo} wide>
  {#if notice}
    <p class="notice" role="status">{notice}</p>
  {/if}
  <div class="layout" style:--tint={meta.color}>
  <div class="form">
  <div class="intro">
    <span class="type-icon"><Icon name={meta.icon} size={18} /></span>
    <span><strong>{sourceKindLabel(fields.type)}</strong><em>{meta.blurb}</em></span>
  </div>
  <fieldset disabled={readonly}>
    <label class="row">
      <span>Name</span>
      <input class="field" aria-label="Name" bind:value={name} />
    </label>

    {#if fields.type === "camera"}
      <label class="row">
        <span>Device</span>
        <span class="inline">
          <select class="field" aria-label="Device" value={fields.deviceId} onchange={(event) => pickCamera(event.currentTarget.value)}>
            {#if session.cameras.length === 0}
              <option value="">No camera found</option>
            {/if}
            {#each session.cameras as camera (camera.deviceId)}
              <option value={camera.deviceId}>{camera.label}</option>
            {/each}
          </select>
          <button type="button" class="desk-btn" onclick={() => void session.loadCameras()}>Refresh</button>
        </span>
      </label>
      <label class="check">
        <input type="checkbox" checked={fields.mirror} onchange={(event) => fields.type === "camera" && (fields = { ...fields, mirror: event.currentTarget.checked })} />
        Mirror
      </label>
      <div class="thumb">
        {#if fields.deviceId}
          <video bind:this={video} class:mirror={fields.mirror} autoplay muted playsinline></video>
        {:else}
          <p class="note">No camera found. Connect one, then Refresh.</p>
        {/if}
      </div>
    {:else if fields.type === "scripture"}
      <label class="row">
        <span>Reference</span>
        <span class="inline">
          <input
            class="field"
            aria-label="Reference"
            placeholder="John 3:16"
            value={fields.reference}
            oninput={(event) => fields.type === "scripture" && (fields = { ...fields, reference: event.currentTarget.value, body: "" })}
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void lookUp();
              }
            }}
          />
          <button type="button" class="desk-btn" disabled={lookingUp} onclick={() => void lookUp()}>Look up</button>
        </span>
      </label>
      {#if fields.body}
        <blockquote class="preview">{fields.body} <cite>{fields.attribution}</cite></blockquote>
      {/if}
    {:else if fields.type === "song"}
      <label class="row">
        <span>Song</span>
        <select class="field" aria-label="Song" value={fields.songId} onchange={(event) => pickSong(event.currentTarget.value)}>
          <option value="" disabled>Choose a song</option>
          {#each session.songs as entry (entry.id)}
            <option value={entry.id}>{entry.title}</option>
          {/each}
        </select>
      </label>
      {#if song}
        <label class="row">
          <span>Section</span>
          <select class="field" aria-label="Section" value={fields.sectionId} onchange={(event) => pickSection(event.currentTarget.value)}>
            {#each song.sections as section (section.id)}
              <option value={section.id}>{section.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if session.songs.length === 0}
        <p class="note">No songs yet. Add songs on Presenter Desk.</p>
      {/if}
      {#if fields.body}
        <pre class="preview">{fields.body}</pre>
      {/if}
    {:else if fields.type === "text"}
      <label class="row">
        <span>Heading</span>
        <input class="field" aria-label="Heading" value={fields.heading} oninput={(event) => fields.type === "text" && (fields = { ...fields, heading: event.currentTarget.value })} />
      </label>
      <label class="row">
        <span>Body</span>
        <textarea class="field area" aria-label="Body" value={fields.body} oninput={(event) => fields.type === "text" && (fields = { ...fields, body: event.currentTarget.value })}></textarea>
      </label>
    {:else if fields.type === "timer"}
      <label class="row">
        <span>Mode</span>
        <select class="field" aria-label="Mode" value={fields.mode} onchange={(event) => fields.type === "timer" && (fields = { ...fields, mode: event.currentTarget.value as TimerMode })}>
          {#each modes as mode (mode.id)}
            <option value={mode.id}>{mode.label}</option>
          {/each}
        </select>
      </label>
      {#if fields.mode === "countdown" || fields.mode === "countup"}
        <label class="row">
          <span>Minutes</span>
          <input
            class="field"
            type="number"
            min="0"
            max="600"
            aria-label="Minutes"
            value={Math.round(fields.durationMs / 60_000)}
            oninput={(event) => fields.type === "timer" && (fields = { ...fields, durationMs: Math.max(0, Number(event.currentTarget.value) || 0) * 60_000 })}
          />
        </label>
      {:else if fields.mode === "target"}
        <label class="row">
          <span>Target</span>
          <input
            class="field"
            type="datetime-local"
            aria-label="Target time"
            value={targetValue(fields.targetAt)}
            oninput={(event) => {
              const at = Date.parse(event.currentTarget.value);
              if (fields.type === "timer") fields = { ...fields, targetAt: Number.isFinite(at) ? at : null };
            }}
          />
        </label>
      {/if}
      <label class="row">
        <span>Label</span>
        <input class="field" aria-label="Label" value={fields.label} oninput={(event) => fields.type === "timer" && (fields = { ...fields, label: event.currentTarget.value })} />
      </label>
      {#if fields.mode !== "clock"}
        <label class="row">
          <span>Red at</span>
          <span class="inline">
            <input
              class="field"
              type="number"
              min="0"
              max="3600"
              aria-label="Warning seconds"
              value={Math.round(fields.warningMs / 1000)}
              oninput={(event) => fields.type === "timer" && (fields = { ...fields, warningMs: Math.max(0, Number(event.currentTarget.value) || 0) * 1000 })}
            />
            <span class="unit">seconds left (turns red and pulses)</span>
          </span>
        </label>
      {/if}
    {:else if fields.type === "clock"}
      <label class="row">
        <span>Label</span>
        <input class="field" aria-label="Label" placeholder="Optional, e.g. Local time" value={fields.label} oninput={(event) => fields.type === "clock" && (fields = { ...fields, label: event.currentTarget.value })} />
      </label>
    {:else if fields.type === "lower-third"}
      <label class="row">
        <span>Template</span>
        <select class="field" aria-label="Template" value={fields.templateId} onchange={(event) => fields.type === "lower-third" && (fields = { ...fields, templateId: event.currentTarget.value })}>
          {#each LOWER_THIRD_TEMPLATES as template (template.id)}
            <option value={template.id}>{template.name}</option>
          {/each}
        </select>
      </label>
      <label class="row">
        <span>Title</span>
        <input class="field" aria-label="Title" value={fields.title} oninput={(event) => fields.type === "lower-third" && (fields = { ...fields, title: event.currentTarget.value })} />
      </label>
      <label class="row">
        <span>Subtitle</span>
        <input class="field" aria-label="Subtitle" value={fields.subtitle} oninput={(event) => fields.type === "lower-third" && (fields = { ...fields, subtitle: event.currentTarget.value })} />
      </label>
    {:else if fields.type === "ndi"}
      <div class="row">
        <span>Source</span>
        <span class="inline ndi-pick">
          <select
            class="field"
            aria-label="NDI source"
            value={fields.name}
            onchange={(event) => {
              if (fields.type !== "ndi") return;
              const chosen = event.currentTarget.value;
              // A source still called by its kind takes the camera's own name.
              if (chosen && (!name.trim() || /^NDI source( \d+)?$/.test(name.trim()))) name = ndiShortName(chosen);
              fields = { ...fields, name: chosen };
            }}
          >
            <option value="">{ndiSources === null ? "NDI is not available here" : ndiSources.length ? "Choose a source…" : "Looking for sources…"}</option>
            {#if fields.name && !(ndiSources ?? []).includes(fields.name)}<option value={fields.name}>{fields.name} (not seen now)</option>{/if}
            {#each ndiSources ?? [] as name (name)}<option value={name}>{name}</option>{/each}
          </select>
          <button type="button" class="choice" onclick={() => void refreshNdi()}>Refresh</button>
        </span>
      </div>
      <p class="hint">
        {#if ndiSources === null}NDI sources show in the Church Studio app for Mac, with the free NDI Tools installed (<a href="https://ndi.video/tools" target="_blank" rel="noreferrer">ndi.video/tools</a>).
        {:else if ndiSources.length === 0}No NDI sources found yet. Check the camera or computer sending NDI is on the same network, then Refresh.
        {:else}Cameras, OBS or vMix outputs and other computers sending NDI on this network. NDI® is a registered trademark of Vizrt NDI AB.{/if}
      </p>
    {:else if fields.type === "web"}
      {@const target = webTarget(fields.url)}
      <label class="row">
        <span>Link</span>
        <input
          class="field"
          aria-label="Web address"
          placeholder="yourchurch.org/live, a YouTube or Vimeo link, a Google Slides link"
          value={fields.url}
          oninput={(event) => fields.type === "web" && (fields = { ...fields, url: event.currentTarget.value })}
        />
      </label>
      <p class="hint">
        {#if !fields.url.trim()}Paste any link. YouTube, Vimeo and Google Slides links become a full-screen player.
        {:else if !target}That does not look like a web address.
        {:else if target.kind === "website"}Shows {target.label} live. Some sites refuse to be shown inside other apps; if the preview stays blank, that site does not allow it.
        {:else}Plays as a {target.kind === "youtube" ? "YouTube" : target.kind === "vimeo" ? "Vimeo" : "Google Slides"} {target.kind === "slides" ? "slideshow" : "player"}.{/if}
      </p>
      {#if target && target.kind !== "slides"}
        <div class="row">
          <span>Sound</span>
          <span class="inline" role="radiogroup" aria-label="Sound">
            <button type="button" role="radio" class="choice" aria-checked={!fields.mute} onclick={() => fields.type === "web" && (fields = { ...fields, mute: false })}>On the audience screen</button>
            <button type="button" role="radio" class="choice" aria-checked={fields.mute} onclick={() => fields.type === "web" && (fields = { ...fields, mute: true })}>Off</button>
          </span>
        </div>
      {/if}
      {#if target?.kind === "website"}
        <div class="row">
          <span>Page size</span>
          <span class="inline" role="radiogroup" aria-label="Page size">
            {#each [[0.75, "Smaller"], [1, "Normal"], [1.5, "Larger"], [2, "Largest"]] as [zoom, label] (zoom)}
              <button type="button" role="radio" class="choice" aria-checked={fields.zoom === zoom} onclick={() => fields.type === "web" && (fields = { ...fields, zoom: Number(zoom) })}>{label}</button>
            {/each}
          </span>
        </div>
      {/if}
    {:else if fields.type === "qr"}
      <label class="row">
        <span>Link</span>
        <input
          class="field"
          aria-label="QR link"
          placeholder="https://yourchurch.org/give"
          value={fields.data}
          oninput={(event) => fields.type === "qr" && (fields = { ...fields, data: event.currentTarget.value })}
        />
      </label>
      <div class="row">
        <span>Style</span>
        <span class="inline" role="radiogroup" aria-label="QR style">
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
        <span>Colors</span>
        <span class="inline">
          <label class="swatch">Code <input type="color" aria-label="QR code color" value={fields.dark} oninput={(event) => fields.type === "qr" && (fields = { ...fields, dark: event.currentTarget.value })} /></label>
          <label class="swatch">Background <input type="color" aria-label="QR background color" value={fields.light} oninput={(event) => fields.type === "qr" && (fields = { ...fields, light: event.currentTarget.value })} /></label>
        </span>
      </div>
      <label class="row">
        <span>Caption</span>
        <input class="field" aria-label="QR caption" placeholder="Scan to give" maxlength="80" value={fields.caption} oninput={(event) => fields.type === "qr" && (fields = { ...fields, caption: event.currentTarget.value })} />
      </label>
      <p class="note">Keep strong contrast (dark code on a light background) so every phone can scan it.</p>
    {:else if fields.type === "video"}
      {#if !session.media.some((asset) => asset.kind === "video")}
        <p class="note">No videos yet. Import one in Media.</p>
      {:else}
        <div class="media" role="listbox" aria-label="Videos">
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
        Loop
      </label>
      <label class="check">
        <input type="checkbox" checked={fields.muted} onchange={(event) => fields.type === "video" && (fields = { ...fields, muted: event.currentTarget.checked })} />
        No sound on the audience screen
      </label>
    {:else if fields.type === "image"}
      {#if !session.media.some((asset) => asset.kind === "image")}
        <p class="note">No images yet. Import images in Settings → Media.</p>
      {:else}
        <div class="media" role="listbox" aria-label="Images">
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
        label={fields.type === "timer" || fields.type === "clock" ? "Look and position" : "Text style"}
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
    <figcaption>How it looks</figcaption>
    <div class="screen-box"><Screen model={previewModel} /></div>
    <p class="note">Changes show on Preview. Program updates when you go live.</p>
  </figure>
  </div>
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={onclose}>{readonly ? "Close" : "Cancel"}</button>
    {#if !readonly}
      <button type="button" class="desk-btn primary" disabled={!valid} onclick={save}>OK</button>
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
  .area { height: 88px; padding: 8px 10px; resize: vertical; }
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
</style>
