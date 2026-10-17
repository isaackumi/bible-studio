<script lang="ts">
  import ArrowLeftRight from "@lucide/svelte/icons/arrow-left-right";
  import AudioLines from "@lucide/svelte/icons/audio-lines";
  import Bell from "@lucide/svelte/icons/bell";
  import Book from "@lucide/svelte/icons/book";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Cast from "@lucide/svelte/icons/cast";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Church from "@lucide/svelte/icons/church";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
  import Clapperboard from "@lucide/svelte/icons/clapperboard";
  import Columns2 from "@lucide/svelte/icons/columns-2";
  import Focus from "@lucide/svelte/icons/focus";
  import Folder from "@lucide/svelte/icons/folder";
  import FolderLock from "@lucide/svelte/icons/folder-lock";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Pencil from "@lucide/svelte/icons/pencil";
  import PanelsTopLeft from "@lucide/svelte/icons/panels-top-left";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Gauge from "@lucide/svelte/icons/gauge";
  import Image from "@lucide/svelte/icons/image";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import List from "@lucide/svelte/icons/list";
  import Maximize2 from "@lucide/svelte/icons/maximize-2";
  import Mic from "@lucide/svelte/icons/mic";
  import MicOff from "@lucide/svelte/icons/mic-off";
  import Minus from "@lucide/svelte/icons/minus";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Moon from "@lucide/svelte/icons/moon";
  import Music from "@lucide/svelte/icons/music";
  import Play from "@lucide/svelte/icons/play";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Scissors from "@lucide/svelte/icons/scissors";
  import Square from "@lucide/svelte/icons/square";
  import Palette from "@lucide/svelte/icons/palette";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import Plus from "@lucide/svelte/icons/plus";
  import Presentation from "@lucide/svelte/icons/presentation";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import SwatchBook from "@lucide/svelte/icons/swatch-book";
  import User from "@lucide/svelte/icons/user";
  import X from "@lucide/svelte/icons/x";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Lock from "@lucide/svelte/icons/lock";
  import LockOpen from "@lucide/svelte/icons/lock-open";
  import type { Component } from "svelte";

  const ICONS: Record<string, Component<{ size?: number; strokeWidth?: number }>> = {
    pew: Church,
    obs: Clapperboard,
    outputs: Monitor,
    themes: SwatchBook,
    look: Palette,
    alerts: Bell,
    help: CircleQuestionMark,
    settings: Settings,
    note: Music,
    mic: Mic,
    "mic-off": MicOff,
    wave: Search,
    book: BookOpen,
    bible: Book,
    columns: Columns2,
    "chevron-left": ChevronLeft,
    "chevron-right": ChevronRight,
    "chevron-down": ChevronDown,
    expand: Maximize2,
    church: Church,
    layout: LayoutGrid,
    keys: Keyboard,
    cast: Cast,
    screens: Monitor,
    stage: Presentation,
    lyrics: Music,
    media: Image,
    logo: Image,
    audio: AudioLines,
    files: Folder,
    speed: Gauge,
    refresh: RefreshCw,
    user: User,
    key: KeyRound,
    close: X,
    plus: Plus,
    minus: Minus,
    play: Play,
    scissors: Scissors,
    square: Square,
    moon: Moon,
    reset: RotateCcw,
    studio: LayoutGrid,
    list: List,
    transition: ArrowLeftRight,
    library: PanelLeft,
    queue: List,
    focus: Focus,
    eye: Eye,
    "eye-off": EyeOff,
    grip: GripVertical,
    lock: Lock,
    "lock-open": LockOpen,
    folder: Folder,
    "folder-open": FolderOpen,
    "folder-lock": FolderLock,
    more: Ellipsis,
    pencil: Pencil,
    view: PanelsTopLeft,
  };

  let { name, size = 16 }: { name: string; size?: number } = $props();

  const Mark = $derived(ICONS[name]);
</script>

{#if Mark}
  <span class="icon" aria-hidden="true">
    <Mark {size} strokeWidth={1.75} />
  </span>
{/if}

<style>
  .icon { display: contents; }
</style>
