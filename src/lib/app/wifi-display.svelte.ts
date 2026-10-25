// The audience screen on a TV browser over the church's own Wi-Fi: the desk's local server (the one
// the phone remote uses) serves the app at /?lan=1 and the newest Program, so a TV with a browser
// shows the screen without an HDMI cable or the internet. Words, songs, scripture and pictures
// from Media show; a video stays on this computer.

import { invoke } from "@tauri-apps/api/core";
import { serverCall, SITE_URL } from "../domain/billing";
import { api } from "../db/api";
import { lanSafe } from "../display/lan-safe";
import { WIFI_SCREEN } from "../display/screens";
import { presentQr } from "../domain/overlays";
import { t } from "../i18n/core";
import { session } from "./session.svelte";

const KEY = "cs-wifi-display";
/** This computer's TV link (church-studio…/tv/CODE) and the key that moves it. */
const LINK_KEY = "cs-tv-link";

class WifiDisplay {
  /** Program is going to TV browsers on this Wi-Fi. */
  on = $state(false);
  /** The address a TV opens (http://<this computer>:17891/?lan=1). */
  url = $state("");
  /** TV browsers showing the screen now. */
  watching = $state(0);
  error = $state("");
  /** The address to bookmark on the TV once: it follows this computer when its Wi-Fi address changes. */
  link = $state("");
  private stopWatching: (() => void) | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | undefined;
  private countTimer: ReturnType<typeof setInterval> | undefined;
  private sent = "";

  /** Turned on before: on again after a restart, so a TV left on picks the screen back up. */
  resume = () => {
    try {
      // On before, or a screen is a TV on the Wi-Fi (Settings › Screens): it needs the screen sent.
      if (localStorage.getItem(KEY) === "1" || (session.workspace.screens ?? []).some((screen) => screen.displayKey === WIFI_SCREEN)) void this.start();
    } catch {
      // Storage blocked: stays off.
    }
  };

  toggle = () => (this.on ? this.stop() : this.start());

  start = async () => {
    if (this.on) return;
    let status = await api.startRemoteLan();
    for (let i = 0; i < 8 && !status.listening; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      status = await api.remoteLanStatus();
    }
    if (!status.listening) {
      this.error = status.error || t("This computer is not on a network a TV can reach.");
      return;
    }
    this.error = "";
    this.url = `${new URL(status.url).origin}/?lan=1`;
    this.on = true;
    void this.refreshLink();
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Not remembered: fine.
    }
    // Every change to Program goes out (the newest wins); a TV asks for it about once a second.
    this.stopWatching = $effect.root(() => {
      $effect(() => {
        const canvas = session.outputCanvas();
        // Screens that are TVs on the Wi-Fi get their job too: each TV shows what its job lets through.
        const screens = session.screensForNow().filter((screen) => screen.displayKey === WIFI_SCREEN).map(({ id, role, also, between }) => ({ id, role, also, between }));
        const frame = JSON.stringify({ model: lanSafe(session.live.program.model), aspect: canvas.width / canvas.height, screens });
        clearTimeout(this.sendTimer);
        this.sendTimer = setTimeout(() => void this.send(frame), 120);
      });
    });
    this.countTimer = setInterval(() => void invoke<number>("lan_screen_watching").then((n) => (this.watching = n)).catch(() => {}), 3000);
  };

  stop = async () => {
    this.on = false;
    this.watching = 0;
    this.stopWatching?.();
    this.stopWatching = null;
    clearTimeout(this.sendTimer);
    clearInterval(this.countTimer);
    this.sent = "";
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Ignore.
    }
    await invoke("lan_screen", { frame: null }).catch(() => {});
  };

  /** Tell the server where this computer is on the Wi-Fi today, so the TV's bookmark still lands here. */
  private refreshLink = async () => {
    let saved: { code?: string; secret?: string } = {};
    try {
      saved = JSON.parse(localStorage.getItem(LINK_KEY) ?? "{}") as typeof saved;
    } catch {
      saved = {};
    }
    if (saved.code) this.link = `${SITE_URL}/tv/${saved.code}`;
    const answer = await serverCall<{ code: string; secret: string }>("/v1/tv", { url: this.url, ...saved });
    if (!answer.ok) return; // No internet: the direct address still works, and the link is updated next time.
    this.link = `${SITE_URL}/tv/${answer.data.code}`;
    try {
      localStorage.setItem(LINK_KEY, JSON.stringify(answer.data));
    } catch {
      // Not kept: a new link is made next time.
    }
  };

  private send = async (frame: string) => {
    if (!this.on || frame === this.sent) return;
    try {
      await invoke("lan_screen", { frame });
      this.sent = frame;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  };

  /** The address a TV opens: the whole screen, or one screen's (Settings › Screens) with its job. */
  urlFor = (screenId?: string) => (this.url && screenId ? `${this.url}&screen=${screenId}` : this.url);

  /** The link to bookmark (the same every time), for the whole screen or one screen; the direct address until it is known. */
  linkFor = (screenId?: string) => (this.link ? (screenId ? `${this.link}?screen=${screenId}` : this.link) : this.urlFor(screenId));

  /** The address as a QR code on Preview, to scan with a TV or tablet (or type in). */
  qrOnPreview = (screenId?: string) => {
    const url = this.linkFor(screenId);
    if (!url) return;
    session.previewModel(presentQr({ theme: session.theme(), data: url, style: "rounded", dark: "#000000", light: "#ffffff", caption: `${t("Open on the TV's browser")} · ${url.replace(/^https?:\/\//, "")}` }), `wifi-display:qr:${screenId ?? "all"}`);
  };
}

export const wifiDisplay = new WifiDisplay();
