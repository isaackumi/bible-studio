<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { mediaUrl } from "../../db/api";
  import {
    assignLayerSource,
    removeLayer,
    renameLayer,
    reorderLayers,
    resizeLayer,
    setLayerFit,
    setLayerLocked,
    setLayerOpacity,
    setLayerStyle,
    sourceRef,
    type Composition,
    type CompositionLayer,
    type LayerFit,
  } from "../../domain/composition";
  import { parseTextStyle } from "../../domain/text-style";
  import TextStyleEditor from "../TextStyleEditor.svelte";
  import { msg, t } from "../../i18n/core";
  import { encodeRich, parseRich, type RichDoc } from "../../domain/rich-text";
  import TextWords from "../TextWords.svelte";
  import GradientEditor from "./GradientEditor.svelte";
  import { encodeFill, sanitizeFill } from "../../domain/fill";

  // Properties of the selected element on a deck page. Every change is one history step.
  let { page, layer, oncommit }: { page: Composition; layer: CompositionLayer; oncommit: (page: Composition) => void } = $props();

  const payload = $derived(layer.source.payload);
  const setPayload = (patch: Record<string, string>) =>
    oncommit(assignLayerSource(page, layer.id, { ...layer.source, payload: { ...layer.source.payload, ...patch } }));
  /** The box's words: plain, or formatted (kept as JSON beside the plain words). */
  const setText = (body: string, rich: RichDoc | null) => {
    const { mode: _mode, rich: _rich, ...rest } = layer.source.payload;
    oncommit(assignLayerSource(page, layer.id, { ...layer.source, payload: { ...rest, body, ...(rich ? { mode: "rich", rich: encodeRich(rich) } : {}) } }));
  };
  const bound = (key: "x" | "y" | "w" | "h", raw: string) => {
    const value = Number(raw);
    if (Number.isFinite(value)) oncommit(resizeLayer(page, layer.id, { ...layer.bounds, [key]: value }));
  };
  const images = $derived(session.media.filter((asset) => asset.kind === "image"));
</script>

