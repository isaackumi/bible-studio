<script lang="ts">
  let { name, size = 18 }: { name: string; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === "outputs" || name === "display"}
    <rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path>
  {:else if name === "themes" || name === "look"}
    <circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 0 0 16"></path><circle cx="8" cy="10" r="1"></circle><circle cx="12" cy="8" r="1"></circle><circle cx="15" cy="12" r="1"></circle>
  {:else if name === "studio" || name === "layout"}
    <rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
  {:else if name === "alerts"}
    <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15z"></path><path d="M10 19a2 2 0 0 0 4 0"></path>
  {:else if name === "help"}
    <circle cx="12" cy="12" r="8"></circle><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.8-1.2 1.6V14"></path><path d="M12 17h.01"></path>
  {:else if name === "settings"}
    <circle cx="12" cy="12" r="3"></circle><path d="M12 3.5v2.2M12 18.3V20.5M4.8 6.2l1.6 1.6M17.6 16.2l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.8l1.6-1.6M17.6 7.8l1.6-1.6"></path>
  {:else if name === "book" || name === "bible"}
    <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5z"></path><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3"></path>
  {:else if name === "list"}
    <path d="M8 7h12M8 12h12M8 17h12"></path><path d="M4 7h.01M4 12h.01M4 17h.01"></path>
  {:else if name === "chevron-left"}
    <path d="M14 6l-6 6 6 6"></path>
  {:else if name === "chevron-right"}
    <path d="M10 6l6 6-6 6"></path>
  {:else if name === "expand"}
    <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5"></path>
  {:else if name === "columns"}
    <rect x="4" y="5" width="7" height="14" rx="1.5"></rect><rect x="13" y="5" width="7" height="14" rx="1.5"></rect>
  {:else if name === "mic"}
    <rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"></path>
  {:else if name === "mic-off"}
    <rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6M5 5l14 14"></path>
  {:else if name === "wave" || name === "audio"}
    <path d="M3 12h2l2-5 3 10 2-5h2l2 3 2-3h3"></path>
  {:else if name === "note" || name === "lyrics"}
    <path d="M9 18a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"></path><path d="M12 15V5l8-2v7"></path><circle cx="17" cy="12" r="3"></circle>
  {:else if name === "pew"}
    <path d="M5 19V8l7-4 7 4v11"></path><path d="M9 19v-6h6v6"></path>
  {:else if name === "obs"}
    <rect x="3" y="4" width="8" height="6" rx="1"></rect><rect x="13" y="4" width="8" height="6" rx="1"></rect><path d="M12 7v4M8 14h8"></path><rect x="3" y="16" width="18" height="4" rx="1"></rect>
  {:else if name === "church" || name === "general"}
    <path d="M12 3v4M10 5h4"></path><path d="M5 20V10l7-4 7 4v10"></path><path d="M10 20v-5h4v5"></path>
  {:else if name === "screens"}
    <rect x="2" y="4" width="14" height="10" rx="1.5"></rect><rect x="8" y="10" width="14" height="10" rx="1.5"></rect>
  {:else if name === "cast"}
    <path d="M4 8a12 12 0 0 1 12 12"></path><path d="M4 12a8 8 0 0 1 8 8"></path><path d="M4 16a4 4 0 0 1 4 4"></path><path d="M5 19h.01"></path>
  {:else if name === "stage"}
    <path d="M4 18V8l8-4 8 4v10"></path><path d="M8 18v-4h8v4"></path>
  {:else if name === "keys"}
    <rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M7 12h.01M11 12h.01M15 12h.01"></path>
  {:else if name === "media"}
    <rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.5"></circle><path d="M21 16l-5-4-9 7"></path>
  {:else if name === "speed"}
    <path d="M5 16a7 7 0 1 1 14 0"></path><path d="M12 13l3-3"></path>
  {:else if name === "files"}
    <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path>
  {:else if name === "refresh"}
    <path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v5h-5"></path>
  {:else if name === "user"}
    <circle cx="12" cy="8" r="3"></circle><path d="M5 19a7 7 0 0 1 14 0"></path>
  {:else if name === "key"}
    <circle cx="8" cy="14" r="3"></circle><path d="M11 14h9l-2 2 2 2"></path>
  {:else if name === "close"}
    <path d="M6 6l12 12M18 6L6 18"></path>
  {:else if name === "ask"}
    <path d="M12 4a7 7 0 0 0-4 12.7V20l3-2h1a7 7 0 1 0 0-14z"></path>
  {:else if name === "transition"}
    <path d="M7 7h10M7 12h10M7 17h10"></path><path d="M15 5l3 2-3 2M9 15l-3 2 3 2"></path>
  {/if}
</svg>
