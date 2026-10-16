import type { PresentationItem } from "./types";

function stem(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "").trim();
  return base || "Imported";
}

function extension(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename.trim().toLowerCase());
  return match?.[1] ?? "";
}

function slide(id: string, heading: string, body: string): PresentationItem {
  const title = heading.trim() || "Imported";
  return {
    id,
    kind: "slide",
    title,
    slide: { heading: title, body: body.replace(/\s+$/, "").replace(/^\s+/, ""), imageId: null },
  };
}

function slidesFromBlocks(filename: string, blocks: Array<{ heading: string; body: string }>, uid: () => string): PresentationItem[] {
  const fallback = stem(filename);
  const items = blocks
    .map((block) => slide(uid(), block.heading.trim() || fallback, block.body))
    .filter((item) => item.slide?.heading.trim() || item.slide?.body.trim());
  if (items.length === 0) throw new Error("This file has no content.");
  return items;
}

function splitMarkdown(text: string): Array<{ heading: string; body: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<{ heading: string; body: string }> = [];
  let heading = "";
  let body: string[] = [];
  const flush = () => {
    const packed = body.join("\n").trim();
    if (!heading && !packed) return;
    blocks.push({ heading, body: packed });
    heading = "";
    body = [];
  };
  for (const line of lines) {
    const atx = /^(#{1,6})\s+(.+)$/.exec(line);
    if (atx) {
      flush();
      heading = atx[2]?.trim() ?? "";
      continue;
    }
    body.push(line);
  }
  flush();
  return blocks;
}

export function importDocument(filename: string, text: string, uid: () => string = () => crypto.randomUUID()): PresentationItem[] {
  const ext = extension(filename);
  if (ext === "ppt" || ext === "pptx" || ext === "key") {
    throw new Error("Save the presentation as PDF (File → Export → PDF), then import the PDF.");
  }
  if (ext === "pdf") {
    throw new Error("Import PDF files with the PDF slide importer.");
  }
  if (ext === "json") {
    throw new Error("Use Import library for Church Studio JSON files.");
  }
  if (ext && ext !== "txt" && ext !== "text" && ext !== "md" && ext !== "markdown") {
    throw new Error("Church Studio cannot import that format yet.");
  }
  if (!text.trim()) throw new Error("This file has no content.");
  if (ext === "md" || ext === "markdown") {
    return slidesFromBlocks(filename, splitMarkdown(text), uid);
  }
  return slidesFromBlocks(filename, [{ heading: stem(filename), body: text.replace(/\r\n/g, "\n").trim() }], uid);
}

/** Keep unknown kinds on a service JSON so a later schema can compile them. */
export function preserveServiceItems(raw: unknown[]): PresentationItem[] {
  const items: PresentationItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    try {
      const clone = structuredClone(entry) as Record<string, unknown>;
      if (typeof clone.id !== "string" || !clone.id) continue;
      if (typeof clone.kind !== "string" || !clone.kind) continue;
      if (typeof clone.title !== "string") clone.title = clone.kind;
      items.push(clone as unknown as PresentationItem);
    } catch {
      continue;
    }
  }
  return items;
}
