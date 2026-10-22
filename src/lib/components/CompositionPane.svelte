<script lang="ts">
  import TextWords from "./TextWords.svelte";
  import InlineWords from "./InlineWords.svelte";
  import { parseRich, type RichDoc } from "../domain/rich-text";
  import TextStyleEditor from "./TextStyleEditor.svelte";
  import { parseTextStyle } from "../domain/text-style";
  import { onMount, untrack } from "svelte";
  import { parseReference } from "../bible/reference";
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
    setCompositionEdges,
    setCompositionEdgeColor,
    DEFAULT_EDGES,
    EDGE_STYLES,
    type CompositionEdges,
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
  import FavoriteStar from "./FavoriteStar.svelte";
  import { favoritesFirst } from "../domain/favorites";
  import LibrarySidebar from "./pew/LibrarySidebar.svelte";
  import { msg, t, tn } from "../i18n/core";

  let draft = $state<Composition | null>(null);
  let selectedId = $state<string | null>(null);
  let lowerTitle = $state("Pastor");
  let lowerSubtitle = $state("Speaker");
  /** The lower third's title and subtitle formatted (the Formatted tab); null while Simple. */
  let lowerTitleRich = $state<RichDoc | null>(null);
  let lowerSubtitleRich = $state<RichDoc | null>(null);
  let timerMinutes = $state(10);
  let timerLabel = $state("Service starts in");
  let timerMode = $state<TimerMode>("countdown");
  let timerClock = $state("10:30");
  let textHeading = $state("Welcome");
  let textBody = $state("Please join us after the service.");
  /** Formatted words (the Formatted tab); null while the Simple tab is in use. */
  let textRich = $state<RichDoc | null>(null);
  let scriptureRef = $state("John 3:16");
  let scriptureBody = $state("For God so loved the world.");
  let scriptureAttr = $state("KJV");
  let songLabel = $state("Verse 1");
  let songBody = $state("Holy, holy, holy");
  let previewFrame = $state<HTMLDivElement | undefined>();
  let drag = $state<{ layerId: string; handle: LayerDragHandle; startX: number; startY: number; origin: Composition } | null>(null);
  const dragHandles: LayerDragHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const ANIMATIONS: [LayerAnimationKind, string][] = [
    ["none", msg("None")],
    ["fade", msg("Fade")],
    ["dissolve", msg("Dissolve")],
    ["slide-up", msg("Slide up")],
    ["slide-down", msg("Slide down")],
    ["slide-left", msg("Slide left")],
    ["slide-right", msg("Slide right")],
  ];

  const saved = $derived(
    favoritesFirst(
      session.workspace.compositions.map((entry) => restoreComposition(entry)),
      (look) => session.isFavorite("looks", look.id),
    ),
  );

  type LayoutGroup = "all" | "favorites" | "scripture" | "lyrics" | "camera" | "timer";
  const LAYOUT_GROUPS: [LayoutGroup, string][] = [["all", msg("All")], ["favorites", msg("Favorites")], ["scripture", msg("Scripture")], ["lyrics", msg("Lyrics")], ["camera", msg("Cameras")], ["timer", msg("Timers")]];
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
  const starredLayout = (template: CompositionTemplate) => session.isFavorite("layouts", template.id);
  const layouts = $derived(
    favoritesFirst(
      COMPOSITION_TEMPLATES.filter((template) => layoutGroup === "all" || (layoutGroup === "favorites" ? starredLayout(template) : groupsOf(template).has(layoutGroup))),
      starredLayout,
    ),
  );
  const customLayouts = $derived(favoritesFirst(session.workspace.customLayouts, starredLayout));

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
      textRich = layer.source.payload.mode === "rich" ? parseRich(layer.source.payload.rich) : null;
    } else if (layer.source.type === "lower-third") {
      lowerTitle = layer.source.payload.title || lowerTitle;
      lowerSubtitle = layer.source.payload.subtitle ?? lowerSubtitle;
      lowerTitleRich = parseRich(layer.source.payload.titleRich);
      lowerSubtitleRich = parseRich(layer.source.payload.subtitleRich);
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

  // Find a verse for a scripture region without leaving the look.
  let verseQuery = $state("");
  let verseNote = $state("");
  let verseTranslation = $state(untrack(() => session.translations[0]?.id ?? ""));
  let finding = $state(false);

  async function findVerse(reference: string, translationId = verseTranslation) {
    if (!draft || !selected || !reference.trim()) return;
    finding = true;
    verseNote = "";
    try {
      const fields = await session.scriptureFields(reference, translationId);
      if (!fields || fields.type !== "scripture" || !draft || !selected) {
        verseNote = t("Nothing found for “{reference}”. Try a reference like John 3:16 or Psalm 23:1-3.", { reference: reference.trim() });
        return false;
      }
      scriptureRef = fields.reference;
      scriptureBody = fields.body;
      scriptureAttr = fields.attribution;
      verseQuery = fields.reference;
      if (translationId) verseTranslation = translationId;
      touch(assignScripture(draft, selected.id, { reference: fields.reference, body: fields.body, attribution: fields.attribution, verse: fields.verse, translationId }));
      return true;
    } catch (error) {
      verseNote = error instanceof Error ? error.message : t("That verse could not be loaded.");
      return false;
    } finally {
      finding = false;
    }
  }

  /** Next or previous verse (a range moves by its own length). */
  async function stepVerse(direction: 1 | -1) {
    const parsed = parseReference(scriptureRef, session.books);
    if (!parsed?.startVerse) {
      verseNote = t("Find a verse first.");
      return;
    }
    const length = (parsed.endVerse ?? parsed.startVerse) - parsed.startVerse + 1;
    const from = parsed.startVerse + direction * length;
    if (from < 1) {
      verseNote = t("That is the first verse of the chapter.");
      return;
    }
    const to = from + length - 1;
    const range = length > 1 ? `${from}-${to}` : `${from}`;
    const found = await findVerse(`${parsed.bookName} ${parsed.chapter}:${range}`);
    if (found === false && direction === 1) verseNote = t("That is the end of the chapter.");
  }

  // Lyrics regions: pick a song and a section from the library.
  let lookSongId = $state("");
  const lookSong = $derived(session.songs.find((song) => song.id === lookSongId));

  function useSongSection(sectionId: string) {
    const section = lookSong?.sections.find((entry) => entry.id === sectionId);
    if (!draft || !selected || !lookSong || !section) return;
    songLabel = section.label;
    songBody = section.lines.filter((line) => line.trim()).join("\n");
    touch(assignSong(draft, selected.id, { label: section.label, body: songBody }));
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
  const programLive = $derived(!session.programHeld && session.live.program.model.layout !== "empty" && session.live.program.model.layout !== "black");
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
    lowerTitleRich = null;
    lowerSubtitleRich = null;
    touch(applyLowerThirdTemplate(draft, selected.id, template, copy.title, copy.subtitle));
  }

  /** The lower third's words changed: same template, new (maybe formatted) title and subtitle. */
  function setLowerWords() {
    if (!draft || !selected) return;
    const template = LOWER_THIRD_TEMPLATES.find((entry) => entry.id === selected.source.payload.templateId) ?? LOWER_THIRD_TEMPLATES[0]!;
    touch(applyLowerThirdTemplate(draft, selected.id, template, lowerTitle, lowerSubtitle, { title: lowerTitleRich, subtitle: lowerSubtitleRich }));
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
      touch(assignText(draft, selected.id, textHeading, textBody, textRich));
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

  const EDGE_NAMES: Record<CompositionEdges, () => string> = {
    touch: () => t("None"),
    line: () => t("Line"),
    gap: () => t("Gap"),
    framed: () => t("Framed"),
  };
  const EDGE_HINTS: Record<CompositionEdges, () => string> = {
    touch: () => t("Regions meet with no line"),
    line: () => t("A clear line around each region"),
    gap: () => t("A clean gap between regions and around the screen"),
    framed: () => t("Each region on its own panel, with a gap"),
  };
  const EDGE_COLORS = ["#ffffff", "#000000"];
</script>

<section class="looks-desk">
  <!-- Library: templates and saved looks -->
  <LibrarySidebar title={t("Looks")} icon="layout" count={saved.length} storageKey="looks">
    <div class="lib-scroll">
      {#if customLayouts.length > 0}
        <p class="group">{t("Your layouts")} <span>{customLayouts.length}</span></p>
        <div class="tiles">
          {#each customLayouts as template (template.id)}
            <div class="tile-wrap">
              <span class="tile-star"><FavoriteStar on={starredLayout(template)} label={template.name} onclick={() => session.toggleFavorite("layouts", template.id)} size={12} /></span>
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
                aria-label={armedDelete === template.id ? t("Confirm delete {name}", { name: template.name }) : t("Delete {name}", { name: template.name })}
                title={armedDelete === template.id ? t("Click again to delete") : t("Delete layout")}
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

      <p class="group">{t("Start from a layout")}</p>
      <div class="layout-chips" role="radiogroup" aria-label={t("Show layouts")}>
        {#each LAYOUT_GROUPS as [id, label] (id)}
          <button type="button" role="radio" aria-checked={layoutGroup === id} class:on={layoutGroup === id} onclick={() => (layoutGroup = id)}>{t(label)}</button>
        {/each}
      </div>
      <div class="tiles">
        {#each layouts as template (template.id)}
          <div class="tile-wrap">
          <span class="tile-star"><FavoriteStar on={starredLayout(template)} label={template.name} onclick={() => session.toggleFavorite("layouts", template.id)} size={12} /></span>
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
          </div>
        {:else}
          <p class="empty">{t("No favorite layouts yet. Star a layout to keep it here.")}</p>
        {/each}
      </div>

      <p class="group">{t("Saved")} <span>{saved.length}</span></p>
      {#if saved.length === 0}<p class="empty">{t("Save a look to reuse it in any service.")}</p>{/if}
      <ul class="saved">
        {#each saved as look (look.id)}
          <li class:on={draft?.id === look.id}>
            <FavoriteStar on={session.isFavorite("looks", look.id)} label={look.name} onclick={() => session.toggleFavorite("looks", look.id)} size={13} />
            <button type="button" class="saved-main" onclick={() => openSaved(look)}>
              <strong>{look.name}</strong>
              <span>{tn(look.layers.length, "{n} layer", "{n} layers")}{look.locked ? ` · ${t("locked")}` : ""}</span>
            </button>
            <button type="button" class="tool" title={t("Duplicate")} aria-label={t("Duplicate {name}", { name: look.name })} onclick={() => { const copy = duplicateLook(look); session.saveLook(copy); openSaved(copy); }}><Icon name="copy" size={14} /></button>
            <button type="button" class="tool" title={t("Add to service")} aria-label={t("Add {name} to the service", { name: look.name })} onclick={() => void session.pickServicePart(look.name).then((part) => { if (part) void session.addLookToService(look, part); })}><Icon name="queue" size={14} /></button>
            <button
              type="button"
              class="tool"
              class:armed={armedDelete === look.id}
              title={armedDelete === look.id ? t("Click again to delete") : t("Delete")}
              aria-label={armedDelete === look.id ? t("Confirm delete {name}", { name: look.name }) : t("Delete {name}", { name: look.name })}
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
        <input class="look-name" aria-label={t("Look name")} value={draft.name} onchange={(event) => touch(renameComposition(draft!, event.currentTarget.value))} />
        <label class="inline">
          <span>{t("Transition")}</span>
          <select
            aria-label={t("Look transition")}
            value={draft.transition.type}
            onchange={(event) => draft && touch(setCompositionTransition(draft, { type: event.currentTarget.value === "cut" ? "cut" : "fade", ms: draft.transition.ms }))}
          >
            <option value="fade">{t("Fade")}</option>
            <option value="cut">{t("Cut")}</option>
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
              aria-label={t("Look transition duration")}
              value={draft.transition.ms}
              oninput={(event) => draft && touch(setCompositionTransition(draft, { type: "fade", ms: Number(event.currentTarget.value) }))}
            />
            <span>{t("ms")}</span>
          </label>
        {/if}
        <div class="head-actions">
          <button type="button" class="desk-btn" onclick={() => draft && session.previewLook(draft)}><Icon name="play" size={14} /> {t("Preview")}</button>
          <button type="button" class="desk-btn primary-soft" onclick={() => draft && session.saveLook(draft)}>{t("Save look")}</button>
          <button type="button" class="desk-btn ghost icon" title={t("Save this arrangement as a layout to start from again")} aria-label={t("Save as layout")} onclick={() => draft && session.saveLookLayout(draft)}><Icon name="layout" size={14} /></button>
          <button
            type="button"
            class="desk-btn ghost icon"
            title={t("Duplicate look")}
            aria-label={t("Duplicate look")}
            onclick={() => {
              if (!draft) return;
              const copy = duplicateLook(draft);
              draft = copy;
              selectedId = copy.layers[0]?.id ?? null;
              session.saveLook(copy);
              session.previewLook(copy);
            }}
          ><Icon name="copy" size={14} /></button>
          <button type="button" class="desk-btn ghost icon" title={t("Add to service")} aria-label={t("Add to service")} onclick={() => { const look = draft; if (look) void session.pickServicePart(look.name).then((part) => { if (part) void session.addLookToService(look, part); }); }}><Icon name="queue" size={14} /></button>
        </div>
      </header>
    {:else}
      <header class="look-head empty-head">
        <p>{t("Pick a layout or a saved look. It goes to")} <b>{t("Preview")}</b> {t("to arrange;")} <b>{t("Go live")}</b> {t("shows it to the audience.")}</p>
      </header>
    {/if}

    <figure class="edit-frame">
      <figcaption>
        <span class="kicker">{t("Preview")}</span>
        {#if draft}
          <span class="edges-label" id="edges-label">{t("Edges")}</span>
          <div class="edges" role="radiogroup" aria-labelledby="edges-label">
            {#each EDGE_STYLES as value (value)}
              {@const on = (draft.edges ?? DEFAULT_EDGES) === value}
              <button
                type="button"
                role="radio"
                aria-checked={on}
                class:on
                disabled={draft.locked}
                title={EDGE_HINTS[value]()}
                onclick={() => draft && touch(setCompositionEdges(draft, value))}
              >
                <svg class="edge-glyph" viewBox="0 0 22 14" aria-hidden="true">
                  {#if value === "touch"}
                    <rect x="1" y="1" width="10" height="12" class="fill a" /><rect x="11" y="1" width="10" height="12" class="fill b" />
                  {:else if value === "line"}
                    <rect x="1" y="1" width="10" height="12" class="fill a" /><rect x="11" y="1" width="10" height="12" class="fill b" />
                    <rect x="1.75" y="1.75" width="8.5" height="10.5" class="stroke" /><rect x="11.75" y="1.75" width="8.5" height="10.5" class="stroke" />
                  {:else if value === "gap"}
                    <rect x="2.5" y="2.5" width="7.75" height="9" class="fill a" /><rect x="11.75" y="2.5" width="7.75" height="9" class="fill b" />
                  {:else}
                    <rect x="2.5" y="2.5" width="7.75" height="9" rx="2" class="fill a" /><rect x="11.75" y="2.5" width="7.75" height="9" rx="2" class="fill b" />
                    <rect x="2.5" y="2.5" width="7.75" height="9" rx="2" class="stroke thin" /><rect x="11.75" y="2.5" width="7.75" height="9" rx="2" class="stroke thin" />
                  {/if}
                </svg>
                <span>{EDGE_NAMES[value]()}</span>
              </button>
            {/each}
          </div>
          {#if (draft.edges ?? DEFAULT_EDGES) === "line" || (draft.edges ?? DEFAULT_EDGES) === "framed"}
            <div class="edge-colors" role="radiogroup" aria-label={t("Edge colour")}>
              {#each EDGE_COLORS as color (color)}
                <button
                  type="button"
                  role="radio"
                  class="swatch"
                  aria-checked={(draft.edgeColor ?? "#ffffff") === color}
                  aria-label={color === "#ffffff" ? t("White") : t("Black")}
                  title={color === "#ffffff" ? t("White") : t("Black")}
                  disabled={draft.locked}
                  style:background={color}
                  onclick={() => draft && touch(setCompositionEdgeColor(draft, color))}
                ></button>
              {/each}
              <label class="swatch custom" class:on={!EDGE_COLORS.includes(draft.edgeColor ?? "#ffffff")} title={t("Another colour")} style:background={EDGE_COLORS.includes(draft.edgeColor ?? "#ffffff") ? undefined : draft.edgeColor}>
                <input type="color" aria-label={t("Another colour")} disabled={draft.locked} value={draft.edgeColor ?? "#ffffff"} oninput={(event) => draft && touch(setCompositionEdgeColor(draft, event.currentTarget.value))} />
              </label>
            </div>
          {/if}
          <span class="help" title={t("Drag a layer to move it · drag a handle to resize · arrow keys nudge (Shift = 5%)")} aria-label={t("Drag a layer to move it · drag a handle to resize · arrow keys nudge (Shift = 5%)")}>?</span>
        {:else}
          <span class="hint">{t("Nothing to arrange yet")}</span>
        {/if}
        {#if draft && !draft.locked}
          <button type="button" class="swap-sides" title={t("Mirror the layout left to right")} onclick={() => touch(swapSides(draft!))}><Icon name="transition" size={14} /> {t("Swap sides")}</button>
        {/if}
      </figcaption>
      <div
        class="monitor preview-edit"
        bind:this={previewFrame}
        role="region"
        aria-label={t("Composition preview editor")}
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      >
        <Screen model={session.live.preview.model} sourceId={session.live.preview.sourceId} feeds={session.cameraFeeds} hint={t("Nothing on Preview yet. Pick a verse, song or slide.")}>
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
                  aria-label={t("Move {name}", { name: layer.name })}
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
                      <button type="button" class="handle {handle}" aria-label={t("Resize {name} {handle}", { name: layer.name, handle })} onpointerdown={(event) => startDrag(layer.id, handle, event)}></button>
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
      <section class="layers-panel" aria-label={t("Layers")}>
        <header>
          <span class="kicker">{t("Layers")} <span class="count">{draft.layers.length}</span></span>
          <button
            type="button"
            class="desk-btn"
            onclick={() => {
              const next = addLayer(draft!, { name: `Layer ${draft!.layers.length + 1}`, bounds: { x: 10, y: 10, w: 40, h: 40 }, source: sourceRef("empty", "empty", "Empty") });
              selectedId = next.layers[next.layers.length - 1]?.id ?? null;
              touch(next);
            }}
          ><Icon name="plus" size={14} /> {t("Add layer")}</button>
        </header>
        <ul class="layers">
          {#each draft.layers as layer, n (layer.id)}
            <li class:on={selected?.id === layer.id} class:dim={!layer.visible}>
              <button type="button" class="layer-main" onclick={() => (selectedId = layer.id)}>
                <span class="layer-icon"><Icon name={SOURCE_ICON[layer.source.type] ?? "square"} size={14} /></span>
                <strong>{layer.name}</strong>
                <span class="layer-kind">{layer.source.type === "song" ? "lyrics" : layer.source.type}</span>
              </button>
              <button type="button" class="tool" title={t("Move up")} aria-label={t("Move {name} up", { name: layer.name })} disabled={n === 0} onclick={() => touch(reorderLayers(draft!, layer.id, -1))}><Icon name="chevron-up" size={14} /></button>
              <button type="button" class="tool" title={t("Move down")} aria-label={t("Move {name} down", { name: layer.name })} disabled={n === draft.layers.length - 1} onclick={() => touch(reorderLayers(draft!, layer.id, 1))}><Icon name="chevron-down" size={14} /></button>
              <button type="button" class="tool" class:off={!layer.visible} title={layer.visible ? t("Hide") : t("Show")} aria-label={layer.visible ? t("Hide {name}", { name: layer.name }) : t("Show {name}", { name: layer.name })} onclick={() => touch(layer.visible ? hideLayer(draft!, layer.id) : showLayer(draft!, layer.id))}><Icon name={layer.visible ? "eye" : "eye-off"} size={14} /></button>
              <button type="button" class="tool" class:lit={layer.locked} title={layer.locked ? t("Unlock") : t("Lock")} aria-label={layer.locked ? t("Unlock {name}", { name: layer.name }) : t("Lock {name}", { name: layer.name })} onclick={() => touch(setLayerLocked(draft!, layer.id, !layer.locked))}><Icon name={layer.locked ? "lock" : "lock-open"} size={14} /></button>
              <button type="button" class="tool" title={t("Duplicate")} aria-label={t("Duplicate {name}", { name: layer.name })} onclick={() => { const next = duplicateLayer(draft!, layer.id); selectedId = next.layers[next.layers.length - 1]?.id ?? selectedId; touch(next); }}><Icon name="copy" size={14} /></button>
              <button type="button" class="tool" title={t("Remove")} aria-label={t("Remove {name}", { name: layer.name })} onclick={() => { const next = removeLayer(draft!, layer.id); selectedId = next.layers.find((entry) => entry.id === selectedId)?.id ?? next.layers[0]?.id ?? null; touch(next); }}><Icon name="close" size={14} /></button>
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
        <span class="kicker">{#if programLive}<span class="dot"></span>{/if}{t("Program")}</span>
        <span class="hint">{programLive ? t("Audience sees this") : t("Nothing live")}</span>
      </figcaption>
      <div class="monitor"><Screen model={session.live.program.model} sourceId={session.live.program.sourceId} feeds={session.cameraFeeds} hint={t("The audience sees nothing yet. Press LIVE (Space) to send Preview.")} /></div>
    </figure>

    {#if draft && selected}
      <section class="inspector" aria-label={t("Layer settings")}>
        <header><span class="kicker">{t("Layer")}</span><span class="hint">{selected.name}</span></header>
        <div class="group-box">
          <label>{t("Name")} <input aria-label={t("Layer name")} value={selected.name} onchange={(event) => draft && selected && touch(renameLayer(draft, selected.id, event.currentTarget.value))} /></label>
          <label>{t("Source")}
            <select aria-label={t("Layer source")} value={selected.source.type} onchange={(event) => assign(event.currentTarget.value as SourceType)}>
              <option value="empty">{t("Empty")}</option>
              <option value="scripture">{t("Scripture")}</option>
              <option value="song">{t("Lyrics")}</option>
              <option value="image">{t("Image")}</option>
              <option value="camera">{t("Camera")}</option>
              <option value="timer">{t("Timer")}</option>
              <option value="lower-third">{t("Lower third")}</option>
              <option value="text">{t("Text")}</option>
            </select>
          </label>
        </div>

        <div class="group-box">
          <p class="box-title">{t("Content")}</p>
          {#if selected.source.type === "scripture"}
            <form class="verse-find" onsubmit={(event) => { event.preventDefault(); void findVerse(verseQuery); }}>
              <label class="find-field">
                <Icon name="search" size={14} />
                <input aria-label={t("Find a verse")} placeholder={t("John 3:16, 1 Cor 13:4-7, Psalm 23")} bind:value={verseQuery} />
              </label>
              <div class="find-row">
                <select aria-label={t("Translation")} bind:value={verseTranslation}>
                  {#each session.translations as translation (translation.id)}<option value={translation.id}>{translation.abbreviation}</option>{/each}
                </select>
                <button type="submit" class="desk-btn primary-soft" disabled={!verseQuery.trim() || finding}>{finding ? t("Finding…") : t("Show")}</button>
              </div>
              {#if verseNote}<p class="note">{verseNote}</p>{/if}
            </form>
            <div class="verse-step">
              <button type="button" class="desk-btn ghost icon" aria-label={t("Previous verse")} title={t("Previous verse")} disabled={finding} onclick={() => void stepVerse(-1)}><Icon name="chevron-left" size={14} /></button>
              <strong title={scriptureRef}>{scriptureRef || t("No verse yet")}</strong>
              <button type="button" class="desk-btn ghost icon" aria-label={t("Next verse")} title={t("Next verse")} disabled={finding} onclick={() => void stepVerse(1)}><Icon name="chevron-right" size={14} /></button>
            </div>
            {#if session.workspace.favorites.passages.length > 0}
              <div class="chips" aria-label={t("Favorite verses")}>
                {#each session.workspace.favorites.passages.slice(0, 10) as item (`${item.bookOrd}:${item.chapter}:${item.startVerse}-${item.endVerse}`)}
                  <button type="button" class="chip" class:on={scriptureRef === item.reference} onclick={() => void findVerse(item.reference, item.translationId)}><span class="chip-star">★</span>{item.reference}</button>
                {/each}
              </div>
            {/if}
            <button type="button" class="desk-btn" onclick={() => assign("scripture")}>{t("Use the verse on the Presenter Desk")}</button>
            <details class="by-hand">
              <summary>{t("Edit the words by hand")}</summary>
              <input aria-label={t("Scripture reference")} placeholder={t("Reference")} bind:value={scriptureRef} oninput={(event) => { scriptureRef = event.currentTarget.value; applyScriptureCopy(); }} />
              <textarea aria-label={t("Scripture body")} placeholder={t("Verse text")} rows="3" bind:value={scriptureBody} oninput={(event) => { scriptureBody = event.currentTarget.value; applyScriptureCopy(); }}></textarea>
              <input aria-label={t("Scripture attribution")} placeholder={t("Attribution")} bind:value={scriptureAttr} oninput={(event) => { scriptureAttr = event.currentTarget.value; applyScriptureCopy(); }} />
            </details>
          {:else if selected.source.type === "song"}
            <select aria-label={t("Song")} value={lookSongId} onchange={(event) => (lookSongId = event.currentTarget.value)}>
              <option value="">{t("Pick a song…")}</option>
              {#each session.songsByFavorite as song (song.id)}<option value={song.id}>{session.isFavorite("songs", song.id) ? "★ " : ""}{song.title || t("Untitled song")}</option>{/each}
            </select>
            {#if lookSong}
              <div class="chips" aria-label={t("Song sections")}>
                {#each lookSong.sections as section (section.id)}
                  <button type="button" class="chip" class:on={songLabel === `${lookSong.title} — ${section.label}` || songLabel === section.label} onclick={() => useSongSection(section.id)}>{section.label}</button>
                {/each}
              </div>
            {/if}
            <input aria-label={t("Lyrics label")} placeholder={t("Section")} bind:value={songLabel} oninput={(event) => { songLabel = event.currentTarget.value; applySongCopy(); }} />
            <textarea aria-label={t("Lyrics body")} placeholder={t("Lines")} rows="4" bind:value={songBody} oninput={(event) => { songBody = event.currentTarget.value; applySongCopy(); }}></textarea>
            <button type="button" class="desk-btn" onclick={() => assign("song")}>{t("Use the lyrics on Preview")}</button>
          {:else if selected.source.type === "camera"}
            <p class="note">{session.cameraNote || t("Pick the camera for this region.")}</p>
            <div class="chips">
              {#each session.cameras as camera (camera.deviceId)}
                <button type="button" class="chip" class:on={selected.source.payload.deviceId === camera.deviceId} onclick={() => touch(assignLayerSource(draft!, selected.id, sourceRef("camera", camera.deviceId, camera.label, { deviceId: camera.deviceId, label: camera.label })))}>{camera.label}</button>
              {/each}
            </div>
          {:else if selected.source.type === "image"}
            {#if !session.media.some((asset) => asset.kind === "image")}
              <p class="note">{t("No images yet. Import them in the Production Desk's Media panel.")}</p>
            {/if}
            <div class="chips">
              {#each session.mediaByFavorite.filter((asset) => asset.kind === "image") as asset (asset.id)}
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
            <InlineWords text={lowerTitle} rich={lowerTitleRich} label={t("Lower third title")} placeholder={t("Title")} onchange={(words) => { lowerTitle = words.text; lowerTitleRich = words.rich; setLowerWords(); }} />
            <InlineWords text={lowerSubtitle} rich={lowerSubtitleRich} label={t("Lower third subtitle")} placeholder={t("Subtitle")} onchange={(words) => { lowerSubtitle = words.text; lowerSubtitleRich = words.rich; setLowerWords(); }} />
            <div class="chips">
              {#each LOWER_THIRD_TEMPLATES as template (template.id)}
                <button type="button" class="chip" class:on={selected.source.payload.templateId === template.id} onclick={() => applyLowerThird(template)}>{template.name}</button>
              {/each}
            </div>
          {:else if selected.source.type === "text"}
            <TextWords heading={textHeading} body={textBody} rich={textRich} onchange={(words) => { textHeading = words.heading; textBody = words.body; textRich = words.rich; assign("text"); }} />
          {:else if selected.source.type === "timer"}
            <label>{t("Label")} <input aria-label={t("Timer label")} bind:value={timerLabel} onchange={() => assign("timer")} /></label>
            <label>{t("Mode")}
              <select aria-label={t("Timer mode")} bind:value={timerMode} onchange={() => assign("timer")}>
                <option value="countdown">{t("Countdown")}</option>
                <option value="countup">{t("Count up")}</option>
                <option value="clock">{t("Clock")}</option>
                <option value="target">{t("Target time")}</option>
              </select>
            </label>
            {#if timerMode === "countdown" || timerMode === "countup"}
              <label>{t("Minutes")} <input type="number" min="1" max="180" bind:value={timerMinutes} onchange={() => assign("timer")} /></label>
            {/if}
            {#if timerMode === "target"}
              <label>{t("At")} <input type="time" aria-label={t("Target time")} bind:value={timerClock} onchange={() => assign("timer")} /></label>
            {/if}
          {:else}
            <p class="note">{t("Choose a source above to fill this region.")}</p>
          {/if}
          {#if ["scripture", "song", "text", "lower-third", "timer", "clock"].includes(selected.source.type)}
            <TextStyleEditor style={parseTextStyle(selected.source.payload.style)} onchange={(style) => { if (draft && selected) touch(setLayerStyle(draft, selected.id, style)); }} />
          {/if}
        </div>

        <div class="group-box">
          <p class="box-title">{t("Position")} {#if selected.locked}<span class="hint">{t("· locked")}</span>{/if}</p>
          <div class="grid4">
            <label>X <input type="number" min="0" max="100" aria-label="X" disabled={selected.locked} value={Math.round(selected.bounds.x * 10) / 10} oninput={(event) => setBound("x", Number(event.currentTarget.value))} /></label>
            <label>Y <input type="number" min="0" max="100" aria-label="Y" disabled={selected.locked} value={Math.round(selected.bounds.y * 10) / 10} oninput={(event) => setBound("y", Number(event.currentTarget.value))} /></label>
            <label>W <input type="number" min="1" max="100" aria-label="W" disabled={selected.locked} value={Math.round(selected.bounds.w * 10) / 10} oninput={(event) => setBound("w", Number(event.currentTarget.value))} /></label>
            <label>H <input type="number" min="1" max="100" aria-label="H" disabled={selected.locked} value={Math.round(selected.bounds.h * 10) / 10} oninput={(event) => setBound("h", Number(event.currentTarget.value))} /></label>
          </div>
          <div class="grid2">
            <label>{t("Opacity %")} <input type="number" min="0" max="100" aria-label={t("Layer opacity")} value={Math.round(selected.opacity * 100)} oninput={(event) => setOpacity(Number(event.currentTarget.value))} /></label>
            <label>{t("Fit")}
              <select aria-label={t("Layer fit")} value={selected.fit} onchange={(event) => draft && selected && touch(setLayerFit(draft, selected.id, event.currentTarget.value as "contain" | "cover" | "fill"))}>
                <option value="contain">{t("Contain")}</option>
                <option value="cover">{t("Cover")}</option>
                <option value="fill">{t("Fill")}</option>
              </select>
            </label>
          </div>
        </div>

        <details class="group-box">
          <summary class="box-title">{t("Motion")}</summary>
          <div class="grid2">
            <label>{t("Entrance")}
              <select aria-label={t("Layer entrance")} value={selected.animation.entrance} onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { entrance: event.currentTarget.value as LayerAnimationKind }))}>
                {#each ANIMATIONS as [value, label] (value)}<option {value}>{t(label)}</option>{/each}
              </select>
            </label>
            <label>{t("Exit")}
              <select aria-label={t("Layer exit")} value={selected.animation.exit} onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { exit: event.currentTarget.value as LayerAnimationKind }))}>
                {#each ANIMATIONS as [value, label] (value)}<option {value}>{t(label)}</option>{/each}
              </select>
            </label>
            <label>{t("Duration ms")}
              <input type="number" min="0" max="2000" step="50" aria-label={t("Layer animation duration")} value={selected.animation.durationMs} oninput={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { durationMs: Number(event.currentTarget.value) }))} />
            </label>
            <label>{t("Easing")}
              <select aria-label={t("Layer easing")} value={selected.animation.easing} onchange={(event) => draft && selected && touch(setLayerAnimation(draft, selected.id, { easing: event.currentTarget.value as LayerAnimation["easing"] }))}>
                <option value="ease-out">{t("Ease out")}</option>
                <option value="ease">{t("Ease")}</option>
                <option value="ease-in">{t("Ease in")}</option>
                <option value="linear">{t("Linear")}</option>
              </select>
            </label>
          </div>
        </details>

        <div class="clears">
          <button type="button" class="desk-btn ghost" onclick={() => draft && touch(clearLowerThird(draft))}>{t("Clear overlay")}</button>
          <button type="button" class="desk-btn ghost" onclick={() => draft && touch(clearTimer(draft))}>{t("Clear timer")}</button>
        </div>
      </section>
    {:else}
      <p class="side-empty">{t("Select a layer to edit its source, position and motion.")}</p>
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
  .tile-star { position: absolute; top: 4px; left: 4px; z-index: 1; border-radius: 6px; background: color-mix(in srgb, #000 55%, transparent); opacity: 0; }
  .tile-star :global(.fav-star) { width: 20px; height: 20px; color: #fff; }
  .tile-star :global(.fav-star.on) { color: #f5b301; }
  .tile-wrap:hover .tile-star, .tile-star:focus-within, .tile-star:has(:global(.fav-star.on)) { opacity: 1; }
  .tile-delete { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: color-mix(in srgb, #000 55%, transparent); color: #fff; opacity: 0; cursor: pointer; }
  .tile-wrap:hover .tile-delete, .tile-delete:focus-visible, .tile-delete.armed { opacity: 1; }
  .tile-delete.armed { background: var(--live); }
  .layout-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 8px; }
  .layout-chips button { height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 11px; font-weight: 650; text-transform: none; letter-spacing: normal; cursor: pointer; }
  .layout-chips button.on { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
  .empty { margin: 0 4px; font-size: 12px; color: var(--muted); }
  .tiles .empty { grid-column: 1 / -1; }
  .saved { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .saved li { display: flex; align-items: center; gap: 2px; padding-right: 4px; border: 1px solid transparent; border-radius: var(--radius-control, 8px); }
  .saved li:hover { background: var(--field); }
  .saved li.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
  .saved-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; }
  .saved-main strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .saved-main span { font-size: 11px; color: var(--muted); }

  /* Editor */
  .look-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: none; }
  .look-name { flex: 1 1 120px; min-width: 0; height: 32px; font-size: 15px; font-weight: 650; }
  .inline { flex-direction: row; align-items: center; gap: 6px; }
  .edges-label { margin-left: 6px; font-size: 11px; font-weight: 650; color: var(--muted); }
  .edges { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .edges button { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .edges button:hover:not(:disabled) { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .edges button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .edges button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent); }
  .edges button:disabled { cursor: default; opacity: 0.6; }
  .edge-glyph { width: 20px; height: 13px; flex: none; }
  .edge-glyph .fill { fill: color-mix(in srgb, currentColor 30%, transparent); }
  .edges button.on .edge-glyph .fill.a { fill: color-mix(in srgb, var(--accent) 70%, transparent); }
  .edges button.on .edge-glyph .fill.b { fill: color-mix(in srgb, currentColor 40%, transparent); }
  .edge-glyph .stroke { fill: none; stroke: currentColor; stroke-width: 1.5; }
  .edge-glyph .stroke.thin { stroke-width: 0.8; }
  .edge-colors { display: inline-flex; align-items: center; gap: 4px; }
  .swatch { position: relative; width: 18px; height: 18px; padding: 0; border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent); border-radius: 50%; cursor: pointer; overflow: hidden; }
  .swatch[aria-checked="true"], .swatch.custom.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 3.5px var(--accent); }
  .swatch.custom { background: conic-gradient(#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7, #f43f5e); }
  .swatch.custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
  .help { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--line); color: var(--muted); font-size: 11px; font-weight: 700; cursor: help; }
  .ms { width: 62px; }
  .head-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .primary-soft { border-color: var(--accent); color: var(--accent); }
  .empty-head p { margin: 0; font-size: 13px; color: var(--muted); }
  .empty-head b { color: var(--ink); }
  .edit-frame, .screen { margin: 0; flex: none; border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); border-radius: var(--radius-control, 8px); background: var(--field); overflow: hidden; }
  .swap-sides { display: inline-flex; align-items: center; gap: 6px; flex: none; margin-left: auto; height: 26px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--field); color: var(--ink); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .swap-sides:hover { border-color: var(--accent); }
  .edit-frame figcaption, .screen figcaption { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; min-height: 34px; padding: 4px 10px; border-bottom: 1px solid var(--line); }
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
  .chip-star { margin-right: 4px; color: #f5b301; }
  .verse-find { display: grid; gap: 6px; margin: 0; }
  .find-field { display: flex; flex-direction: row; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--panel); color: var(--muted); }
  .find-field:focus-within { border-color: var(--accent); }
  .find-field input { flex: 1; min-width: 0; width: auto; height: 100%; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; outline: none; }
  .find-row { display: flex; gap: 6px; }
  .find-row select { flex: 1; min-width: 0; }
  .verse-step { display: flex; align-items: center; gap: 4px; }
  .verse-step strong { flex: 1; min-width: 0; text-align: center; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .by-hand { display: grid; gap: 6px; }
  .by-hand summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  .by-hand[open] summary { margin-bottom: 4px; }
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
