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
      download: (url, row, hash) => invoke("cloud_download", { url, token: identity().token, device: identity().device, id: row.id, name: row.name, kind: row.kind, ext: row.ext, createdAt: row.createdAt, hash }),
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
        // This computer's own version of a record the cloud already had: kept under a new id, marked.
        copy: async (col, doc, suffix) => {
          const record = doc as Record<string, unknown>;
          const id = crypto.randomUUID();
          const named = (field: "title" | "name") => ({ ...record, id, [field]: `${String(record[field] ?? "")} ${suffix}`.trim(), updatedAt: new Date().toISOString() });
          if (col === "song") await api.songSave(named("title") as never);
          else if (col === "service") await api.serviceSave(named("name") as never);
          else if (col === "sermon") await api.sermonSave(named("title") as never);
          else if (col === "theme") await api.themeSave(named("name") as never);
          else {
            const field = "title" in record ? "title" : "name";
            session.patchWorkspace((workspace) => {
              const lists: Record<string, keyof typeof workspace> = { deck: "decks", composition: "compositions", game: "games", playlist: "playlists", template: "serviceTemplates", macro: "macros", overlay: "overlays", layout: "customLayouts", source: "sources" };
              const key = lists[col];
              if (!key) return workspace;
              return { ...workspace, [key]: [...(workspace[key] as unknown[]), named(field)] };
            });
          }
          session.cloudWrote(col === "song" ? "songs" : col === "service" ? "services" : col === "sermon" ? "sermons" : "themes");
        },
      },
      media: async () => new Map([...session.media, ...session.audioTracks].map((asset) => [asset.id, asset.kind])),
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
