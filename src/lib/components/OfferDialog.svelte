<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../app/session.svelte";
  import { msg, t, tn } from "../i18n/core";
  import { acceptOffer, arrival, recordKind, type Arrival, type Offer } from "../sync/offer";
  import { collectRecords } from "../sync/records";
  import DeskDialog from "./sources/DeskDialog.svelte";

  // The other computers' side of a push: look through it, untick what is not wanted, accept the rest.
  let { offer }: { offer: Offer } = $props();

  let local = $state<Map<string, unknown> | null>(null);
  let off = $state(new Set<string>());
  let busy = $state(false);
  const keys = $derived([...offer.items.map((item) => `${item.col}/${item.id}`), ...offer.files.map((file) => `file/${file.id}`)]);
  const count = $derived(keys.filter((key) => !off.has(key)).length);
  const close = () => (session.reviewing = null);

  onMount(async () => {
    const engine = await session.cloudEngine();
    local = new Map(collectRecords(await engine.library.collect()).map((record) => [`${record.col}/${record.id}`, record.doc]));
  });

  function toggle(key: string) {
    const next = new Set(off);
    if (!next.delete(key)) next.add(key);
    off = next;
  }

  const words: Record<Arrival, string> = { new: msg("New"), same: msg("Already here"), different: msg("Kept beside yours") };

  async function accept() {
    if (!local) return;
    busy = true;
    const engine = await session.cloudEngine();
    const here = await engine.library.media();
    const fetch = async (id: string) => (await engine.commands.nearby?.(id)) ?? false;
    const done = await acceptOffer(offer, new Set(keys.filter((key) => !off.has(key))), local, { apply: engine.library.apply, have: (id) => here.has(id), fetch });
    await session.answerOffer(offer.id);
    busy = false;
    engine.scheduleSoon();
    session.notify(tn(done.added + done.kept + done.files, "{n} item added from {name}", "{n} items added from {name}", { name: offer.from }), {
      detail: done.missing ? tn(done.missing, "{n} file could not be fetched. Keep the other computer open, then ask for it again.", "{n} files could not be fetched. Keep the other computer open, then ask for them again.") : undefined,
      tone: done.missing ? "warn" : undefined,
    });
  }
</script>

<DeskDialog title={t("From {name}", { name: offer.from })} onclose={close} list>
  {#each offer.items as item (`${item.col}/${item.id}`)}
    {@const key = `${item.col}/${item.id}`}
    <label class="pick"><input type="checkbox" checked={!off.has(key)} onchange={() => toggle(key)} /><span>{item.name}</span><small>{local ? t(words[arrival(item, local)]) : ""}</small></label>
  {/each}
  {#each offer.files as file (file.id)}
    <label class="pick"><input type="checkbox" checked={!off.has(`file/${file.id}`)} onchange={() => toggle(`file/${file.id}`)} /><span>{file.name}</span><small>{t(recordKind(file.kind))}</small></label>
  {/each}
  {#snippet footer()}
    <button type="button" class="desk-btn" disabled={busy} onclick={() => void session.answerOffer(offer.id)}>{t("Decline")}</button>
    <button type="button" class="desk-btn primary-soft" disabled={!count || busy || !local} onclick={accept}>{tn(count, "Accept {n} item", "Accept {n} items")}</button>
  {/snippet}
</DeskDialog>

<style>
  .pick { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .pick span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick small { flex: none; color: var(--muted); font-size: 11px; }
</style>
