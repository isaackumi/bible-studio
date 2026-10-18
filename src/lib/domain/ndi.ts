// NDI sources in scenes: the desktop app runs a small hub on this computer that receives NDI
// video and serves it as a picture stream any screen can show. Keep the port in step with
// HUB_PORT in src-tauri/src/ndi.rs.

export const NDI_HUB = "http://127.0.0.1:47129";

/** The picture stream for an NDI source, by its full NDI name ("MACHINE (Name)"). */
export function ndiStreamUrl(name: string): string {
  return `${NDI_HUB}/ndi/${encodeURIComponent(name)}.mjpg`;
}

/** "MACHINE (Camera 1)" → "Camera 1", for labels. */
export function ndiShortName(name: string): string {
  return name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;
}

/** The NDI sources on the network now; null when the hub is not running (no NDI, or a browser). */
export async function listNdiSources(fetcher: typeof fetch = fetch): Promise<string[] | null> {
  try {
    const response = await fetcher(`${NDI_HUB}/sources`, { cache: "no-store" });
    if (!response.ok) return null;
    const names: unknown = await response.json();
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : null;
  } catch {
    return null;
  }
}
