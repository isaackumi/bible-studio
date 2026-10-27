// Saving an export (a support file, a CSV, the library): on the desktop through the system's Save
// window, so the operator chooses where it goes and sees that it went; in a browser as a download.
// The webview's own download link does nothing in the Windows app.

import { isDesktop } from "./runtime";

/** Save `data` as `name`. The path it went to (the name in a browser), or null when Save was cancelled. */
export async function saveFile(name: string, data: string | Uint8Array | ArrayBuffer | Blob, type: string): Promise<string | null> {
  if (!isDesktop()) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data as BlobPart], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: name, filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [] });
  if (!path) return null;
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_file", { path, data: Array.from(bytes) });
  return path;
}

/** The file's name from a saved path, for "Saved as …". */
export const savedName = (path: string) => path.split(/[\\/]/).pop() ?? path;
