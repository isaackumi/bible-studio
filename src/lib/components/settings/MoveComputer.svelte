<script lang="ts">
  import { session } from "../../app/session.svelte";
  import { formatBytes, movedAt, moveFileName, MOVE_EXTENSION } from "../../app/move";
  import { t } from "../../i18n/core";
  import { isDesktop } from "../../platform/runtime";

  // Moving to a new computer: one file with everything (src/lib/app/move.ts). In Settings it saves
  // and opens; on the first-run screen (`compact`) it only opens, then `ondone` finishes setup.

  let { compact = false, ondone }: { compact?: boolean; ondone?: (message: string) => void } = $props();

  type Peek = { path: string; createdAt: string; computer: string; media: number; bytes: number };
  let peek = $state<Peek | null>(null);
  let note = $state("");
  let error = $state(false);
  let busy = $state<"" | "save" | "open">("");

  const FILTER = [{ name: "Church Studio", extensions: [MOVE_EXTENSION] }];
  const progress = $derived(session.moveProgress);
  const percent = $derived(progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0);

  const say = (message: string, failed = false) => {
    note = message;
    error = failed;
  };
  const failure = (reason: unknown) => say(reason instanceof Error ? reason.message : String(reason), true);

  async function save() {
    const { save: choose } = await import("@tauri-apps/plugin-dialog");
    const dest = await choose({ defaultPath: moveFileName(session.workspace.churchName), filters: FILTER });
    if (!dest) return;
    busy = "save";
    say("");
    await session.saveMoveFile(dest).then((message) => say(message), failure);
    busy = "";
  }

  async function choose() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: FILTER });
    if (typeof path !== "string") return;
    say("");
    await session.peekMoveFile(path).then((found) => (peek = { path, ...found }), failure);
  }

  async function bringIn() {
    if (!peek) return;
    const path = peek.path;
    peek = null;
    busy = "open";
    await session.openMoveFile(path).then(
      (message) => {
        say(message);
        ondone?.(message);
      },
      failure,
    );
    busy = "";
  }
</script>

{#if isDesktop()}
  {#if compact && !peek && !busy}
    <button type="button" class="move-link" onclick={() => void choose()}>{t("Moving from another computer? Bring everything across")}</button>
    {#if note}<p class="move-note" class:bad={error} role="status">{note}</p>{/if}
  {:else}
    {#if !compact}<p class="section-label">{t("Move to a new computer")}</p>{/if}
    <section class="rows" class:compact>
      {#if peek}
        <div class="row">
          <div class="row-copy">
            <strong>{t("From {computer}, saved {date}", { computer: peek.computer || t("another computer"), date: movedAt(peek.createdAt).toLocaleDateString() })}</strong>
            <span>{t("{files} media files, {size}. Everything here stays; this adds to it.", { files: peek.media, size: formatBytes(peek.bytes) })}</span>
          </div>
          <div class="row-end">
            <button type="button" class="btn primary" onclick={() => void bringIn()}>{t("Bring it in")}</button>
            <button type="button" class="btn" onclick={() => (peek = null)}>{t("Cancel")}</button>
          </div>
        </div>
      {:else if busy}
        <div class="row">
          <div class="row-copy">
            <strong>{busy === "save" ? t("Saving… {done} of {total}", { done: formatBytes(progress?.done ?? 0), total: formatBytes(progress?.total ?? 0) }) : t("Bringing it in… {n}%", { n: percent })}</strong>
            <span class="move-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><i style:width="{percent}%"></i></span>
          </div>
        </div>
      {:else}
        <div class="row">
          <div class="row-copy">
            <strong>{t("One file with everything")}</strong>
            <span class:bad={error}>{note || t("Songs, services, sermons, slides, designs, games, pictures, videos and music. Carry it on a USB stick or a cloud drive. Screens, sound and passwords stay on each computer.")}</span>
          </div>
          <div class="row-end">
            <button type="button" class="btn primary" onclick={() => void save()}>{t("Save the file…")}</button>
            <button type="button" class="btn" onclick={() => void choose()}>{t("Open a file…")}</button>
          </div>
        </div>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .move-bar { display: block; height: 6px; margin-top: 8px; border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); overflow: hidden; }
  .move-bar i { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 0.2s ease; }
  .bad { color: var(--danger, #ff6b6b); }
  .move-link { margin-top: 14px; padding: 0; border: 0; background: none; color: inherit; opacity: 0.75; font: inherit; font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .move-link:hover { opacity: 1; }
  .move-note { margin: 8px 0 0; font-size: 13px; }
  /* On the first-run screen, outside Settings: the same rows, drawn here. */
  .compact { margin-top: 14px; padding: 12px 14px; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 12px; }
  .compact .row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .compact .row-copy { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 200px; font-size: 13px; }
  .compact .row-copy span { opacity: 0.75; }
  .compact .row-end { display: flex; gap: 8px; }
</style>
