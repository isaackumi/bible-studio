// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // WEB_BASE=/app builds the web demo served at church-studio.heitechinc.com/app (npm run build:web),
    // into server/web/app; the desktop app's build is unchanged.
    adapter: adapter(
      process.env.WEB_BASE
        ? { pages: `server/web${process.env.WEB_BASE}`, assets: `server/web${process.env.WEB_BASE}`, fallback: "index.html" }
        : { fallback: "index.html" },
    ),
    paths: { base: process.env.WEB_BASE ?? "" },
  },
};

export default config;
