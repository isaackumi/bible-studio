// The audience screen on a TV browser over the church's own Wi-Fi: the desk's local server (the one
// the phone remote uses) serves the app at /?lan=1 and the newest Program, so a TV with a browser
// shows the screen without an HDMI cable or the internet. Words, songs, scripture and pictures
// from Media show; a video stays on this computer.

import { invoke } from "@tauri-apps/api/core";
import { api } from "../db/api";
import { lanSafe } from "../display/lan-safe";
import { presentQr } from "../domain/overlays";
import { t } from "../i18n/core";
import { session } from "./session.svelte";

const KEY = "cs-wifi-display";

class WifiDisplay {
  /** Program is going to TV browsers on this Wi-Fi. */
  on = $state(false);
  /** The address a TV opens (http://<this computer>:17891/?lan=1). */
  url = $state("");
  /** TV browsers showing the screen now. */
  watching = $state(0);
  error = $state("");
  private stopWatching: (() => void) | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | undefined;
  private countTimer: ReturnType<typeof setInterval> | undefined;
  private sent = "";

  /** Turned on before: on again after a restart, so a TV left on picks the screen back up. */
  resume = () => {
    try {
      if (localStorage.getItem(KEY) === "1") void this.start();
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
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Not remembered: fine.
    }
    // Every change to Program goes out (the newest wins); a TV asks for it about once a second.
    this.stopWatching = $effect.root(() => {
      $effect(() => {
        const canvas = session.outputCanvas();
        const frame = JSON.stringify({ model: lanSafe(session.live.program.model), aspect: canvas.width / canvas.height });
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

  private send = async (frame: string) => {
    if (!this.on || frame === this.sent) return;
    try {
      await invoke("lan_screen", { frame });
      this.sent = frame;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  };

  /** The address as a QR code on Preview, to scan with a TV or tablet (or type in). */
  qrOnPreview = () => {
    if (!this.url) return;
    session.previewModel(presentQr({ theme: session.theme(), data: this.url, style: "rounded", dark: "#000000", light: "#ffffff", caption: `${t("Open on the TV's browser")} · ${this.url.replace(/^https?:\/\//, "")}` }), "wifi-display:qr");
  };
}

export const wifiDisplay = new WifiDisplay();
