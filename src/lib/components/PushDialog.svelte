<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { session } from "../app/session.svelte";
  import { t, tn } from "../i18n/core";
  import { changedSince, markPushed, recordKind, type OfferFile, type OfferItem, type Pushed } from "../sync/offer";
  import { collectRecords } from "../sync/records";
  import DeskDialog from "./sources/DeskDialog.svelte";

  // One computer pushes: what changed since the last push, ticked; untick what should stay here.

  const KEY = "church-studio:pushed";
  const FIRST_PUSH_MS = 7 * 86_400_000;

  let items = $state<OfferItem[]>([]);
  let files = $state<OfferFile[]>([]);
  let peers = $state<Array<{ device: string; name: string }>>([]);
  let off = $state(new Set<string>());
  let loading = $state(true);
  let sending = $state(false);
  const onlyKey = (item: OfferItem) => `${item.col}/${item.id}`;
  const chosen = $derived(items.filter((item) => !off.has(onlyKey(item))));
  const chosenFiles = $derived(files.filter((file) => !off.has(`file/${file.id}`)));
  const count = $derived(chosen.length + chosenFiles.length);

  function readPushed(): Pushed | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "null") as Pushed | null;
    } catch {
      return null;
    }
  }

  function toggle(key: string) {
    const next = new Set(off);
    if (!next.delete(key)) next.add(key);
    off = next;
  }

  onMount(async () => {
    const engine = await session.cloudEngine();
    const pushed = readPushed();
    const since = Date.now() - FIRST_PUSH_MS;
    items = changedSince(collectRecords(await engine.library.collect()), pushed, since);
    files = [...session.media, ...session.audioTracks]
      .filter((asset) => (pushed ? !pushed[`file/${asset.id}`] : Date.parse(asset.createdAt) >= since))
      .map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind }));
    peers = await session.nearbyComputers();
    loading = false;
  });

  async function send() {
    sending = true;
    const body = JSON.stringify({ id: crypto.randomUUID(), from: session.cloudIdentity().name, at: Date.now(), items: chosen, files: chosenFiles });
    const results = await invoke<Array<{ name: string; sent: boolean }>>("nearby_offer_send", { body }).catch((error: unknown) => {
      session.notify(t("Could not send."), { detail: String(error), tone: "warn" });
      return null;
    });
    sending = false;
    if (!results) return;
    const reached = results.filter((result) => result.sent).map((result) => result.name);
    const missed = results.filter((result) => !result.sent).map((result) => result.name);
    // Sent only once every computer has it, so one that was asleep is offered it on the next send.
    if (reached.length && !missed.length) {
      try {
        const marked = markPushed(readPushed(), chosen);
        for (const file of chosenFiles) marked[`file/${file.id}`] = "sent";
        localStorage.setItem(KEY, JSON.stringify(marked));
      } catch {
        // Storage full or blocked: the same items are offered again next time.
      }
    }
    session.notify(reached.length ? t("Sent to {names}", { names: reached.join(", ") }) : t("No computer took it."), {
      detail: missed.length ? t("Not reached: {names}. Keep them open and on this network, then send again.", { names: missed.join(", ") }) : t("It waits there until someone accepts it."),
      tone: missed.length ? "warn" : undefined,
      ms: missed.length ? 15_000 : 6000,
    });
    if (reached.length) session.pushing = false;
  }
</script>

<DeskDialog title={t("Send to computers on this network")} onclose={() => (session.pushing = false)} list>
  {#if loading}
    <p class="note">{t("Checking…")}</p>
  {:else}
    <p class="note">
      {peers.length ? t("Sending to {names}", { names: peers.map((peer) => peer.name).join(", ") }) : t("No other computer found on this network. Open Church Studio on it, and check it is on the same license and network.")}
    </p>
    {#if !items.length && !files.length}<p class="note">{t("Nothing has changed since the last send.")}</p>{/if}
    {#each items as item (onlyKey(item))}
      <label class="pick"><input type="checkbox" checked={!off.has(onlyKey(item))} onchange={() => toggle(onlyKey(item))} /><span>{item.name}</span><small>{t(recordKind(item.col))}</small></label>
    {/each}
    {#each files as file (file.id)}
      <label class="pick"><input type="checkbox" checked={!off.has(`file/${file.id}`)} onchange={() => toggle(`file/${file.id}`)} /><span>{file.name}</span><small>{t(recordKind(file.kind))}</small></label>
    {/each}
  {/if}
  {#snippet footer()}
    <button type="button" class="desk-btn" onclick={() => (session.pushing = false)}>{t("Cancel")}</button>
    <button type="button" class="desk-btn primary-soft" disabled={!count || !peers.length || sending} onclick={send}>{tn(count, "Send {n} item", "Send {n} items")}</button>
  {/snippet}
</DeskDialog>

<style>
  .note { margin: 12px 16px 6px; font-size: 12.5px; color: var(--muted); }
  .pick { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-top: 1px solid var(--line); font-size: 13px; }
  .pick span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick small { flex: none; color: var(--muted); font-size: 11px; }
</style>
