/**
 * PDF → slide images, entirely on this computer. Each page is rendered to a PNG sized for a
 * 1920-wide output. PowerPoint and Keynote files: save them as PDF first.
 * pdf.js loads only when a PDF is imported, so the desk bundle stays small.
 */
export const MAX_PDF_PAGES = 150;
export const MAX_PDF_BYTES = 80 * 1024 * 1024;
const TARGET_WIDTH = 1920;

export type PdfPage = { index: number; count: number; name: string; blob: Blob };

export function pageName(file: string, index: number, count: number): string {
  const base = file.replace(/\.pdf$/i, "").trim() || "Slides";
  return count === 1 ? `${base}.png` : `${base} — page ${index + 1}.png`;
}

/** Scale so the page renders TARGET_WIDTH pixels wide, capped to keep memory sane. */
export function renderScale(pageWidth: number): number {
  if (!(pageWidth > 0)) return 1;
  return Math.min(6, Math.max(0.5, TARGET_WIDTH / pageWidth));
}

export async function* renderPdfPages(file: File): AsyncGenerator<PdfPage> {
  if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} is larger than 80 MB.`);
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  let document;
  try {
    document = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String((error as { name: string }).name) : "";
    if (name === "PasswordException") throw new Error(`${file.name} is password-protected. Save an unlocked copy, then import it.`);
    throw new Error(`${file.name} could not be read as a PDF.`);
  }
  try {
    const count = Math.min(document.numPages, MAX_PDF_PAGES);
    for (let index = 0; index < count; index += 1) {
      const page = await document.getPage(index + 1);
      const viewport = page.getViewport({ scale: renderScale(page.getViewport({ scale: 1 }).width) });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This window cannot draw PDF pages.");
      // White paper behind transparent pages, like a projector would show a printed slide.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error(`Page ${index + 1} could not be drawn.`);
      yield { index, count, name: pageName(file.name, index, count), blob };
    }
  } finally {
    await document.destroy();
  }
}