{#snippet shadowPicker()}
  <label class="field-row">
    <span>{t("Shadow")}</span>
    <select class="field" aria-label={t("Shadow")} value={payload.shadow ?? "none"} onchange={(event) => setPayload({ shadow: event.currentTarget.value })}>
      <option value="none">{t("None")}</option>
      <option value="soft">{t("Soft")}</option>
      <option value="strong">{t("Strong")}</option>
    </select>
  </label>
{/snippet}

<div class="inspector">
  <label class="field-row">
    <span>{t("Name")}</span>
    <input class="field" aria-label={t("Element name")} value={layer.name} onchange={(event) => oncommit(renameLayer(page, layer.id, event.currentTarget.value))} />
  </label>

  {#if layer.source.type === "text"}
    <div class="stack">
      <span>{t("Text")}</span>
      <TextWords
        heading={payload.heading ?? ""}
        body={payload.body ?? ""}
        rich={payload.mode === "rich" ? parseRich(payload.rich) : null}
        headingMode="none"
        bodyLabel={msg("Element text")}
        onchange={(words) => setText(words.body, words.rich)}
      />
    </div>
    <TextStyleEditor style={parseTextStyle(payload.style)} onchange={(style) => oncommit(setLayerStyle(page, layer.id, style))} />
  {:else if layer.source.type === "shape"}
    <div class="stack">
      <span>{t("Fill")}</span>
      <GradientEditor label={t("Shape fill")} fill={sanitizeFill(payload.fill)} onchange={(fill) => setPayload({ fill: encodeFill(fill) })} />
    </div>
    {#if payload.kind !== "line"}
      <div class="field-row">
        <span>{t("Outline")}</span>
        <span class="inline">
          <input type="color" aria-label={t("Outline colour")} value={payload.stroke ?? "#ffffff"} oninput={(event) => setPayload({ stroke: event.currentTarget.value, strokeWidth: payload.strokeWidth && Number(payload.strokeWidth) > 0 ? payload.strokeWidth : "4" })} />
          <input class="field" type="range" min="0" max="24" aria-label={t("Outline width")} value={Number(payload.strokeWidth ?? 0)} onchange={(event) => setPayload({ strokeWidth: event.currentTarget.value, stroke: payload.stroke ?? "#ffffff" })} />
        </span>
      </div>
    {/if}
    {@render shadowPicker()}
    {#if payload.kind === "rect"}
      <label class="field-row">
        <span>{t("Corners")}</span>
        <input class="field" type="range" min="0" max="50" aria-label={t("Corner radius")} value={Number(payload.radius ?? 0)} onchange={(event) => setPayload({ radius: event.currentTarget.value })} />
      </label>
    {/if}
  {:else if layer.source.type === "icon"}
    <div class="field-row">
      <span>{t("Colour")}</span>
      <input type="color" aria-label={t("Icon colour")} value={payload.color ?? "#ffffff"} oninput={(event) => setPayload({ color: event.currentTarget.value })} />
    </div>
    <label class="field-row">
      <span>{t("Line weight")}</span>
      <input class="field" type="range" min="0.5" max="4" step="0.25" aria-label={t("Icon line weight")} value={Number(payload.strokeWidth ?? 2)} onchange={(event) => setPayload({ strokeWidth: event.currentTarget.value })} />
    </label>
    {@render shadowPicker()}
  {:else if layer.source.type === "image"}
    <div class="stack">
      <span>{t("Picture")}</span>
      {#if images.length === 0}
        <p class="note">{t("Import pictures in Media first.")}</p>
      {:else}
        <div class="pick" role="listbox" aria-label={t("Pictures")}>
          {#each images as asset (asset.id)}
            <button
              type="button"
              role="option"
              aria-selected={payload.assetId === asset.id}
              class:on={payload.assetId === asset.id}
              onclick={() => oncommit(assignLayerSource(page, layer.id, sourceRef("image", asset.id, asset.name, { assetId: asset.id, imageUrl: mediaUrl(asset) ?? "" })))}
            >{asset.name}</button>
          {/each}
        </div>
      {/if}
    </div>
    <label class="field-row">
      <span>{t("Fit")}</span>
      <select class="field" aria-label={t("Picture fit")} value={layer.fit} onchange={(event) => oncommit(setLayerFit(page, layer.id, event.currentTarget.value as LayerFit))}>
        <option value="contain">{t("Fit inside")}</option>
        <option value="cover">{t("Fill and crop")}</option>
        <option value="fill">{t("Stretch")}</option>
      </select>
    </label>
  {:else if layer.source.type === "qr"}
    <label class="stack">
      <span>{t("Link")}</span>
      <input class="field" aria-label={t("QR link")} value={payload.data ?? ""} onchange={(event) => setPayload({ data: event.currentTarget.value })} />
    </label>
    <label class="field-row">
      <span>{t("Pattern")}</span>
      <select class="field" aria-label={t("QR pattern")} value={payload.pattern ?? "rounded"} onchange={(event) => setPayload({ pattern: event.currentTarget.value })}>
        <option value="rounded">{t("Rounded")}</option>
        <option value="dots">{t("Dots")}</option>
        <option value="square">{t("Square")}</option>
      </select>
    </label>
    <div class="field-row">
      <span>{t("Colors")}</span>
      <span class="inline">
        <input type="color" aria-label={t("QR code color")} value={payload.dark ?? "#000000"} oninput={(event) => setPayload({ dark: event.currentTarget.value })} />
        <input type="color" aria-label={t("QR background color")} value={payload.light ?? "#ffffff"} oninput={(event) => setPayload({ light: event.currentTarget.value })} />
      </span>
    </div>
    <label class="stack">
      <span>{t("Caption")}</span>
      <input class="field" aria-label={t("QR caption")} value={payload.caption ?? ""} onchange={(event) => setPayload({ caption: event.currentTarget.value })} />
    </label>
  {/if}

  <h4>{t("Position and size (% of the page)")}</h4>
  <div class="grid4">
    {#each [["x", "X"], ["y", "Y"], ["w", "W"], ["h", "H"]] as [key, label] (key)}
      <label><span>{label}</span><input class="field" type="number" step="0.5" aria-label={t("Element {label}", { label })} value={Math.round(layer.bounds[key as "x"] * 10) / 10} onchange={(event) => bound(key as "x", event.currentTarget.value)} /></label>
    {/each}
  </div>
  <label class="field-row">
    <span>{t("Opacity")}</span>
    <input type="range" min="0" max="1" step="0.05" aria-label={t("Element opacity")} value={layer.opacity} onchange={(event) => oncommit(setLayerOpacity(page, layer.id, Number(event.currentTarget.value)))} />
  </label>
  <div class="actions">
    <button type="button" onclick={() => oncommit(reorderLayers(page, layer.id, 1))}>{t("Bring forward")}</button>
    <button type="button" onclick={() => oncommit(reorderLayers(page, layer.id, -1))}>{t("Send backward")}</button>
    <button type="button" aria-pressed={layer.locked} onclick={() => oncommit(setLayerLocked(page, layer.id, !layer.locked))}>{layer.locked ? t("Unlock") : t("Lock")}</button>
    <button type="button" class="danger" onclick={() => oncommit(removeLayer(page, layer.id))}>{t("Delete")}</button>
  </div>
</div>

<style>
  .inspector { display: flex; flex-direction: column; gap: 10px; }
  .field-row { display: grid; grid-template-columns: 70px minmax(0, 1fr); align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
  .stack { display: flex; flex-direction: column; gap: 4px; color: var(--muted); font-size: 12px; }
  .field { height: 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--field); color: var(--ink); padding: 0 8px; font: inherit; font-size: 13px; min-width: 0; }
  .inline { display: flex; gap: 6px; }
  input[type="color"] { width: 40px; height: 30px; border: 1px solid var(--line); border-radius: 6px; background: none; padding: 0; }
  h4 { margin: 6px 0 0; font-size: 12px; letter-spacing: 0; color: var(--muted); }
  .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .grid4 label { display: flex; flex-direction: column; gap: 2px; color: var(--muted); font-size: 11px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .actions button, .pick button { min-height: 30px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; font-size: 12px; }
  .actions .danger { color: #ff8a8a; }
  .pick { display: flex; flex-direction: column; gap: 2px; max-height: 160px; overflow: auto; }
  .pick button { text-align: left; }
  .pick button.on { border-color: var(--accent); }
  .note { margin: 0; color: var(--muted); font-size: 12px; }
</style>
