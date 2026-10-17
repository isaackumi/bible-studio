<script lang="ts">
  import TextStyleEditor from "./TextStyleEditor.svelte";
  import { parseTextStyle } from "../domain/text-style";
  import { onMount } from "svelte";
  import { session } from "../app/session.svelte";
  import {
    addLayer,
    applyLowerThirdTemplate,
    lowerThirdCopy,
    assignLayerSource,
    clearLowerThird,
    COMPOSITION_TEMPLATES,
    fillTemplate,
    type CompositionTemplate,
    lookMultiCamera,
    setLayerStyle,
    hideLayer,
    instantiateTemplate,
    lookCameraLowerThird,
    lookCameraCountdown,
    lookScriptureCamera,
    lookScriptureClock,
    lookScriptureCountdown,
    swapSides,
    lookLyricsCamera,
    lookImageCamera,
    lookTwoCameras,
    lookCameraPresentation,
    lookFullCamera,
    lookFullScripture,
    lookFullLyrics,
    lookCountdown,
    lookAnnouncement,
    lookTwoRegions,
    assignText,
    assignScripture,
    assignSong,
    applyLayerDrag,
    type LayerDragHandle,
    clearTimer,
    LOWER_THIRD_TEMPLATES,
    reorderLayers,
    resizeLayer,
    setLayerOpacity,
    setLayerFit,
    setLayerLocked,
    setLayerAnimation,
    type LayerAnimation,
    type LayerAnimationKind,
    restoreComposition,
    renameComposition,
    renameLayer,
    removeLayer,
    duplicateLayer,
    duplicateLook,
    setCompositionTransition,
    showLayer,
    sourceRef,
    type Composition,
    type LowerThirdTemplate,
    type SourceType,
  } from "../domain/composition";
  import { mediaUrl } from "../db/api";
  import { targetAtFromClock, type TimerMode } from "../domain/timer";
  import Screen from "./Screen.svelte";
  import Icon from "./Icon.svelte";
  import LibrarySidebar from "./pew/LibrarySidebar.svelte";

  let draft = $state<Composition | null>(null);
  let selectedId = $state<string | null>(null);
  let lowerTitle = $state("Pastor");
  let lowerSubtitle = $state("Speaker");
  let timerMinutes = $state(10);
  let timerLabel = $state("Service starts in");
  let timerMode = $state<TimerMode>("countdown");
  let timerClock = $state("10:30");
  let textHeading = $state("Welcome");
  let textBody = $state("Please join us after the service.");
  let scriptureRef = $state("John 3:16");
  let scriptureBody = $state("For God so loved the world.");
  let scriptureAttr = $state("KJV");
  let songLabel = $state("Verse 1");
  let songBody = $state("Holy, holy, holy");
  let previewFrame = $state<HTMLDivElement | undefined>();
  let drag = $state<{ layerId: string; handle: LayerDragHandle; startX: number; startY: number; origin: Composition } | null>(null);
  const dragHandles: LayerDragHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const ANIMATIONS: [LayerAnimationKind, string][] = [
    ["none", "None"],
    ["fade", "Fade"],
    ["dissolve", "Dissolve"],
    ["slide-up", "Slide up"],
    ["slide-down", "Slide down"],
    ["slide-left", "Slide left"],
    ["slide-right", "Slide right"],
  ];

  const saved = $derived(session.workspace.compositions.map((entry) => restoreComposition(entry)));

  type LayoutGroup = "all" | "scripture" | "lyrics" | "camera" | "timer";
  const LAYOUT_GROUPS: [LayoutGroup, string][] = [["all", "All"], ["scripture", "Scripture"], ["lyrics", "Lyrics"], ["camera", "Cameras"], ["timer", "Timers"]];
  let layoutGroup = $state<LayoutGroup>("all");
  /** Which filter chips a layout belongs to, from its slot roles or its name. */
  function groupsOf(template: CompositionTemplate): Set<LayoutGroup> {
    const words = template.name.toLowerCase();
    const roles = new Set(template.slots.map((slot) => slot.role));
    const groups = new Set<LayoutGroup>();
    if (roles.has("scripture") || words.includes("scripture")) groups.add("scripture");
    if (roles.has("lyrics") || words.includes("lyrics")) groups.add("lyrics");
    if (roles.has("camera") || /camera|picture in|speaker|across/.test(words)) groups.add("camera");
    if (roles.has("timer") || roles.has("clock") || /countdown|time\b/.test(words)) groups.add("timer");
    return groups;
  }
  const layouts = $derived(COMPOSITION_TEMPLATES.filter((template) => layoutGroup === "all" || groupsOf(template).has(layoutGroup)));
  const customLayouts = $derived(session.workspace.customLayouts);

  /** Everything on the desk a layout's slots can be filled with. */
  async function deskContent() {
    await session.loadCameras();
    return {
      scripture: scriptureFromDesk(),
      lyrics: lyricsFromDesk(),
      cameras: session.cameras.map((camera) => ({ id: camera.deviceId, label: camera.label })),
      image: imageFromDesk(),
      announcement: announcementFromDesk(),
      timer: { durationMs: Math.max(1, timerMinutes) * 60_000, label: timerLabel || "Service starts in" },
      lowerThird: { title: lowerTitle, subtitle: lowerSubtitle },
    };
  }
  const selected = $derived(draft?.layers.find((layer) => layer.id === selectedId) ?? draft?.layers[0] ?? null);

  $effect(() => {
    const layer = selected;
    if (!layer) return;
    if (layer.source.type === "scripture") {
      scriptureRef = layer.source.payload.reference || "";
      scriptureBody = layer.source.payload.body || "";
      scriptureAttr = layer.source.payload.attribution || "";
    } else if (layer.source.type === "song") {
      songLabel = layer.source.payload.label || "";
      songBody = layer.source.payload.body || "";
    } else if (layer.source.type === "text") {
      textHeading = layer.source.payload.heading || textHeading;
      textBody = layer.source.payload.body || textBody;
    }
  });

  onMount(() => {
    void session.loadCameras();
  });

  function applyScriptureCopy() {
    if (!draft || !selected) return;
    touch(
      assignScripture(draft, selected.id, {
        reference: scriptureRef,
        body: scriptureBody,
        attribution: scriptureAttr,
        verse: Number(selected.source.payload.verse) || 1,
      }),
    );
  }

  function applySongCopy() {
    if (!draft || !selected) return;
    touch(assignSong(draft, selected.id, { label: songLabel, body: songBody }));
  }

  async function openTemplate(id: string) {
    if (id === "camera-lower-third") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookCameraLowerThird({
        camera: { id: camera.deviceId, label: camera.label },
        title: lowerTitle,
        subtitle: lowerSubtitle,
      });
      selectedId = draft.layers[1]?.id ?? draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "camera-countdown") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookCameraCountdown({
        camera: { id: camera.deviceId, label: camera.label },
        durationMs: Math.max(1, timerMinutes) * 60_000,
        label: "Service starts in",
      });
      selectedId = draft.layers[1]?.id ?? draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "scripture-camera") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookScriptureCamera({
        camera: { id: camera.deviceId, label: camera.label },
        ...scriptureFromDesk(),
      });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "scripture-countdown") {
      timerMode = "countdown";
      timerLabel = "Time left";
      draft = lookScriptureCountdown({ ...scriptureFromDesk(), durationMs: Math.max(1, timerMinutes) * 60_000, label: timerLabel });
      selectedId = draft.layers[1]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "scripture-clock") {
      draft = lookScriptureClock(scriptureFromDesk());
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "lyrics-camera") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookLyricsCamera({
        camera: { id: camera.deviceId, label: camera.label },
        ...lyricsFromDesk(),
      });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "image-camera") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookImageCamera({
        camera: { id: camera.deviceId, label: camera.label },
        ...imageFromDesk(),
      });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "three-cameras" || id === "four-cameras") {
      await session.loadCameras();
      draft = lookMultiCamera(
        session.cameras.map((camera) => ({ id: camera.deviceId, label: camera.label })),
        id === "three-cameras" ? 3 : 4,
      );
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "two-cameras") {
      await session.loadCameras();
      const left = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      const right = session.cameras[1] ?? left;
      draft = lookTwoCameras({
        left: { id: left.deviceId, label: left.label },
        right: { id: right.deviceId, label: right.label },
      });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "camera-presentation") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookCameraPresentation({
        camera: { id: camera.deviceId, label: camera.label },
        presentation: presentationFromDesk(),
      });
      selectedId = draft.layers[1]?.id ?? draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "full-frame") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookFullCamera({ camera: { id: camera.deviceId, label: camera.label } });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "full-scripture") {
      draft = lookFullScripture(scriptureFromDesk());
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "full-lyrics") {
      draft = lookFullLyrics(lyricsFromDesk());
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "countdown") {
      timerMode = "countdown";
      timerLabel = "Service starts in";
      draft = lookCountdown({
        durationMs: Math.max(1, timerMinutes) * 60_000,
        label: timerLabel,
        mode: timerMode,
      });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "announcement") {
      const copy = announcementFromDesk();
      textHeading = copy.heading;
      textBody = copy.body;
      draft = lookAnnouncement(copy);
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    if (id === "split-two") {
      await session.loadCameras();
      const camera = session.cameras[0] ?? { deviceId: "cam-1", label: "Camera 1" };
      draft = lookTwoRegions({
        left: regionFromDesk(),
        right: sourceRef("camera", camera.deviceId, camera.label, { deviceId: camera.deviceId, label: camera.label }),
      });
      selectedId = draft.layers[0]?.id ?? null;
      session.previewLook(draft);
      return;
    }
    const template = [...COMPOSITION_TEMPLATES, ...session.workspace.customLayouts].find((entry) => entry.id === id);
    if (!template) return;
    draft = template.slots.some((slot) => slot.role) ? fillTemplate(template, await deskContent()) : instantiateTemplate(template, template.name);
    selectedId = draft.layers[0]?.id ?? null;
    session.previewLook(draft);
  }

  let armedDelete = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  const programLive = $derived(session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
  const SOURCE_ICON: Record<string, string> = { camera: "cast", scripture: "bible", song: "lyrics", image: "media", video: "media", timer: "speed", clock: "speed", text: "list", "lower-third": "stage", qr: "layout", empty: "square" };

  function deleteSaved(look: Composition) {
    clearTimeout(armTimer);
    if (armedDelete !== look.id) {
      armedDelete = look.id;
      armTimer = setTimeout(() => (armedDelete = null), 3000);
      return;
    }
    armedDelete = null;
    session.deleteLook(look.id);
    if (draft?.id === look.id) {
      draft = null;
      selectedId = null;
    }
  }

  function openSaved(composition: Composition) {
    draft = restoreComposition(composition);
    selectedId = draft.layers[0]?.id ?? null;
    session.previewLook(draft);
  }

  function touch(next: Composition) {
    draft = next;
    session.previewLook(next);
  }

  function presentationFromDesk() {
    const preview = session.live.preview.model;
    if (preview.layout === "scripture") {
      const passage = scriptureFromDesk();
      return sourceRef("scripture", passage.reference, passage.reference, {
        reference: passage.reference,
        body: passage.body,
        attribution: passage.attribution,
        verse: String(passage.verse),
      });
    }
    if (preview.layout === "lyrics") {
      const lyrics = lyricsFromDesk();
      return sourceRef("song", lyrics.label, lyrics.label, { label: lyrics.label, body: lyrics.lines.join("\n") });
    }
    if (preview.layout === "image") {
      const picture = imageFromDesk();
      return sourceRef("image", picture.title, picture.title, { imageUrl: picture.imageUrl });
    }
    const nested = preview.layers?.find(
      (layer) => layer.model.layout === "scripture" || layer.model.layout === "lyrics" || layer.model.layout === "image",
    )?.model;
    if (nested?.layout === "scripture") {
      return sourceRef("scripture", nested.reference ?? "John 3:16", nested.reference ?? "John 3:16", {
        reference: nested.reference ?? "John 3:16",
        body: nested.lines.map((line) => line.text).join(" ") || "For God so loved the world.",
        attribution: nested.attribution ?? "KJV",
        verse: String(Number(nested.lines[0]?.marker) || 1),
      });
    }
    if (nested?.layout === "lyrics") {
      return sourceRef("song", nested.reference ?? "Lyrics", nested.reference ?? "Lyrics", {
        label: nested.reference ?? "Lyrics",
        body: nested.lines.map((line) => line.text).join("\n"),
      });
    }
    if (nested?.layout === "image" && nested.imageUrl) {
      return sourceRef("image", nested.reference ?? "Image", nested.reference ?? "Image", { imageUrl: nested.imageUrl });
    }
    const passage = scriptureFromDesk();
    return sourceRef("scripture", passage.reference, passage.reference, {
      reference: passage.reference,
      body: passage.body,
      attribution: passage.attribution,
      verse: String(passage.verse),
    });
  }

  function imageFromDesk() {
    const preview = session.live.preview.model;
    const model = preview.layout === "image" ? preview : preview.layers?.find((layer) => layer.model.layout === "image")?.model;
    const fromPreview = model?.imageUrl?.trim();
    if (fromPreview) return { imageUrl: fromPreview, title: model?.reference ?? "Image" };
    const fromLibrary = mediaUrl(session.media[0] ?? null);
    if (fromLibrary) return { imageUrl: fromLibrary, title: session.media[0]?.name ?? "Image" };
    return {
      imageUrl:
        "data:image/svg+xml," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#3d2a14"/><text x="50%" y="50%" fill="#e2cc9d" font-size="72" text-anchor="middle" dominant-baseline="middle">Image</text></svg>',
        ),
      title: "Image",
    };
  }

  function regionFromDesk() {
    const preview = session.live.preview.model;
    const title =
      preview.layout === "title" && preview.attribution !== "Camera"
        ? preview
        : preview.layers?.find((layer) => layer.model.layout === "title" && layer.model.attribution !== "Camera")?.model;
    const heading = title?.lines[0]?.text.trim();
    if (heading) {
      return sourceRef("text", "announcement", heading, {
        heading,
        body: title?.lines
          .slice(1)
          .map((line) => line.text)
          .filter((line) => line.trim())
          .join("\n") ?? "",
      });
    }
    return presentationFromDesk();
  }

  function announcementFromDesk() {
    const preview = session.live.preview.model;
    const model = preview.layout === "title" ? preview : preview.layers?.find((layer) => layer.model.layout === "title")?.model;
    const heading = model?.lines[0]?.text.trim();
    const body = model?.lines
      .slice(1)
      .map((line) => line.text)
      .filter((line) => line.trim())
      .join("\n");
    if (heading) return { heading, body: body || "" };
    const queued = session.service?.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === "announcement" || item.kind === "slide");
    if (queued?.announcement) return { heading: queued.announcement.heading || "Welcome", body: queued.announcement.body };
    if (queued?.slide) return { heading: queued.slide.heading || queued.title || "Welcome", body: queued.slide.body };
    return { heading: "Welcome", body: "Please join us after the service." };
  }

  function lyricsFromDesk() {
    const preview = session.live.preview.model;
    const model = preview.layout === "lyrics" ? preview : preview.layers?.find((layer) => layer.model.layout === "lyrics")?.model;
    if (!model) {
      return { label: "Verse 1", lines: ["Holy, holy, holy", "Lord God Almighty"] };
    }
    return {
      label: model.reference ?? "Lyrics",
      lines: model.lines.map((line) => line.text).filter((line) => line.trim()),
    };
  }

  function scriptureFromDesk() {
    const preview = session.live.preview.model;
    const model = preview.layout === "scripture" ? preview : preview.layers?.find((layer) => layer.model.layout === "scripture")?.model;
    if (!model) {
      return { reference: "John 3:16", body: "For God so loved the world.", attribution: "KJV", verse: 16 };
    }
    return {
      reference: model.reference ?? "John 3:16",
      body: model.lines.map((line) => line.text).join(" ") || "For God so loved the world.",
      attribution: model.attribution ?? "KJV",
      verse: Number(model.lines[0]?.marker) || 1,
    };
  }

  function deskForLowerThird() {
    const passage = scriptureFromDesk();
    const lyrics = lyricsFromDesk();
    const note = announcementFromDesk();
    const song = session.songs.find((entry) => entry.title === lyrics.label);
    return {
      title: lowerTitle,
      subtitle: lowerSubtitle,
      scripture: { reference: passage.reference, attribution: passage.attribution },
      song: {
        title: song?.title || (lyrics.label !== "Verse 1" ? lyrics.label : lyrics.lines[0] || "Song"),
        author: song?.author || "",
      },
      announcement: note,
    };
  }

  function copyForLowerThird(template: LowerThirdTemplate) {
    return lowerThirdCopy(template, deskForLowerThird());
  }

  function applyLowerThird(template: LowerThirdTemplate) {
    if (!draft || !selected) return;
    const copy = copyForLowerThird(template);
    lowerTitle = copy.title;
    lowerSubtitle = copy.subtitle;
    touch(applyLowerThirdTemplate(draft, selected.id, template, copy.title, copy.subtitle));
  }

  function assign(type: SourceType) {
    if (!draft || !selected) return;
    if (type === "scripture") {
      const passage = scriptureFromDesk();
      scriptureRef = passage.reference;
      scriptureBody = passage.body;
      scriptureAttr = passage.attribution;
      touch(
        assignScripture(draft, selected.id, {
          reference: passage.reference,
          body: passage.body,
          attribution: passage.attribution,
          verse: passage.verse,
        }),
      );
      return;
    }
    if (type === "song") {
      const lyrics = lyricsFromDesk();
      songLabel = lyrics.label;
      songBody = lyrics.lines.join("\n");
      touch(assignSong(draft, selected.id, { label: lyrics.label, body: songBody }));
      return;
    }
    if (type === "image") {
      const picture = imageFromDesk();
      touch(assignLayerSource(draft, selected.id, sourceRef("image", picture.title, picture.title, { imageUrl: picture.imageUrl })));
      return;
    }
    if (type === "camera") {
      const camera = session.cameras[0];
      touch(assignLayerSource(draft, selected.id, sourceRef("camera", camera?.deviceId ?? "cam-1", camera?.label ?? "Camera 1", { label: camera?.label ?? "Camera 1" })));
      return;
    }
    if (type === "timer") {
      touch(
        assignLayerSource(
          draft,
          selected.id,
          sourceRef("timer", "service", timerLabel, {
            mode: timerMode,
            durationMs: String(Math.max(1, timerMinutes) * 60_000),
            label: timerLabel,
            ...(timerMode === "target" ? { targetAt: String(targetAtFromClock(timerClock, Date.now())) } : {}),
          }),
        ),
      );
      return;
    }
    if (type === "lower-third") {
      const template = LOWER_THIRD_TEMPLATES[0]!;
      const copy = copyForLowerThird(template);
      lowerTitle = copy.title;
      lowerSubtitle = copy.subtitle;
      touch(applyLowerThirdTemplate(draft, selected.id, template, copy.title, copy.subtitle));
      return;
    }
    if (type === "text") {
      touch(assignText(draft, selected.id, textHeading, textBody));
      return;
    }
    touch(assignLayerSource(draft, selected.id, sourceRef("empty", "empty", "Empty")));
  }

  function setBound(key: "x" | "y" | "w" | "h", value: number) {
    if (!draft || !selected || selected.locked) return;
    touch(resizeLayer(draft, selected.id, { ...selected.bounds, [key]: value }));
  }

  function setOpacity(percent: number) {
    if (!draft || !selected) return;
    touch(setLayerOpacity(draft, selected.id, percent / 100));
  }

  function startDrag(layerId: string, handle: LayerDragHandle, event: PointerEvent) {
    if (!draft) return;
    const layer = draft.layers.find((entry) => entry.id === layerId);
    if (!layer || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    selectedId = layerId;
    drag = { layerId, handle, startX: event.clientX, startY: event.clientY, origin: draft };
    previewFrame?.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent) {
    if (!drag || !previewFrame) return;
    const box = previewFrame.querySelector<HTMLElement>(".ratio") ?? previewFrame;
    const width = box.clientWidth || 1;
    const height = box.clientHeight || 1;
    touch(
      applyLayerDrag(drag.origin, drag.layerId, drag.handle, {
        dx: ((event.clientX - drag.startX) / width) * 100,
        dy: ((event.clientY - drag.startY) / height) * 100,
      }),
    );
  }

  function endDrag() {
    drag = null;
  }
</script>

<section class="looks-desk">
  <!-- Library: templates and saved looks -->
  <LibrarySidebar title="Looks" icon="layout" count={saved.length} storageKey="looks">
    <div class="lib-scroll">
      {#if customLayouts.length > 0}
        <p class="group">Your layouts <span>{customLayouts.length}</span></p>
        <div class="tiles">
          {#each customLayouts as template (template.id)}
            <div class="tile-wrap">
              <button type="button" class="tile" title={template.name} onclick={() => void openTemplate(template.id)}>
                <span class="schema" aria-hidden="true">
                  {#each template.slots as slot, n (slot.id)}
                    <i style:left="{slot.bounds.x}%" style:top="{slot.bounds.y}%" style:width="{slot.bounds.w}%" style:height="{slot.bounds.h}%" class:main={n === 0}></i>
                  {/each}
                </span>
                <span class="tile-name">{template.name}</span>
              </button>
              <button
                type="button"
                class="tile-delete"
                class:armed={armedDelete === template.id}
                aria-label={armedDelete === template.id ? `Confirm delete ${template.name}` : `Delete ${template.name}`}
                title={armedDelete === template.id ? "Click again to delete" : "Delete layout"}
                onclick={() => {
                  if (armedDelete !== template.id) {
                    armedDelete = template.id;
                    clearTimeout(armTimer);
                    armTimer = setTimeout(() => (armedDelete = null), 3000);
                    return;
                  }
                  armedDelete = null;
                  session.deleteLookLayout(template.id);
                }}
              ><Icon name="close" size={12} /></button>
            </div>
          {/each}
        </div>
      {/if}

      <p class="group">Start from a layout</p>
      <div class="layout-chips" role="radiogroup" aria-label="Show layouts">
        {#each LAYOUT_GROUPS as [id, label] (id)}
          <button type="button" role="radio" aria-checked={layoutGroup === id} class:on={layoutGroup === id} onclick={() => (layoutGroup = id)}>{label}</button>
        {/each}
      </div>
      <div class="tiles">
        {#each layouts as template (template.id)}
          <button
            type="button"
            class="tile"
            class:on={draft && !saved.some((entry) => entry.id === draft?.id) && draft.name === template.name}
            title={template.name}
            onclick={() => void openTemplate(template.id)}
          >
            <span class="schema" aria-hidden="true">
              {#each template.slots as slot, n (slot.id)}
                <i style:left="{slot.bounds.x}%" style:top="{slot.bounds.y}%" style:width="{slot.bounds.w}%" style:height="{slot.bounds.h}%" class:main={n === 0}></i>
              {/each}
            </span>
            <span class="tile-name">{template.name}</span>
          </button>
        {/each}
      </div>

      <p class="group">Saved <span>{saved.length}</span></p>
      {#if saved.length === 0}<p class="empty">Save a look to reuse it in any service.</p>{/if}
      <ul class="saved">
        {#each saved as look (look.id)}
          <li class:on={draft?.id === look.id}>
            <button type="button" class="saved-main" onclick={() => openSaved(look)}>
              <strong>{look.name}</strong>
              <span>{look.layers.length} layer{look.layers.length === 1 ? "" : "s"}{look.locked ? " · locked" : ""}</span>
            </button>
            <button type="button" class="tool" title="Duplicate" aria-label={`Duplicate ${look.name}`} onclick={() => { const copy = duplicateLook(look); session.saveLook(copy); openSaved(copy); }}><Icon name="copy" size={14} /></button>
            <button type="button" class="tool" title="Add to queue" aria-label={`Queue ${look.name}`} onclick={() => void session.addLookToService(look)}><Icon name="queue" size={14} /></button>
            <button
              type="button"
              class="tool"
              class:armed={armedDelete === look.id}
              title={armedDelete === look.id ? "Click again to delete" : "Delete"}
              aria-label={armedDelete === look.id ? `Confirm delete ${look.name}` : `Delete ${look.name}`}
              onclick={() => deleteSaved(look)}
            ><Icon name="close" size={14} /></button>
          </li>
        {/each}
      </ul>
    </div>
  </LibrarySidebar>

  <!-- Editor: name, canvas, layers -->
  <div class="editor">
    {#if draft}
      <header class="look-head">
        <input class="look-name" aria-label="Look name" value={draft.name} onchange={(event) => touch(renameComposition(draft!, event.currentTarget.value))} />
        <label class="inline">
          <span>Transition</span>
          <select
            aria-label="Look transition"
            value={draft.transition.type}
            onchange={(event) => draft && touch(setCompositionTransition(draft, { type: event.currentTarget.value === "cut" ? "cut" : "fade", ms: draft.transition.ms }))}
          >
            <option value="fade">Fade</option>
            <option value="cut">Cut</option>
          </select>
        </label>
        {#if draft.transition.type === "fade"}
          <label class="inline">
            <input
              class="ms"
              type="number"
              min="0"
              max="2000"
              step="50"
              aria-label="Look transition duration"
              value={draft.transition.ms}
              oninput={(event) => draft && touch(setCompositionTransition(draft, { type: "fade", ms: Number(event.currentTarget.value) }))}
            />
            <span>ms</span>
          </label>
        {/if}
        <div class="head-actions">
          <button type="button" class="desk-btn" onclick={() => draft && session.previewLook(draft)}><Icon name="play" size={14} /> Preview</button>
          <button type="button" class="desk-btn primary-soft" onclick={() => draft && session.saveLook(draft)}>Save look</button>
          <button type="button" class="desk-btn" title="Save this arrangement as a layout to start from again" onclick={() => draft && session.saveLookLayout(draft)}>Save as layout</button>
          <button
            type="button"
            class="desk-btn ghost icon"
            title="Duplicate look"
            aria-label="Duplicate look"
            onclick={() => {
              if (!draft) return;
              const copy = duplicateLook(draft);
              draft = copy;
              selectedId = copy.layers[0]?.id ?? null;
              session.saveLook(copy);
              session.previewLook(copy);
            }}
          ><Icon name="copy" size={14} /></button>
          <button type="button" class="desk-btn ghost icon" title="Add to queue" aria-label="Queue" onclick={() => draft && void session.addLookToService(draft)}><Icon name="queue" size={14} /></button>
        </div>
      </header>
    {:else}
      <header class="look-head empty-head">
        <p>Pick a layout or a saved look. It goes to <b>Preview</b> to arrange; <b>Go live</b> shows it to the audience.</p>
      </header>
    {/if}

    <figure class="edit-frame">
      <figcaption>
        <span class="kicker">Preview</span>
        <span class="hint">{draft ? "Drag a layer to move it · drag a handle to resize · arrow keys nudge (Shift = 5%)" : "Nothing to arrange yet"}</span>
        {#if draft && !draft.locked}
          <button type="button" class="swap-sides" title="Mirror the layout left to right" onclick={() => touch(swapSides(draft!))}><Icon name="transition" size={14} /> Swap sides</button>
        {/if}
      </figcaption>
      <div
        class="monitor preview-edit"
        bind:this={previewFrame}
        role="region"
        aria-label="Composition preview editor"
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      >
        <Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint="Nothing on Preview yet. Pick a verse, song or slide.">
          {#snippet overlay()}
            {#if draft && session.live.preview.model.layout === "composition"}
              {#each draft.layers.filter((layer) => layer.visible) as layer (layer.id)}
                <div
                  class="layer-frame"
                  class:on={selected?.id === layer.id}
                  style:left="{layer.bounds.x}%"
                  style:top="{layer.bounds.y}%"
                  style:width="{layer.bounds.w}%"
                  style:height="{layer.bounds.h}%"
                  role="button"
                  tabindex="0"
                  aria-label="Move {layer.name}"
                  onpointerdown={(event) => { selectedId = layer.id; startDrag(layer.id, "move", event); }}
                  onkeydown={(event) => {
                    const step = event.shiftKey ? 5 : 1;
                    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                    const move = moves[event.key];
                    if (!move) return;
                    event.preventDefault();
                    event.stopPropagation();
                    touch(applyLayerDrag(draft!, layer.id, "move", { dx: move[0], dy: move[1] }));
                  }}
                >
                  {#if selected?.id === layer.id}<span class="frame-label">{layer.name}</span>{/if}
                  {#if selected?.id === layer.id && !layer.locked}
                    {#each dragHandles as handle (handle)}
                      <button type="button" class="handle {handle}" aria-label="Resize {layer.name} {handle}" onpointerdown={(event) => startDrag(layer.id, handle, event)}></button>
                    {/each}
                  {/if}
                </div>
              {/each}
            {/if}
          {/snippet}
        </Screen>
      </div>
    </figure>

    {#if draft}
      <section class="layers-panel" aria-label="Layers">
        <header>
          <span class="kicker">Layers <span class="count">{draft.layers.length}</span></span>
          <button
            type="button"
            class="desk-btn"
            onclick={() => {
              const next = addLayer(draft!, { name: `Layer ${draft!.layers.length + 1}`, bounds: { x: 10, y: 10, w: 40, h: 40 }, source: sourceRef("empty", "empty", "Empty") });
              selectedId = next.layers[next.layers.length - 1]?.id ?? null;
              touch(next);
            }}
          ><Icon name="plus" size={14} /> Add layer</button>
        </header>
        <ul class="layers">
          {#each draft.layers as layer, n (layer.id)}
            <li class:on={selected?.id === layer.id} class:dim={!layer.visible}>
              <button type="button" class="layer-main" onclick={() => (selectedId = layer.id)}>
                <span class="layer-icon"><Icon name={SOURCE_ICON[layer.source.type] ?? "square"} size={14} /></span>
                <strong>{layer.name}</strong>
                <span class="layer-kind">{layer.source.type === "song" ? "lyrics" : layer.source.type}</span>
              </button>
              <button type="button" class="tool" title="Move up" aria-label={`Move ${layer.name} up`} disabled={n === 0} onclick={() => touch(reorderLayers(draft!, layer.id, -1))}><Icon name="chevron-up" size={14} /></button>
              <button type="button" class="tool" title="Move down" aria-label={`Move ${layer.name} down`} disabled={n === draft.layers.length - 1} onclick={() => touch(reorderLayers(draft!, layer.id, 1))}><Icon name="chevron-down" size={14} /></button>
              <button type="button" class="tool" class:off={!layer.visible} title={layer.visible ? "Hide" : "Show"} aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`} onclick={() => touch(layer.visible ? hideLayer(draft!, layer.id) : showLayer(draft!, layer.id))}><Icon name={layer.visible ? "eye" : "eye-off"} size={14} /></button>
              <button type="button" class="tool" class:lit={layer.locked} title={layer.locked ? "Unlock" : "Lock"} aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`} onclick={() => touch(setLayerLocked(draft!, layer.id, !layer.locked))}><Icon name={layer.locked ? "lock" : "lock-open"} size={14} /></button>
              <button type="button" class="tool" title="Duplicate" aria-label={`Duplicate ${layer.name}`} onclick={() => { const next = duplicateLayer(draft!, layer.id); selectedId = next.layers[next.layers.length - 1]?.id ?? selectedId; touch(next); }}><Icon name="copy" size={14} /></button>
              <button type="button" class="tool" title="Remove" aria-label={`Remove ${layer.name}`} onclick={() => { const next = removeLayer(draft!, layer.id); selectedId = next.layers.find((entry) => entry.id === selectedId)?.id ?? next.layers[0]?.id ?? null; touch(next); }}><Icon name="close" size={14} /></button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>

  <!-- Program and the selected layer's settings -->
  <aside class="side">
    <figure class="screen program" class:on-air={programLive}>
      <figcaption>
        <span class="kicker">{#if programLive}<span class="dot"></span>{/if}Program</span>
        <span class="hint">{programLive ? "Audience sees this" : "Nothing live"}</span>
      </figcaption>
      <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint="The audience sees nothing yet. Press LIVE (Space) to send Preview." /></div>
    </figure>

    {#if draft && selected}
      <section class="inspector" aria-label="Layer settings">
        <header><span class="kicker">Layer</span><span class="hint">{selected.name}</span></header>
        <div class="group-box">
          <label>Name <input aria-label="Layer name" value={selected.name} onchange={(event) => draft && selected && touch(renameLayer(draft, selected.id, event.currentTarget.value))} /></label>
          <label>Source
            <select aria-label="Layer source" value={selected.source.type} onchange={(event) => assign(event.currentTarget.value as SourceType)}>
              <option value="empty">Empty</option>
              <option value="scripture">Scripture</option>
              <option value="song">Lyrics</option>
              <option value="image">Image</option>
              <option value="camera">Camera</option>
              <option value="timer">Timer</option>
              <option value="lower-third">Lower third</option>
              <option value="text">Text</option>
            </select>
          </label>
        </div>

        <div class="group-box">
          <p class="box-title">Content</p>
          {#if selected.source.type === "scripture"}
            <input aria-label="Scripture reference" placeholder="Reference" bind:value={scriptureRef} oninput={(event) => { scriptureRef = event.currentTarget.value; applyScriptureCopy(); }} />
            <textarea aria-label="Scripture body" placeholder="Verse text" rows="3" bind:value={scriptureBody} oninput={(event) => { scriptureBody = event.currentTarget.value; applyScriptureCopy(); }}></textarea>
            <input aria-label="Scripture attribution" placeholder="Attribution" bind:value={scriptureAttr} oninput={(event) => { scriptureAttr = event.currentTarget.value; applyScriptureCopy(); }} />
            <button type="button" class="desk-btn" onclick={() => assign("scripture")}>Use the verse on the Presenter Desk</button>
          {:else if selected.source.type === "song"}
            <input aria-label="Lyrics label" placeholder="Section" bind:value={songLabel} oninput={(event) => { songLabel = event.currentTarget.value; applySongCopy(); }} />
            <textarea aria-label="Lyrics body" placeholder="Lines" rows="4" bind:value={songBody} oninput={(event) => { songBody = event.currentTarget.value; applySongCopy(); }}></textarea>
            <button type="button" class="desk-btn" onclick={() => assign("song")}>Use the lyrics on Preview</button>
          {:else if selected.source.type === "camera"}
            <p class="note">{session.cameraNote || "Pick the camera for this region."}</p>
            <div class="chips">
              {#each session.cameras as camera (camera.deviceId)}
                <button type="button" class="chip" class:on={selected.source.payload.deviceId === camera.deviceId} onclick={() => touch(assignLayerSource(draft!, selected.id, sourceRef("camera", camera.deviceId, camera.label, { deviceId: camera.deviceId, label: camera.label })))}>{camera.label}</button>
              {/each}
            </div>
          {:else if selected.source.type === "image"}
            {#if !session.media.some((asset) => asset.kind === "image")}
              <p class="note">No images yet. Import them in the Production Desk's Media panel.</p>
            {/if}
            <div class="chips">
              {#each session.media.filter((asset) => asset.kind === "image") as asset (asset.id)}
                <button
                  type="button"
                  class="chip"
                  class:on={selected.source.id === asset.id}
                  onclick={() => {
                    const imageUrl = mediaUrl(asset);
                    if (!imageUrl || !draft || !selected) return;
                    touch(assignLayerSource(draft, selected.id, sourceRef("image", asset.id, asset.name, { imageUrl })));
                  }}
                >{asset.name}</button>
              {/each}
            </div>
          {:else if selected.source.type === "lower-third"}
            <input aria-label="Lower third title" placeholder="Title" bind:value={lowerTitle} onchange={() => { const template = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === selected.source.payload.templateId) ?? LOWER_THIRD_TEMPLATES[0]!; if (draft && selected) touch(applyLowerThirdTemplate(draft, selected.id, template, lowerTitle, lowerSubtitle)); }} />
            <input aria-label="Lower third subtitle" placeholder="Subtitle" bind:value={lowerSubtitle} onchange={() => { const template = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === selected.source.payload.templateId) ?? LOWER_THIRD_TEMPLATES[0]!; if (draft && selected) touch(applyLowerThirdTemplate(draft, selected.id, template, lowerTitle, lowerSubtitle)); }} />
            <div class="chips">
              {#each LOWER_THIRD_TEMPLATES as template (template.id)}
                <button type="button" class="chip" class:on={selected.source.payload.templateId === template.id} onclick={() => applyLowerThird(template)}>{template.name}</button>
              {/each}
            </div>
          {:else if selected.source.type === "text"}
            <input aria-label="Announcement heading" placeholder="Heading" bind:value={textHeading} oninput={(event) => { textHeading = event.currentTarget.value; assign("text"); }} />
            <textarea aria-label="Announcement body" placeholder="Body" rows="4" bind:value={textBody} oninput={(event) => { textBody = event.currentTarget.value; assign("text"); }}></textarea>
          {:else if selected.source.type === "timer"}
            <label>Label <input aria-label="Timer label" bind:value={timerLabel} onchange={() => assign("timer")} /></label>
            <label>Mode
              <select aria-label="Timer mode" bind:value={timerMode} onchange={() => assign("timer")}>
                <option value="countdown">Countdown</option>
                <option value="countup">Count up</option>
                <option value="clock">Clock</option>
                <option value="target">Target time</option>
              </select>
            </label>
            {#if timerMode === "countdown" || timerMode === "countup"}
              <label>Minutes <input type="number" min="1" max="180" bind:value={timerMinutes} onchange={() => assign("timer")} /></label>
            {/if}
            {#if timerMode === "target"}
              <label>At <input type="time" aria-label="Target time" bind:value={timerClock} onchange={() => assign("timer")} /></label>
            {/if}
          {:else}
            <p class="note">Choose a source above to fill this region.</p>
          {/if}
          {#if ["scripture", "song", "text", "lower-third", "timer", "clock"].includes(selected.source.type)}
            <TextStyleEditor style={parseTextStyle(selected.source.payload.style)} onchange={(style) => { if (draft && selected) touch(setLayerStyle(draft, selected.id, style)); }} />
          {/if}
        </div>

        <div class="group-box">
          <p class="box-title">Position {#if selected.locked}<span class="hint">· locked</span>{/if}</p>
          <div class="grid4">
            <label>X <input type="number" min="0" max="100" aria-label="X" disabled={selected.locked} value={Math.round(selected.bounds.x * 10) / 10} oninput={(event) => setBound("x", Number(event.currentTarget.value))} /></label>
            <label>Y <input type="number" min="0" max="100" aria-label="Y" disabled={selected.locked} value={Math.round(selected.bounds.y * 10) / 10} oninput={(event) => setBound("y", Number(event.currentTarget.value))} /></label>
            <label>W <input type="number" min="1" max="100" aria-label="W" disabled={selected.locked} value={Math.round(selected.bounds.w * 10) / 10} oninput={(event) => setBound("w", Number(event.currentTarget.value))} /></label>
            <label>H <input type="number" min="1" max="100" aria-label="H" disabled={selected.locked} value={Math.round(selected.bounds.h * 10) / 10} oninput={(event) => setBound("h", Number(event.currentTarget.value))} /></label>
          </div>
          <div class="grid2">
            <label>Opacity % <input type="number" min="0" max="100" aria-label="Layer opacity" value={Math.round(selected.opacity * 100)} oninput={(event) => setOpacity(Number(event.currentTarget.value))} /></label>
            <label>Fit
              <select aria-label="Layer fit" value={selected.fit} onchange={(event) => draft && selected && touch(setLayerFit(draft, selected.id, event.currentTarget.value as "contain" | "cover" | "fill"))}>
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
            </label>
          </div>
        </div>

        <details class="group-box">
          <summary class="box-title">Motion</summary>
          <div class="grid2">
            <label>Entrance
              <select aria-label="Layer entrance" value={selected.animation.entrance} onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { entrance: event.currentTarget.value as LayerAnimationKind }))}>
                {#each ANIMATIONS as [value, label] (value)}<option {value}>{label}</option>{/each}
              </select>
            </label>
            <label>Exit
              <select aria-label="Layer exit" value={selected.animation.exit} onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { exit: event.currentTarget.value as LayerAnimationKind }))}>
                {#each ANIMATIONS as [value, label] (value)}<option {value}>{label}</option>{/each}
              </select>
            </label>
            <label>Duration ms
              <input type="number" min="0" max="2000" step="50" aria-label="Layer animation duration" value={selected.animation.durationMs} oninput={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { durationMs: Number(event.currentTarget.value) }))} />
            </label>
            <label>Easing
              <select aria-label="Layer easing" value={selected.animation.easing} onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { easing: event.currentTarget.value as LayerAnimation["easing"] }))}>
                <option value="ease-out">Ease out</option>
                <option value="ease">Ease</option>
                <option value="ease-in">Ease in</option>
                <option value="linear">Linear</option>
              </select>
            </label>
          </div>
        </details>

        <div class="clears">
          <button type="button" class="desk-btn ghost" onclick={() => draft && touch(clearLowerThird(draft))}>Clear overlay</button>
          <button type="button" class="desk-btn ghost" onclick={() => draft && touch(clearTimer(draft))}>Clear timer</button>
        </div>
      </section>
    {:else}
      <p class="side-empty">Select a layer to edit its source, position and motion.</p>
    {/if}
  </aside>
</section>

<style>
  .looks-desk {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(280px, 360px);
    gap: var(--gap, 10px);
  }
  .editor, .side {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel, 12px);
    overflow: auto;
  }
  input, select, textarea {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-control, 8px);
    background: var(--field);
    color: var(--ink);
    font: inherit;
  }
  input, select { height: 32px; padding: 0 10px; }
  textarea { width: 100%; padding: 8px 10px; resize: vertical; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); }
  .kicker { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .hint { font-size: 11px; color: var(--muted); }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  .count { opacity: 0.7; }
  .tool { display: grid; place-items: center; width: 26px; height: 26px; flex: none; border: 0; border-radius: 6px; background: none; color: var(--muted); }
  .tool:hover:not(:disabled) { background: var(--field); color: var(--ink); }
  .tool:disabled { opacity: 0.3; }
  .tool.off { color: var(--muted); opacity: 0.6; }
  .tool.lit { color: var(--accent); }
  .armed { color: var(--live) !important; background: color-mix(in srgb, var(--live) 15%, transparent) !important; }

  /* Library */
  .lib-scroll { overflow: auto; min-height: 0; padding: 0 10px 14px; display: flex; flex-direction: column; gap: 6px; }
  .group { margin: 8px 4px 2px; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }
  .group span { margin-left: 4px; opacity: 0.8; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); color: var(--ink); font: inherit; text-align: left; }
  .tile:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .tile.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .schema { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 4px; background: #000; overflow: hidden; }
  .schema { background: var(--panel) !important; }
  .schema i { position: absolute; box-sizing: border-box; border: 1.5px solid var(--field); border-radius: 3px; background: color-mix(in srgb, var(--muted) 28%, transparent); }
  .schema i.main { background: color-mix(in srgb, var(--accent) 30%, transparent); }
  .tile:hover .schema i.main, .tile.on .schema i.main { background: color-mix(in srgb, var(--accent) 55%, transparent); }
  .tile-name { font-size: 11px; font-weight: 600; line-height: 1.25; }
  .tile-wrap { position: relative; display: grid; }
  .tile-delete { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: color-mix(in srgb, #000 55%, transparent); color: #fff; opacity: 0; cursor: pointer; }
  .tile-wrap:hover .tile-delete, .tile-delete:focus-visible, .tile-delete.armed { opacity: 1; }
  .tile-delete.armed { background: var(--live); }
  .layout-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 8px; }
  .layout-chips button { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .layout-chips button.on { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
  .empty { margin: 0 4px; font-size: 12px; color: var(--muted); }
  .saved { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .saved li { display: flex; align-items: center; gap: 2px; padding-right: 4px; border: 1px solid transparent; border-radius: var(--radius-control, 8px); }
  .saved li:hover { background: var(--field); }
  .saved li.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
  .saved-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; }
  .saved-main strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .saved-main span { font-size: 11px; color: var(--muted); }

  /* Editor */
  .look-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none; }
  .look-name { flex: 1 1 200px; height: 36px; font-size: 16px; font-weight: 650; }
  .inline { flex-direction: row; align-items: center; gap: 6px; }
  .ms { width: 80px; }
  .head-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .primary-soft { border-color: var(--accent); color: var(--accent); }
  .empty-head p { margin: 0; font-size: 13px; color: var(--muted); }
  .empty-head b { color: var(--ink); }
  .edit-frame, .screen { margin: 0; flex: none; border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); border-radius: var(--radius-control, 8px); background: var(--field); overflow: hidden; }
  .swap-sides { display: inline-flex; align-items: center; gap: 6px; flex: none; margin-left: auto; height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .swap-sides:hover { border-color: var(--accent); }
  .edit-frame figcaption, .screen figcaption { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 4px 10px; border-bottom: 1px solid var(--line); }
  .edit-frame .kicker { color: var(--accent); }
  .monitor { container-type: inline-size; background: #000; }
  .preview-edit { position: relative; overflow: hidden; }
  .preview-edit :global(.ratio) { position: relative; }
  .layers-panel { display: flex; flex-direction: column; gap: 6px; flex: none; }
  .layers-panel > header { display: flex; align-items: center; justify-content: space-between; }
  .layers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .layers li { display: flex; align-items: center; gap: 2px; padding-right: 4px; border: 1px solid transparent; border-radius: var(--radius-control, 8px); }
  .layers li:hover { background: var(--field); }
  .layers li.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
  .layers li.dim .layer-main { opacity: 0.5; }
  .layer-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; }
  .layer-icon { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--field); color: var(--muted); flex: none; }
  .layer-main strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .layer-kind { font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); }

  /* Side */
  .screen.program { border-color: color-mix(in srgb, var(--live) 45%, var(--line)); }
  .screen.program .kicker { color: var(--live); }
  .screen.program.on-air { border-color: var(--live); box-shadow: 0 0 0 1px var(--live), 0 0 18px color-mix(in srgb, var(--live) 25%, transparent); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--live); box-shadow: 0 0 6px var(--live); }
  .inspector { display: flex; flex-direction: column; gap: 10px; }
  .inspector > header { display: flex; align-items: center; gap: 8px; }
  .group-box { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--field); }
  .group-box input, .group-box select, .group-box textarea { background: var(--panel); }
  .box-title { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0; color: var(--muted); cursor: default; }
  details.group-box > summary { cursor: pointer; }
  details.group-box[open] > summary { margin-bottom: 8px; }
  .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--ink); font: inherit; font-size: 12px; }
  .chip:hover { border-color: color-mix(in srgb, var(--ink) 30%, var(--line)); }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .clears { display: flex; gap: 6px; flex-wrap: wrap; }
  .side-empty { margin: 0; font-size: 12px; color: var(--muted); }

  /* Canvas frames */
  .layer-frame { position: absolute; box-sizing: border-box; border: 1px dashed color-mix(in srgb, var(--accent) 55%, transparent); cursor: move; z-index: 2; }
  .layer-frame.on { border: 2px solid var(--accent); }
  .layer-frame:focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; }
  .frame-label { position: absolute; left: 0; top: 0; padding: 1px 6px; border-radius: 0 0 4px 0; background: var(--accent); color: var(--on-accent); font-size: 10px; font-weight: 700; white-space: nowrap; pointer-events: none; }
  .handle { position: absolute; width: 10px; height: 10px; padding: 0; border: 2px solid #fff; border-radius: 2px; background: var(--accent); }
  .handle.n { top: -6px; left: 50%; margin-left: -5px; cursor: ns-resize; }
  .handle.s { bottom: -6px; left: 50%; margin-left: -5px; cursor: ns-resize; }
  .handle.e { right: -6px; top: 50%; margin-top: -5px; cursor: ew-resize; }
  .handle.w { left: -6px; top: 50%; margin-top: -5px; cursor: ew-resize; }
  .handle.ne { top: -6px; right: -6px; cursor: nesw-resize; }
  .handle.nw { top: -6px; left: -6px; cursor: nwse-resize; }
  .handle.se { bottom: -6px; right: -6px; cursor: nwse-resize; }
  .handle.sw { bottom: -6px; left: -6px; cursor: nesw-resize; }

  @media (max-width: 1280px) {
    .looks-desk { grid-template-columns: auto minmax(0, 1fr) minmax(260px, 300px); }
  }
</style>
