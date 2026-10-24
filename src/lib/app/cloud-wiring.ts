// The sync engine wired to the session: the cloud's routes, the library's records, the Rust
// commands for files, and when this computer may sync at all. Loaded with the engine, on first
// use, so the desk's own bundle carries none of it.

import { invoke } from "@tauri-apps/api/core";
import { api } from "../db/api";
import { isDesktop } from "../platform/runtime";
import { cloudProtocol } from "../sync/protocol";
import { restoredNotice } from "../sync/notices";
import { CloudSync } from "./cloud.svelte";
import type { session as Session } from "./session.svelte";

export function wireCloud(session: typeof Session): CloudSync {
  const identity = session.cloudIdentity;
  return new CloudSync({
    protocol: cloudProtocol(identity),
    commands: {
      hash: (id) => invoke("cloud_hash", { id }),
      upload: (id, url) => invoke("cloud_upload", { id, url, ...identity() }),
      download: (url, row) => invoke("cloud_download", { url, token: identity().token, device: identity().device, id: row.id, name: row.name, kind: row.kind, ext: row.ext, createdAt: row.createdAt }),
      readState: () => invoke<string>("cloud_state_read"),
      writeState: (text) => invoke("cloud_state_write", { text }),
    },
    library: {
      collect: async () => ({ ...(await session.exportLibrary()), sermons: await api.sermonList(), workspace: session.workspace }),
      apply: {
        song: async (doc, id) => {
          await (doc ? api.songSave(doc) : api.songDelete(id));
          session.cloudWrote("songs");
        },
        service: async (doc, id) => {
          await (doc ? api.serviceSave(doc) : api.serviceDelete(id));
          session.cloudWrote("services");
        },
        sermon: async (doc, id) => {
          await (doc ? api.sermonSave(doc) : api.sermonDelete(id));
          session.cloudWrote("sermons");
        },
        theme: async (doc, id) => {
          await (doc ? api.themeSave(doc) : api.themeDelete(id));
          session.cloudWrote("themes");
        },
        workspace: session.patchWorkspace,
      },
      mediaIds: async () => new Set([...session.media, ...session.audioTracks].map((asset) => asset.id)),
    },
    gate: () => (!isDesktop() ? "off" : !session.signedIn ? "signedOut" : session.plan === "free" ? "free" : "ok"),
    now: () => Date.now(),
    name: () => identity().name,
    onRestored: (records) => {
      const said = restoredNotice(records);
      session.notify(said.title, { detail: said.detail, ms: 15_000 });
    },
  });
}
