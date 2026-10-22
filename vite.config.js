import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import process from "node:process";
import { readdirSync, readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const host = process.env.TAURI_DEV_HOST;

/**
 * The studio's icon picker: every Lucide icon (name and shapes), read from the installed package at
 * build time, so it always matches the Lucide in use. It is its own lazily loaded file: only the
 * picker loads it, and a chosen icon's shapes are copied into the page, so screens never need it.
 */
function lucideIcons() {
  const id = "virtual:lucide-icons";
  return {
    name: "lucide-icons",
    /** @param {string} source */
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    /** @param {string} resolved */
    load(resolved) {
      if (resolved !== `\0${id}`) return undefined;
      const dir = new URL("./node_modules/@lucide/svelte/dist/icons/", import.meta.url);
      const icons = [];
      for (const file of readdirSync(dir).filter((name) => name.endsWith(".svelte")).sort()) {
        const found = readFileSync(new URL(file, dir), "utf8").match(/const iconData = (\{.*\});/);
        if (!found) continue;
        const data = JSON.parse(found[1]);
        icons.push([data.name, data.node]);
      }
      return `export default ${JSON.stringify(icons)};`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit(), lucideIcons()],
  // The app version, for check-ins and support emails.
  // __BUNDLED_BIBLES__: the browser version (and development) carries the built-in Bibles as files;
  // the desktop app (tauri dev and tauri build set TAURI_ENV_PLATFORM) reads them from its library instead.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUNDLED_BIBLES__: JSON.stringify(!process.env.TAURI_ENV_PLATFORM),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
