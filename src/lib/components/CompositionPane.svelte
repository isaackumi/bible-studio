<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../app/session.svelte";
  import {
    applyLowerThirdTemplate,
    assignLayerSource,
    clearLowerThird,
    COMPOSITION_TEMPLATES,
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
    clearTimer,
    LOWER_THIRD_TEMPLATES,
    reorderLayers,
    resizeLayer,
    restoreComposition,
    showLayer,
    sourceRef,
    type Composition,
    type SourceType,
  } from "../domain/composition";
  import { mediaUrl } from "../db/api";
  import Screen from "./Screen.svelte";

  let draft = $state<Composition | null>(null);
  let selectedId = $state<string | null>(null);
  let lowerTitle = $state("Pastor");
  let lowerSubtitle = $state("Speaker");
  let timerMinutes = $state(10);
  let timerLabel = $state("Service starts in");
  let timerMode = $state<"countdown" | "countup" | "clock">("countdown");
  let textHeading = $state("Welcome");
  let textBody = $state("Please join us after the service.");

  const saved = $derived(session.workspace.compositions.map((entry) => restoreComposition(entry)));
  const selected = $derived(draft?.layers.find((layer) => layer.id === selectedId) ?? draft?.layers[0] ?? null);

  onMount(() => {
    void session.loadCameras();
  });

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

  function assign(type: SourceType) {
    if (!draft || !selected) return;
    if (type === "scripture") {
      const passage = scriptureFromDesk();
      touch(
        assignLayerSource(
          draft,
          selected.id,
          sourceRef("scripture", passage.reference, passage.reference, {
            reference: passage.reference,
            body: passage.body,
            attribution: passage.attribution,
            verse: String(passage.verse),
          }),
        ),
      );
      return;
    }
    if (type === "song") {
      const lyrics = lyricsFromDesk();
      touch(
        assignLayerSource(
          draft,
          selected.id,
          sourceRef("song", lyrics.label, lyrics.label, {
            label: lyrics.label,
            body: lyrics.lines.join("\n"),
          }),
        ),
      );
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
          }),
        ),
      );
      return;
    }
    if (type === "lower-third") {
      const template = LOWER_THIRD_TEMPLATES[0]!;
      touch(applyLowerThirdTemplate(draft, selected.id, template, lowerTitle, lowerSubtitle));
      return;
    }
    if (type === "text") {
      touch(assignText(draft, selected.id, textHeading, textBody));
      return;
    }
    touch(assignLayerSource(draft, selected.id, sourceRef("empty", "empty", "Empty")));
  }

  function setBound(key: "x" | "y" | "w" | "h", value: number) {
    if (!draft || !selected) return;
    touch(resizeLayer(draft, selected.id, { ...selected.bounds, [key]: value }));
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
        <ul class="layers">
          {#each draft.layers as layer (layer.id)}
            <li>
              <button type="button" class:on={selected?.id === layer.id} onclick={() => (selectedId = layer.id)}>
                <strong>{layer.name}</strong>
                <span>{layer.source.type}{layer.visible ? "" : " · hidden"}</span>
              </button>
              <span class="row">
                <button type="button" onclick={() => touch(reorderLayers(draft!, layer.id, -1))}>Up</button>
                <button type="button" onclick={() => touch(reorderLayers(draft!, layer.id, 1))}>Down</button>
                <button type="button" onclick={() => touch(layer.visible ? hideLayer(draft!, layer.id) : showLayer(draft!, layer.id))}>{layer.visible ? "Hide" : "Show"}</button>
              </span>
            </li>
          {/each}
        </ul>
        {#if selected}
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
            <label>X <input type="number" min="0" max="100" value={selected.bounds.x} oninput={(event) => setBound("x", Number(event.currentTarget.value))} /></label>
            <label>Y <input type="number" min="0" max="100" value={selected.bounds.y} oninput={(event) => setBound("y", Number(event.currentTarget.value))} /></label>
            <label>W <input type="number" min="1" max="100" value={selected.bounds.w} oninput={(event) => setBound("w", Number(event.currentTarget.value))} /></label>
            <label>H <input type="number" min="1" max="100" value={selected.bounds.h} oninput={(event) => setBound("h", Number(event.currentTarget.value))} /></label>
          </div>
          {#if selected.source.type === "camera"}
            <p class="camera-note">{session.cameraNote || "Camera pixels stay on Preview. LIVE still sends the camera card."}</p>
            {#each session.cameras as camera (camera.deviceId)}
              <button type="button" onclick={() => touch(assignLayerSource(draft!, selected.id, sourceRef("camera", camera.deviceId, camera.label, { deviceId: camera.deviceId, label: camera.label })))}>{camera.label}</button>
            {/each}
          {/if}
          {#if selected.source.type === "lower-third"}
            <input aria-label="Lower third title" placeholder="Title" bind:value={lowerTitle} onchange={() => assign("lower-third")} />
            <input aria-label="Lower third subtitle" placeholder="Subtitle" bind:value={lowerSubtitle} onchange={() => assign("lower-third")} />
            <div class="templates">
              {#each LOWER_THIRD_TEMPLATES as template (template.id)}
                <button type="button" onclick={() => touch(applyLowerThirdTemplate(draft!, selected.id, template, lowerTitle, lowerSubtitle))}>{template.name}</button>
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
              </select>
            </label>
            {#if timerMode !== "clock"}
              <label>Minutes <input type="number" min="1" max="180" bind:value={timerMinutes} onchange={() => assign("timer")} /></label>
            {/if}
          {/if}
          <div class="song-actions">
            <button type="button" onclick={() => draft && session.previewLook(draft)}>Preview</button>
            <button type="button" onclick={() => draft && touch(clearLowerThird(draft))}>Clear overlay</button>
            <button type="button" onclick={() => draft && touch(clearTimer(draft))}>Clear timer</button>
            <button type="button" onclick={() => draft && session.saveLook(draft)}>Save look</button>
            <button type="button" onclick={() => draft && session.addLookToService(draft.id, draft.name)}>Queue</button>
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
            <button type="button" onclick={() => session.deleteLook(look.id)}>Delete</button>
          </li>
        {/each}
      </ul>
    </div>
    <aside class="song-stage">
      <header><span class="kicker">Preview</span></header>
      <div class="monitor"><Screen model={session.live.preview.model} stream={session.cameraStream} sourceId={session.live.preview.sourceId} cameraFeedId={session.cameraFeedId} surface="preview" /></div>
      <header><span class="kicker program">{#if session.output.online}<span class="pip on"></span>{/if}Program</span></header>
      <div class="monitor"><Screen model={session.live.program.model} /></div>
    </aside>
  </div>
</section>

<style>
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
</style>
