<script lang="ts">
  import { onMount, untrack } from "svelte";
  import Icon from "../Icon.svelte";
  import { t } from "../../i18n/core";
  import { keys } from "../../platform/os";
  import { clearRecent, highlight, readRecent, rememberRecent, searchSettings, type SettingEntry, type SettingHit, type SettingsPage } from "../../settings/search";

  // Search everything in Settings (⌘F, or the field in the sidebar): every page, card and row.
  // Empty, it offers what this computer searched and opened lately.

  type Page = SettingsPage & { icon: string; color: string };
  let { pages, initial = "", onpick, onclose }: { pages: Page[]; initial?: string; onpick: (entry: SettingEntry) => void; onclose: () => void } = $props();

  // The letters typed in the sidebar field before this opened.
  let query = $state(untrack(() => initial));
  let active = $state(0);
  let input = $state<HTMLInputElement | undefined>();
  let list = $state<HTMLDivElement | undefined>();
  let index = $state<SettingEntry[]>([]);
  let recent = $state(readRecent());

  onMount(() => {
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(query.length, query.length);
    });
    // The index reads the Settings markup; it loads with the search, not with the desk.
    void import("../../settings/index").then((module) => (index = module.settingsIndex()));
  });

  const pageById = $derived(new Map(pages.map((page) => [page.id, page])));
  const pageEntry = (page: Page): SettingEntry => ({ id: `${page.id}:`, section: page.id, kind: "page", title: page.title, about: page.about, context: "", words: page.keywords });

  /** Results, together by page (the page with the best match first), at most eight per page. */
  const results = $derived.by((): SettingHit[] => {
    const hits = searchSettings(index, pages, query, t, 60);
    const groups = new Map<string, SettingHit[]>();
    for (const hit of hits) {
      const members = groups.get(hit.section) ?? [];
      if (members.length < 8) members.push(hit);
      groups.set(hit.section, members);
    }
    return [...groups.values()].flat().slice(0, 40);
  });

  /** Opened lately, newest first; a row that was removed since is left out. */
  const recentPicks = $derived.by((): SettingEntry[] => {
    const known = new Map([...pages.map((page) => [`${page.id}:`, pageEntry(page)] as const), ...index.map((entry) => [entry.id, entry] as const)]);
    return recent.picks.flatMap((id) => {
      const entry = known.get(id);
      return entry && pageById.has(entry.section) ? [entry] : [];
    });
  });

  const shown = $derived<SettingEntry[]>(query.trim() ? results : recentPicks.length ? recentPicks : pages.map(pageEntry));

  $effect(() => {
    void shown;
    active = 0;
  });

  function choose(entry: SettingEntry | undefined) {
    if (!entry) return;
    recent = rememberRecent(entry.id, query);
    onpick(entry);
  }

  function onKey(event: KeyboardEvent) {
    // Keys here belong to the search, never to Settings or the desk behind it.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) query = "";
      else onclose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      requestAnimationFrame(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      choose(shown[active]);
    } else if (event.key === "Tab") {
      // Focus stays in the field; Tab moves through the results like the arrows.
      event.preventDefault();
      event.stopPropagation();
      active = (active + (event.shiftKey ? -1 : 1) + shown.length) % Math.max(1, shown.length);
      requestAnimationFrame(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
    }
  }

  /** The line under a result: where it sits and what it does. */
  function detail(entry: SettingEntry): string {
    const page = pageById.get(entry.section);
    const place = [entry.kind === "page" ? "" : page ? t(page.title) : "", entry.context ? t(entry.context) : ""].filter(Boolean).join(" › ");
    const about = entry.about ? t(entry.about) : "";
    return [place, about].filter(Boolean).join(" — ");
  }

  const KIND_ICON: Record<SettingEntry["kind"], string> = { page: "", card: "layout", group: "list", row: "settings" };
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="layer">
  <button type="button" class="backdrop" aria-label={t("Close")} tabindex="-1" onclick={onclose}></button>
  <div class="palette" role="dialog" aria-modal="true" aria-label={t("Search settings")}>
    <label class="find focus-box">
      <Icon name="search" size={16} />
      <input
        bind:this={input}
        bind:value={query}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="settings-search-list"
        aria-activedescendant={shown[active] ? `ss-${active}` : undefined}
        autocomplete="off"
        spellcheck="false"
        placeholder={t("Search every setting: microphone, theme, stream key…")}
      />
      {#if query}<button type="button" class="clear" aria-label={t("Clear the search")} onclick={() => { query = ""; input?.focus(); }}><Icon name="close" size={12} /></button>{/if}
      <kbd>esc</kbd>
    </label>

    {#if !query.trim() && recent.queries.length}
      <div class="recent">
        <span class="recent-label">{t("Recent searches")}</span>
        {#each recent.queries as words (words)}
          <button type="button" class="chip" onclick={() => { query = words; input?.focus(); }}><Icon name="clock" size={11} />{words}</button>
        {/each}
        <button type="button" class="forget" onclick={() => { recent = clearRecent(); input?.focus(); }}>{t("Clear")}</button>
      </div>
    {/if}

    <div class="list" id="settings-search-list" role="listbox" aria-label={t("Search settings")} bind:this={list}>
      {#if !query.trim()}<p class="group">{recentPicks.length ? t("Recently opened") : t("All settings")}</p>{/if}
      {#each shown as entry, position (entry.id)}
        {@const page = pageById.get(entry.section)}
        {#if query.trim() && (position === 0 || shown[position - 1]!.section !== entry.section)}
          <p class="group">{page ? t(page.title) : ""}</p>
        {/if}
        <button type="button" id="ss-{position}" role="option" class="entry" aria-selected={position === active} onmouseenter={() => (active = position)} onclick={() => choose(entry)}>
          {#if entry.kind === "page" || !query.trim()}
            <span class="tile" style:background={page?.color}><Icon name={page?.icon ?? "settings"} size={13} /></span>
          {:else}
            <span class="icon"><Icon name={KIND_ICON[entry.kind]} size={13} /></span>
          {/if}
          <span class="copy">
            <span class="label">{#each highlight(t(entry.title), query) as piece, at (at)}{#if piece.match}<mark>{piece.text}</mark>{:else}{piece.text}{/if}{/each}</span>
            {#if detail(entry)}<span class="detail">{detail(entry)}</span>{/if}
          </span>
          {#if position === active}<kbd class="enter">↵</kbd>{/if}
        </button>
      {:else}
        <div class="none">
          <Icon name="search" size={20} />
          <p>{t("No settings match “{search}”.", { search: query.trim() })}</p>
          <span>{t("Try another word, like microphone, screen, backup or language.")}</span>
        </div>
      {/each}
    </div>
    <p class="foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> {t("to move")}</span>
      <span><kbd>↵</kbd> {t("to open")}</span>
      <span class="hint"><kbd>{keys("⌘F")}</kbd> {t("any time in Settings")}</span>
      {#if query.trim()}<span class="count">{t("{n} found", { n: results.length })}</span>{/if}
    </p>
  </div>
</div>

<style>
  .layer { position: fixed; inset: 0; z-index: 40; display: grid; justify-items: center; align-items: start; padding: max(16px, 10vh) 16px 16px; }
  .backdrop { position: absolute; inset: 0; border: 0; background: rgb(0 0 0 / 0.4); backdrop-filter: blur(2px); cursor: default; }
  .palette { position: relative; width: min(640px, 100%); max-height: calc(100dvh - max(32px, 10vh + 16px)); display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); color: var(--ink); box-shadow: 0 30px 80px rgb(0 0 0 / 0.5); overflow: hidden; animation: pop 0.14s ease-out; }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(0.99); } }
  @media (prefers-reduced-motion: reduce) { .palette { animation: none; } }
  .find { flex: none; display: flex; align-items: center; gap: 10px; height: 54px; padding: 0 16px; border-bottom: 1px solid var(--line); color: var(--muted); }
  .find input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; outline: none; }
  /* Keyboard users see where they are. */
  .find:focus-within { border-color: var(--accent); }
  .clear { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%; background: var(--field); color: var(--muted); cursor: pointer; }
  .clear:hover { color: var(--ink); }
  kbd { padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; font: inherit; font-size: 10.5px; font-weight: 700; color: var(--muted); }
  .recent { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 16px 4px; }
  .recent-label { font-size: 10.5px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-right: 2px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; max-width: 180px; height: 24px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  .chip:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .chip :global(svg) { flex: none; color: var(--muted); }
  .forget { margin-left: auto; border: 0; background: none; color: var(--muted); font: inherit; font-size: 11.5px; cursor: pointer; }
  .forget:hover { color: var(--ink); text-decoration: underline; }
  .list { flex: 1; min-height: 0; max-height: min(58vh, 480px); overflow: auto; padding: 6px; scrollbar-width: thin; }
  .group { margin: 10px 10px 4px; font-size: 10.5px; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .group:first-child { margin-top: 6px; }
  .entry { width: 100%; display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 6px 10px; border: 0; border-radius: 9px; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .entry[aria-selected="true"] { background: color-mix(in srgb, var(--accent) 16%, var(--field)); }
  .icon, .tile { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 7px; }
  .icon { background: var(--field); color: var(--muted); }
  .tile { color: #fff; box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.25); }
  .entry[aria-selected="true"] .icon { color: var(--accent-text); }
  .copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .label { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .label mark { background: none; color: var(--accent-text); font-weight: 750; }
  .detail { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .enter { flex: none; }
  .none { display: grid; justify-items: center; gap: 6px; padding: 28px 16px 32px; text-align: center; color: var(--muted); }
  .none p { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .none span { font-size: 12px; }
  .foot { flex: none; margin: 0; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11px; color: var(--muted); display: flex; align-items: center; flex-wrap: wrap; gap: 4px 14px; }
  .foot span { display: inline-flex; align-items: center; gap: 4px; }
  .count { margin-left: auto; }
  @media (max-width: 520px) {
    .hint { display: none !important; }
    .find input { font-size: 15px; }
  }
</style>
