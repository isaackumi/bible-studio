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
    lookMultiCamera,
    setLayerStyle,
    hideLayer,
    instantiateTemplate,
    lookCameraLowerThird,
    lookCameraCountdown,
    lookScriptureCamera,
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

  const saved = $derived(session.workspace.compositions.map((entry) => restoreComposition(entry)));
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
    const template = COMPOSITION_TEMPLATES.find((entry) => entry.id === id);
    if (!template) return;
    draft = instantiateTemplate(template, template.name);
    selectedId = draft.layers[0]?.id ?? null;
    session.previewLook(draft);
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

<section class="pb-songs">
  <div class="song-desk">
    <div class="song-editor">
      <h1>Looks</h1>
      <p>Choose a layout, assign sources, then Preview. LIVE still sends Program.</p>
      <div class="templates">
        {#each COMPOSITION_TEMPLATES as template (template.id)}
          <button type="button" class:on={draft && !saved.some((entry) => entry.id === draft?.id) && draft.name === template.name} onclick={() => void openTemplate(template.id)}>{template.name}</button>
        {/each}
      </div>
      {#if draft}
        <label>Name
          <input
            aria-label="Look name"
            value={draft.name}
            onchange={(event) => touch(renameComposition(draft!, event.currentTarget.value))}
          />
        </label>
        <div class="bounds">
          <label>Transition
            <select
              aria-label="Look transition"
              value={draft.transition.type}
              onchange={(event) =>
                draft &&
                touch(
                  setCompositionTransition(draft, {
                    type: event.currentTarget.value === "cut" ? "cut" : "fade",
                    ms: draft.transition.ms,
                  }),
                )}
            >
              <option value="fade">Fade</option>
              <option value="cut">Cut</option>
            </select>
          </label>
          {#if draft.transition.type === "fade"}
            <label>Transition ms
              <input
                type="number"
                min="0"
                max="2000"
                step="50"
                aria-label="Look transition duration"
                value={draft.transition.ms}
                oninput={(event) =>
                  draft &&
                  touch(setCompositionTransition(draft, { type: "fade", ms: Number(event.currentTarget.value) }))}
              />
            </label>
          {/if}
        </div>
        <ul class="layers">
          {#each draft.layers as layer (layer.id)}
            <li>
              <button type="button" class:on={selected?.id === layer.id} onclick={() => (selectedId = layer.id)}>
                <strong>{layer.name}</strong>
                <span>{layer.source.type}{layer.visible ? "" : " · hidden"}{layer.locked ? " · locked" : ""}</span>
              </button>
              <span class="row">
                <button type="button" onclick={() => touch(reorderLayers(draft!, layer.id, -1))}>Up</button>
                <button type="button" onclick={() => touch(reorderLayers(draft!, layer.id, 1))}>Down</button>
                <button type="button" onclick={() => touch(layer.visible ? hideLayer(draft!, layer.id) : showLayer(draft!, layer.id))}>{layer.visible ? "Hide" : "Show"}</button>
                <button type="button" onclick={() => touch(setLayerLocked(draft!, layer.id, !layer.locked))}>{layer.locked ? "Unlock" : "Lock"}</button>
                <button
                  type="button"
                  onclick={() => {
                    const next = duplicateLayer(draft!, layer.id);
                    selectedId = next.layers[next.layers.length - 1]?.id ?? selectedId;
                    touch(next);
                  }}
                >Duplicate</button>
                <button
                  type="button"
                  onclick={() => {
                    const next = removeLayer(draft!, layer.id);
                    selectedId = next.layers.find((entry) => entry.id === selectedId)?.id ?? next.layers[0]?.id ?? null;
                    touch(next);
                  }}
                >Remove</button>
              </span>
            </li>
          {/each}
        </ul>
        <button
          type="button"
          onclick={() => {
            const next = addLayer(draft!, {
              name: `Layer ${draft!.layers.length + 1}`,
              bounds: { x: 10, y: 10, w: 40, h: 40 },
              source: sourceRef("empty", "empty", "Empty"),
            });
            selectedId = next.layers[next.layers.length - 1]?.id ?? null;
            touch(next);
          }}
        >Add layer</button>
        {#if selected}
          <label>Layer name
            <input
              aria-label="Layer name"
              value={selected.name}
              onchange={(event) => draft && selected && touch(renameLayer(draft, selected.id, event.currentTarget.value))}
            />
          </label>
          <label>Source
            <select
              aria-label="Layer source"
              value={selected.source.type}
              onchange={(event) => assign(event.currentTarget.value as SourceType)}
              oninput={(event) => assign(event.currentTarget.value as SourceType)}
            >
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
          <div class="bounds">
            <label>X <input type="number" min="0" max="100" aria-label="X" disabled={selected.locked} value={selected.bounds.x} oninput={(event) => setBound("x", Number(event.currentTarget.value))} /></label>
            <label>Y <input type="number" min="0" max="100" aria-label="Y" disabled={selected.locked} value={selected.bounds.y} oninput={(event) => setBound("y", Number(event.currentTarget.value))} /></label>
            <label>W <input type="number" min="1" max="100" aria-label="W" disabled={selected.locked} value={selected.bounds.w} oninput={(event) => setBound("w", Number(event.currentTarget.value))} /></label>
            <label>H <input type="number" min="1" max="100" aria-label="H" disabled={selected.locked} value={selected.bounds.h} oninput={(event) => setBound("h", Number(event.currentTarget.value))} /></label>
            <label>Opacity <input type="number" min="0" max="100" aria-label="Layer opacity" value={Math.round(selected.opacity * 100)} oninput={(event) => setOpacity(Number(event.currentTarget.value))} /></label>
            <label>Fit
              <select
                aria-label="Layer fit"
                value={selected.fit}
                onchange={(event) => draft && selected && touch(setLayerFit(draft, selected.id, event.currentTarget.value as "contain" | "cover" | "fill"))}
                oninput={(event) => draft && selected && touch(setLayerFit(draft, selected.id, event.currentTarget.value as "contain" | "cover" | "fill"))}
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
            </label>
            <label>Entrance
              <select
                aria-label="Layer entrance"
                value={selected.animation.entrance}
                onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { entrance: event.currentTarget.value as LayerAnimationKind }))}
                oninput={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { entrance: event.currentTarget.value as LayerAnimationKind }))}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="dissolve">Dissolve</option>
                <option value="slide-up">Slide up</option>
                <option value="slide-down">Slide down</option>
                <option value="slide-left">Slide left</option>
                <option value="slide-right">Slide right</option>
              </select>
            </label>
            <label>Exit
              <select
                aria-label="Layer exit"
                value={selected.animation.exit}
                onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { exit: event.currentTarget.value as LayerAnimationKind }))}
                oninput={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { exit: event.currentTarget.value as LayerAnimationKind }))}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="dissolve">Dissolve</option>
                <option value="slide-up">Slide up</option>
                <option value="slide-down">Slide down</option>
                <option value="slide-left">Slide left</option>
                <option value="slide-right">Slide right</option>
              </select>
            </label>
            <label>Anim ms
              <input
                type="number"
                min="0"
                max="2000"
                step="50"
                aria-label="Layer animation duration"
                value={selected.animation.durationMs}
                oninput={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { durationMs: Number(event.currentTarget.value) }))}
              />
            </label>
            <label>Easing
              <select
                aria-label="Layer easing"
                value={selected.animation.easing}
                onchange={(event) =>
                  draft &&
                  selected &&
                  touch(setLayerAnimation(draft, selected.id, { easing: event.currentTarget.value as LayerAnimation["easing"] }))}
                oninput={(event) =>
                  draft &&
                  selected &&
                  touch(setLayerAnimation(draft, selected.id, { easing: event.currentTarget.value as LayerAnimation["easing"] }))}
              >
                <option value="ease-out">Ease out</option>
                <option value="ease">Ease</option>
                <option value="ease-in">Ease in</option>
                <option value="linear">Linear</option>
              </select>
            </label>
          </div>
          {#if selected.source.type === "scripture"}
            <input
              aria-label="Scripture reference"
              placeholder="Reference"
              bind:value={scriptureRef}
              oninput={(event) => {
                scriptureRef = event.currentTarget.value;
                applyScriptureCopy();
              }}
            />
            <textarea
              aria-label="Scripture body"
              placeholder="Verse text"
              rows="3"
              bind:value={scriptureBody}
              oninput={(event) => {
                scriptureBody = event.currentTarget.value;
                applyScriptureCopy();
              }}
            ></textarea>
            <input
              aria-label="Scripture attribution"
              placeholder="Attribution"
              bind:value={scriptureAttr}
              oninput={(event) => {
                scriptureAttr = event.currentTarget.value;
                applyScriptureCopy();
              }}
            />
            <button type="button" onclick={() => assign("scripture")}>Use current verse</button>
          {/if}
          {#if selected.source.type === "song"}
            <input
              aria-label="Lyrics label"
              placeholder="Section"
              bind:value={songLabel}
              oninput={(event) => {
                songLabel = event.currentTarget.value;
                applySongCopy();
              }}
            />
            <textarea
              aria-label="Lyrics body"
              placeholder="Lines"
              rows="4"
              bind:value={songBody}
              oninput={(event) => {
                songBody = event.currentTarget.value;
                applySongCopy();
              }}
            ></textarea>
            <button type="button" onclick={() => assign("song")}>Use current lyrics</button>
          {/if}
          {#if selected.source.type === "camera"}
            <p class="camera-note">{session.cameraNote || "Camera pixels stay on Preview. LIVE still sends the camera card."}</p>
            {#each session.cameras as camera (camera.deviceId)}
              <button type="button" onclick={() => touch(assignLayerSource(draft!, selected.id, sourceRef("camera", camera.deviceId, camera.label, { deviceId: camera.deviceId, label: camera.label })))}>{camera.label}</button>
            {/each}
          {/if}
          {#if selected.source.type === "image"}
            <p class="camera-note">Pick a library image for Preview. LIVE still sends Program.</p>
            {#if !session.media.some((asset) => asset.kind === "image")}
              <p class="camera-note">No media in the library yet.</p>
            {/if}
            {#each session.media.filter((asset) => asset.kind === "image") as asset (asset.id)}
              <button
                type="button"
                onclick={() => {
                  const imageUrl = mediaUrl(asset);
                  if (!imageUrl || !draft || !selected) return;
                  touch(assignLayerSource(draft, selected.id, sourceRef("image", asset.id, asset.name, { imageUrl })));
                }}
              >{asset.name}</button>
            {/each}
          {/if}
          {#if selected.source.type === "lower-third"}
            <input
              aria-label="Lower third title"
              placeholder="Title"
              bind:value={lowerTitle}
              onchange={() => {
                const template = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === selected.source.payload.templateId) ?? LOWER_THIRD_TEMPLATES[0]!;
                if (draft && selected) touch(applyLowerThirdTemplate(draft, selected.id, template, lowerTitle, lowerSubtitle));
              }}
            />
            <input
              aria-label="Lower third subtitle"
              placeholder="Subtitle"
              bind:value={lowerSubtitle}
              onchange={() => {
                const template = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === selected.source.payload.templateId) ?? LOWER_THIRD_TEMPLATES[0]!;
                if (draft && selected) touch(applyLowerThirdTemplate(draft, selected.id, template, lowerTitle, lowerSubtitle));
              }}
            />
            <div class="templates">
              {#each LOWER_THIRD_TEMPLATES as template (template.id)}
                <button type="button" onclick={() => applyLowerThird(template)}>{template.name}</button>
              {/each}
            </div>
          {/if}
          {#if selected.source.type === "text"}
            <input
              aria-label="Announcement heading"
              placeholder="Heading"
              bind:value={textHeading}
              oninput={(event) => {
                textHeading = event.currentTarget.value;
                assign("text");
              }}
            />
            <textarea
              aria-label="Announcement body"
              placeholder="Body"
              rows="4"
              bind:value={textBody}
              oninput={(event) => {
                textBody = event.currentTarget.value;
                assign("text");
              }}
            ></textarea>
          {/if}
          {#if selected.source.type === "timer"}
            <label>Label <input aria-label="Timer label" bind:value={timerLabel} onchange={() => assign("timer")} /></label>
            <label>Mode
              <select
                aria-label="Timer mode"
                bind:value={timerMode}
                onchange={() => assign("timer")}
                oninput={() => assign("timer")}
              >
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
          {/if}
          {#if ["scripture", "song", "text", "lower-third", "timer", "clock"].includes(selected.source.type)}
            <TextStyleEditor
              style={parseTextStyle(selected.source.payload.style)}
              onchange={(style) => {
                if (draft && selected) touch(setLayerStyle(draft, selected.id, style));
              }}
            />
          {/if}
          <div class="song-actions">
            <button type="button" onclick={() => draft && session.previewLook(draft)}>Preview</button>
            <button type="button" onclick={() => draft && touch(clearLowerThird(draft))}>Clear overlay</button>
            <button type="button" onclick={() => draft && touch(clearTimer(draft))}>Clear timer</button>
            <button type="button" onclick={() => draft && session.saveLook(draft)}>Save look</button>
            <button
              type="button"
              onclick={() => {
                if (!draft) return;
                const copy = duplicateLook(draft);
                draft = copy;
                selectedId = copy.layers[0]?.id ?? null;
                session.saveLook(copy);
                session.previewLook(copy);
              }}
            >Duplicate look</button>
            <button type="button" onclick={() => draft && void session.addLookToService(draft)}>Queue</button>
          </div>
        {/if}
      {/if}
    </div>
    <div class="song-library">
      <h1>Saved</h1>
      {#if saved.length === 0}
        <p class="song-empty">No saved looks yet.</p>
      {/if}
      <ul class="song-list">
        {#each saved as look (look.id)}
          <li>
            <button type="button" onclick={() => openSaved(look)}>
              <strong>{look.name}</strong>
              <span>{look.layers.length} layers</span>
            </button>
            <button
              type="button"
              onclick={() => {
                const copy = duplicateLook(look);
                session.saveLook(copy);
                openSaved(copy);
              }}
            >Duplicate</button>
            <button type="button" onclick={() => void session.addLookToService(look)}>Queue</button>
            <button
              type="button"
              onclick={() => {
                session.deleteLook(look.id);
                if (draft?.id === look.id) {
                  draft = null;
                  selectedId = null;
                }
              }}
            >Delete</button>
          </li>
        {/each}
      </ul>
    </div>
    <aside class="song-stage">
      <header><span class="kicker">Preview</span></header>
      <div
        class="monitor preview-edit"
        bind:this={previewFrame}
        role="region"
        aria-label="Composition preview editor"
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      >
        <Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds}>
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
                  onpointerdown={(event) => startDrag(layer.id, "move", event)}
                  onkeydown={(event) => {
                    const step = event.shiftKey ? 5 : 1;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      touch(applyLayerDrag(draft!, layer.id, "move", { dx: -step, dy: 0 }));
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      touch(applyLayerDrag(draft!, layer.id, "move", { dx: step, dy: 0 }));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      touch(applyLayerDrag(draft!, layer.id, "move", { dx: 0, dy: -step }));
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      touch(applyLayerDrag(draft!, layer.id, "move", { dx: 0, dy: step }));
                    }
                  }}
                >
                  {#if selected?.id === layer.id && !layer.locked}
                    {#each dragHandles as handle (handle)}
                      <button
                        type="button"
                        class="handle {handle}"
                        aria-label="Resize {layer.name} {handle}"
                        onpointerdown={(event) => startDrag(layer.id, handle, event)}
                      ></button>
                    {/each}
                  {/if}
                </div>
              {/each}
            {/if}
          {/snippet}
        </Screen>
      </div>
      <header><span class="kicker program">{#if session.output.online}<span class="pip on"></span>{/if}Program</span></header>
      <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} /></div>
    </aside>
  </div>
</section>

<style>
  .pb-songs {
    height: 100%;
    min-height: 0;
    margin: 0;
    border: 1px solid var(--line);
    border-radius: 12px;
    background-color: var(--desk);
    background-image: radial-gradient(var(--line) 1.1px, transparent 1.2px);
    background-size: 18px 18px;
    overflow: auto;
  }
  .song-desk {
    width: min(920px, 100%);
    margin: 28px auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(220px, 0.8fr);
    gap: 18px;
    padding: 0 18px 24px;
  }
  .song-editor, .song-library {
    background: rgba(20, 20, 20, 0.92);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .song-editor h1 { margin: 4px 0 0; font-size: 20px; font-weight: 650; }
  .song-editor p, .song-empty { margin: 0; color: var(--muted); line-height: 1.45; }
  .song-editor input, .song-editor textarea, .song-editor select {
    width: 100%;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--field);
    color: var(--ink);
    padding: 8px 10px;
  }
  .song-stage { display: flex; flex-direction: column; gap: 8px; min-height: 420px; }
  .song-stage header { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  .song-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .song-actions button, .song-list li button:last-child {
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    padding: 0 12px;
  }
  .song-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .song-list li { display: flex; flex-wrap: wrap; gap: 8px; }
  .song-list li button:first-child {
    flex: 1;
    text-align: left;
    border: 1px solid var(--line);
    background: var(--field);
    color: white;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .song-list span { color: var(--muted); font-size: 12px; }
  .templates, .row, .bounds, .song-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .templates button, .row button { font-size: 12px; }
  .layers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .layers li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
  .layers button { text-align: left; }
  .bounds label, label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); }
  .bounds input, select, input, textarea { min-width: 0; }
  textarea { width: 100%; }
  .on { outline: 1px solid var(--accent); }
  .camera-note { margin: 0; font-size: 12px; color: var(--muted); }
  .preview-edit { position: relative; overflow: hidden; }
  .preview-edit :global(.ratio) { position: relative; }
  .layer-frame {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
    cursor: move;
    z-index: 2;
  }
  .layer-frame.on { border-color: var(--accent); }
  .handle {
    position: absolute;
    width: 8px;
    height: 8px;
    padding: 0;
    border: 1px solid var(--desk);
    border-radius: 1px;
    background: var(--accent);
  }
  .handle.n { top: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }
  .handle.s { bottom: -4px; left: 50%; margin-left: -4px; cursor: ns-resize; }
  .handle.e { right: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
  .handle.w { left: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
  .handle.ne { top: -4px; right: -4px; cursor: nesw-resize; }
  .handle.nw { top: -4px; left: -4px; cursor: nwse-resize; }
  .handle.se { bottom: -4px; right: -4px; cursor: nwse-resize; }
  .handle.sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
  @media (max-width: 980px) {
    .song-desk { grid-template-columns: 1fr; }
  }
</style>
