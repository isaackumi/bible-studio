import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Compiles .svelte.ts modules ($state and friends), so classes such as the audio deck can be tested.
  plugins: [svelte()],
  // Tests read the built-in Bibles from their files, as the browser version does.
  define: { __BUNDLED_BIBLES__: "true" },
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    environment: "node",
    // Some tests read whole Bibles or load the session; on a busy machine 5 s was not always enough.
    testTimeout: 20_000,
  },
});
