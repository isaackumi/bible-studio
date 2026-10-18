<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import { parseSecond, readSecondLocal, subscribeSecondLocal } from "../display/channel";
  import { cleanAspect } from "../display/shape";
  import { frameBackground } from "../domain/backgrounds";
  import { emptyModel, defaultTheme } from "../domain/theme";
  import type { PresentationModel } from "../domain/types";
  import { isDesktop } from "../platform/runtime";
  import Screen from "./Screen.svelte";

  // A second audience screen (lobby TV, overflow room): Program as the desk prepares it for this
  // screen, the same or words only, in its own theme. Silent: sound plays on the audience screen.
  let model = $state<PresentationModel>(emptyModel(defaultTheme()));
  let stamp = $state(0);
  let aspect = $state(16 / 9);

  function measure() {
    if (window.innerWidth && window.innerHeight) aspect = cleanAspect(window.innerWidth / window.innerHeight);
  }

  onMount(() => {
    measure();
    window.addEventListener("resize", measure);
    const initial = readSecondLocal();
    if (initial) {
      model = initial.model;
      stamp = initial.at;
    }
    const stop = subscribeSecondLocal((frame) => {
      model = frame.model;
      stamp = frame.at;
    });
    let unlisten = () => {};
    if (isDesktop()) {
      void listen<string>("second-frame", (event) => {
        const frame = parseSecond(event.payload);
        if (frame) {
          model = frame.model;
          stamp = frame.at;
        }
      }).then((stopListening) => (unlisten = stopListening));
    }
    return () => {
      window.removeEventListener("resize", measure);
      stop();
      unlisten();
    };
  });
</script>

<div class="audience" style:background={frameBackground(model)} style:--aspect={aspect}>
  {#key stamp}
    <div class="fade-in" style:--fade="300ms">
      <Screen {model} {aspect} />
    </div>
  {/key}
</div>
