<script lang="ts" module>
  export type PickItem = {
    key: string;
    name: string;
    /** A second line: kind, language, where it came from. */
    detail?: string;
    /** Size on disk, when it matters (summed for what is ticked). */
    bytes?: number;
    /** A picture to recognise it by. */
    thumb?: string | null;
    /** Shown when there is no picture (or it fails to load). */
    icon?: string;
    /** A short word beside the name ("leftover", "logo"). */
    tag?: string;
    /** Short text in a badge in place of a picture ("KJV"). */
    badge?: string;
    /** Shown for the record but cannot be ticked (a file that is in use). */
    locked?: boolean;
  };
  export type PickFilter = { id: string; label: string; match: (item: PickItem) => boolean };
</script>

<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import DeskDialog from "./sources/DeskDialog.svelte";
  import Icon from "./Icon.svelte";
  import { t, tn } from "../i18n/core";

  // A long list to look through and tick: search, filters, sort, tick all or none, and one action
  // for what is ticked. Opens over whatever it came from, so a page never grows to hold a list.
  let {
    title,
    intro = "",
    items,
    picked: initial = [],
    filters = [],
    action,
    row,
    empty = "",
    onclose,
  }: {
    title: string;
    intro?: string;
    items: PickItem[];
    /** Keys ticked when it opens. */
    picked?: string[];
    filters?: PickFilter[];
    action: {
      /** The button's words for what is ticked. */
      label: (count: number, bytes: number) => string;
      /** A destructive action asks once more before it runs. */
      danger?: boolean;
      /** Lets the button run with nothing ticked (e.g. "use none"). */
      allowNone?: boolean;
      run: (keys: string[]) => Promise<void> | void;
    };
    /** Extra buttons on a row (e.g. "Use as logo"). */
    row?: Snippet<[PickItem]>;
    empty?: string;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let filter = $state("all");
  const hasBytes = $derived(items.some((item) => typeof item.bytes === "number"));
  let sort = $state<"size" | "name">("name");
  // Ticks start from what the caller passes, then belong to the list until it closes.
  let picked = $state(new Set<string>(untrack(() => initial)));
  let confirming = $state(false);
  let busy = $state(false);
  let error = $state("");
  let search = $state<HTMLInputElement | undefined>();
  let list = $state<HTMLUListElement | undefined>();
  let broken = $state(new Set<string>());

  // Sizes are what people clear space by, so a list with sizes starts largest first.
  $effect.pre(() => {
    if (hasBytes) sort = "size";
  });

  const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const counts = $derived(Object.fromEntries(filters.map((entry) => [entry.id, items.filter(entry.match).length])));
  const shown = $derived.by(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const only = filters.find((entry) => entry.id === filter);
    const found = items.filter((item) => {
      if (only && !only.match(item)) return false;
      const text = `${item.name} ${item.detail ?? ""} ${item.tag ?? ""} ${item.badge ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return found.sort((a, b) => (sort === "size" ? (b.bytes ?? 0) - (a.bytes ?? 0) : 0) || byName.compare(a.name, b.name));
  });
  const totalBytes = $derived(items.reduce((sum, item) => sum + (item.bytes ?? 0), 0));
  const pickedItems = $derived(items.filter((item) => picked.has(item.key)));
  const pickedBytes = $derived(pickedItems.reduce((sum, item) => sum + (item.bytes ?? 0), 0));
  const shownPicked = $derived(shown.filter((item) => picked.has(item.key)).length);
  const shownFree = $derived(shown.filter((item) => !item.locked).length);
  const allShown = $derived(shownFree > 0 && shownPicked === shownFree);

  function set(next: Set<string>) {
    picked = next;
    confirming = false;
    error = "";
  }

  function toggle(key: string) {
    if (items.find((item) => item.key === key)?.locked) return;
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set(next);
  }

  /** Tick or untick everything the search and filter show (what is hidden is left as it is). */
  function toggleShown() {
    const next = new Set(picked);
    for (const item of shown) {
      if (item.locked) continue;
      if (allShown) next.delete(item.key);
      else next.add(item.key);
    }
    set(next);
  }

  async function run() {
    if (!pickedItems.length && !action.allowNone) return;
    if (action.danger && !confirming) {
      confirming = true;
      return;
    }
    busy = true;
    error = "";
    try {
      await action.run(pickedItems.map((item) => item.key));
      onclose();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      confirming = false;
    }
  }

  /** Arrows move between rows, Space ticks, ⌘A ticks all shown, / goes to the search. */
  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && target !== search) {
      event.preventDefault();
      toggleShown();
      return;
    }
    if (event.key === "/" && target !== search) {
      event.preventDefault();
      search?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = [...(list?.querySelectorAll<HTMLInputElement>("input.tick") ?? [])];
    if (!rows.length) return;
    event.preventDefault();
    const at = rows.indexOf(target as HTMLInputElement);
    const next = event.key === "ArrowDown" ? (at < 0 ? 0 : Math.min(rows.length - 1, at + 1)) : at <= 0 ? (target === search ? -1 : 0) : at - 1;
    if (next < 0) return;
    rows[next]!.focus();
    rows[next]!.closest("li")?.scrollIntoView({ block: "nearest" });
  }

  const size = (bytes: number) => (bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : bytes >= 1_000_000 ? `${Math.round(bytes / 1_000_000)} MB` : bytes >= 1000 ? `${Math.round(bytes / 1000)} KB` : `${bytes} B`);
</script>

<DeskDialog {title} {onclose} list>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pick" {onkeydown}>
    <div class="top">
      {#if intro}<p class="intro">{intro}</p>{/if}
      {#if hasBytes && totalBytes}
        <!-- How much of the whole is ticked: the space this will free. -->
        <div class="meter" role="img" aria-label={t("{picked} of {total} ticked", { picked: size(pickedBytes), total: size(totalBytes) })}>
          <div class="meter-bar"><i style:width="{Math.max(pickedBytes ? 1.5 : 0, (pickedBytes / totalBytes) * 100)}%"></i></div>
          <span><b>{size(pickedBytes)}</b> {t("of {total} ticked", { total: size(totalBytes) })}</span>
        </div>
      {/if}
      <div class="tools">
        <label class="find">
          <Icon name="search" size={14} />
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:this={search} type="search" autofocus placeholder={t("Search {count}", { count: items.length })} aria-label={t("Search")} bind:value={query} />
          {#if query}<button type="button" class="clear" aria-label={t("Clear search")} onclick={() => { query = ""; search?.focus(); }}><Icon name="close" size={12} /></button>{:else}<kbd aria-hidden="true">/</kbd>{/if}
        </label>
        {#if hasBytes}
          <div class="seg" role="radiogroup" aria-label={t("Sort")}>
            <button type="button" role="radio" aria-checked={sort === "size"} class:on={sort === "size"} onclick={() => (sort = "size")}>{t("Largest")}</button>
            <button type="button" role="radio" aria-checked={sort === "name"} class:on={sort === "name"} onclick={() => (sort = "name")}>{t("A–Z")}</button>
          </div>
        {/if}
      </div>
      {#if filters.some((entry) => counts[entry.id] && counts[entry.id] < items.length)}
        <div class="chips" role="radiogroup" aria-label={t("Show")}>
          <button type="button" role="radio" aria-checked={filter === "all"} class:on={filter === "all"} onclick={() => (filter = "all")}>{t("All")} <small>{items.length}</small></button>
          {#each filters.filter((entry) => counts[entry.id] && counts[entry.id] < items.length) as entry (entry.id)}
            <button type="button" role="radio" aria-checked={filter === entry.id} class:on={filter === entry.id} onclick={() => (filter = entry.id)}>{entry.label} <small>{counts[entry.id]}</small></button>
          {/each}
        </div>
      {/if}
      <div class="head">
        <label class="all">
          <input type="checkbox" checked={allShown} indeterminate={shownPicked > 0 && !allShown} disabled={!shownFree} onchange={toggleShown} />
          <span>{allShown ? t("Untick all shown") : t("Tick all shown")}</span>
        </label>
        <span class="count" aria-live="polite">{tn(pickedItems.length, "{n} ticked", "{n} ticked")} · {tn(shown.length, "{n} shown", "{n} shown")}</span>
      </div>
    </div>

    {#if shown.length}
      <ul class="rows" bind:this={list} aria-label={title}>
        {#each shown as item (item.key)}
          {@const on = picked.has(item.key)}
          <li class:on class:locked={item.locked}>
            <label>
              <input class="tick" type="checkbox" checked={on} disabled={item.locked} onchange={() => toggle(item.key)} />
              <span class="thumb" aria-hidden="true">
                {#if item.thumb && !broken.has(item.key)}
                  <img src={item.thumb} alt="" loading="lazy" decoding="async" onerror={() => (broken = new Set(broken).add(item.key))} />
                {:else if item.badge}
                  <b>{item.badge}</b>
                {:else}
                  <Icon name={item.icon ?? "files"} size={18} />
                {/if}
              </span>
              <span class="copy">
                <strong>{item.name}{#if item.tag}<em>{item.tag}</em>{/if}</strong>
                {#if item.detail}<span>{item.detail}</span>{/if}
              </span>
              {#if typeof item.bytes === "number"}<span class="bytes">{size(item.bytes)}</span>{/if}
            </label>
            {#if row}<div class="row-end">{@render row(item)}</div>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <div class="none">
        <Icon name="search" size={22} />
        <p>{items.length ? t("Nothing matches “{query}”.", { query: query.trim() || filters.find((entry) => entry.id === filter)?.label || "" }) : empty}</p>
        {#if query}<button type="button" class="btn" onclick={() => (query = "")}>{t("Clear search")}</button>{/if}
      </div>
    {/if}

    <footer class="foot">
      <span class="hint">{error || t("↑ ↓ move · Space ticks · ⌘A ticks all shown")}</span>
      <button type="button" class="btn" onclick={onclose}>{t("Cancel")}</button>
      <button type="button" class="btn primary" class:danger={action.danger} class:armed={confirming} disabled={busy || (!pickedItems.length && !action.allowNone)} onclick={() => void run()}>
        {#if action.danger}<Icon name="trash" size={14} />{/if}
        {busy ? t("Working…") : confirming ? t("Sure? Click again") : action.label(pickedItems.length, pickedBytes)}
      </button>
    </footer>
  </div>
</DeskDialog>

<style>
  .pick { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .top { display: grid; gap: 12px; padding: 14px 16px 10px; border-bottom: 1px solid var(--line); background: var(--panel); }
  .intro { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.5; }
  .meter { display: grid; gap: 6px; }
  .meter-bar { height: 8px; border-radius: 99px; background: var(--field); overflow: hidden; }
  .meter-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #ffd166)); transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  .meter span { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .meter b { color: var(--ink); font-size: 15px; font-weight: 750; }
  .tools { display: flex; gap: 8px; align-items: center; }
  .find { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--field); color: var(--muted); }
  .find:focus-within { border-color: var(--accent); color: var(--ink); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
  .find input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 13.5px; outline: none; }
  .find input::-webkit-search-cancel-button { display: none; }
  .find kbd { padding: 0 6px; border: 1px solid var(--line); border-radius: 4px; font: inherit; font-size: 11px; }
  .clear { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 6px; background: var(--panel); color: var(--muted); cursor: pointer; }
  .seg { flex: none; display: inline-flex; padding: 3px; border-radius: 10px; background: var(--field); }
  .seg button { height: 30px; padding: 0 12px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border: 1px solid var(--line); border-radius: 99px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .chips button small { font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums; }
  .chips button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .all { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 650; cursor: pointer; }
  .count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; flex: none; }

  .rows { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 6px 8px; list-style: none; }
  .rows li { display: flex; align-items: center; gap: 8px; padding-right: 8px; border-radius: 10px; content-visibility: auto; contain-intrinsic-size: auto 60px; }
  .rows li:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .rows li.on { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .rows li.on:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .rows label { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 8px; cursor: pointer; }
  .tick:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .thumb { flex: none; width: 64px; height: 44px; display: grid; place-items: center; border-radius: 8px; background: #000; color: var(--muted); overflow: hidden; border: 1px solid var(--line); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb b { font-size: 12px; font-weight: 800; letter-spacing: 0.02em; color: var(--ink); }
  .copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .copy strong { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .copy em { flex: none; padding: 1px 7px; border-radius: 99px; background: var(--field); color: var(--muted); font-style: normal; font-size: 10.5px; font-weight: 700; }
  .copy span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bytes { flex: none; font-size: 12.5px; font-weight: 650; color: var(--muted); font-variant-numeric: tabular-nums; }
  .on .bytes { color: var(--ink); }
  li.locked label { cursor: default; }
  li.locked .tick { opacity: 0.35; }
  .row-end { flex: none; display: flex; gap: 6px; }
  /* Row buttons come from the caller; they look like the list's own. */
  .row-end :global(button) { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
  .row-end :global(button:hover:not(:disabled)) { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .row-end :global(button:disabled) { border-color: transparent; color: var(--accent); cursor: default; }

  .none { flex: 1; display: grid; place-content: center; justify-items: center; gap: 10px; padding: 32px; color: var(--muted); text-align: center; }
  .none p { margin: 0; max-width: 40ch; line-height: 1.5; }

  .foot { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); background: var(--panel); }
  .hint { flex: 1; min-width: 0; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--field); color: var(--ink); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .btn:disabled { opacity: 0.45; cursor: default; }
  .btn.primary { border-color: transparent; background: var(--accent); color: var(--on-accent, #fff); }
  /* Filled red with white words, also inside Settings (whose own .btn.danger is red words on a plain button). */
  .foot .btn.primary.danger { border-color: transparent; background: #c62f33; color: #fff; }
  .foot .btn.primary.danger.armed { background: #e5484d; box-shadow: 0 0 0 3px color-mix(in srgb, #e5484d 30%, transparent); }
  @media (max-width: 640px) { .hint { display: none; } .foot .btn { flex: 1; justify-content: center; } }
  @media (prefers-reduced-motion: reduce) { .meter-bar i { transition: none; } }
</style>
