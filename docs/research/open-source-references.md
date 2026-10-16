# Open-source references

Research notes for Church Studio, checked 2026-10-16. These are product and architecture references only; no source code or assets are copied.

## Cloud of Worship

Sources: [repository](https://github.com/CoW-Labs/cloudofworship), [README](https://github.com/CoW-Labs/cloudofworship/blob/main/README.md), and [package manifest](https://github.com/CoW-Labs/cloudofworship/blob/main/package.json).

The project describes itself as browser-first and offline-ready, with Bible search, song and slide presentation, customizable layout, and optional cloud collaboration/live streaming. Its README identifies Nuxt/Vue, TypeScript, Tauri, Pinia, and Tailwind; the package manifest confirms the Nuxt, Vue, Pinia, and Tauri direction. The README's project-tree example lists reusable components, composables, pages, plugins, and stores.

### Useful ideas

- Keep a browser-capable presentation workflow rather than making the desktop shell the only way to use the product.
- Treat offline presentation and live output as product requirements, not implementation details.
- Organize content libraries and presentation tools as distinct areas while keeping their handoff to live output clear.
- Make cloud collaboration an optional capability; do not conflate it with local presentation state.

### What Church Studio should adopt or improve

Church Studio already has a browser/native split and local content workflows. It should continue to make capability differences explicit, preserve offline-first presentation, and keep Preview, Program, and Audience as separate state boundaries. It should improve on a broad dashboard-style surface by prioritizing fast operator actions, durable local state, and explicit confirmation before output changes.

### What not to copy

Do not copy its code, assets, branding, visual layouts, or product-specific cloud behavior. The README's sample tree is descriptive, not a reason to replace Church Studio's current Svelte/Tauri architecture.

## PhotoCraft

Sources: [repository](https://github.com/storytold/photocraft), [README](https://github.com/storytold/photocraft/blob/main/README.md), and [application manifest](https://github.com/storytold/photocraft/blob/main/apps/photocraft/Cargo.toml).

The README describes PhotoCraft as a native, offline Rust editor with a GPU compositor, layer-based documents, and a command-driven control surface shared by the UI, CLI, JSON control channel, and MCP server. Its interface emphasizes familiar tool placement, editable layers, and live previews before committing changes. The Rust manifest confirms the native application crate and feature-oriented packaging.

### Useful ideas

- Keep a visible, ordered layer stack with explicit selection and visibility/lock state.
- Make the canvas/editor the direct manipulation surface, with properties and contextual tools close to the selected layer.
- Preview edits before committing them; separate the prepared result from the authoritative output.
- Route actions through domain commands so keyboard, UI, and automation share behavior rather than duplicating it.
- Keep native performance and capability constraints explicit instead of implying that every platform has identical behavior.

### What Church Studio should adopt or improve

The existing `Composition` model is the right place to represent reusable production looks. Church Studio should expose its layer order, visibility, lock state, and selected-layer controls in the Production Desk, while keeping TAKE/CUT as the deliberate boundary into Program. It should improve on a general image editor's workflow by optimizing for service timing, reliable output safety, and concise operator controls rather than exposing a large creative-tool surface.

### What not to copy

Do not copy PhotoCraft code, assets, screenshots, branding, or Photoshop-specific interaction patterns. Church Studio needs a production composition editor, not a full raster-image editing application; only adopt the interaction principles that fit its existing layer and output model.
