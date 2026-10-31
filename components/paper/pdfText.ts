// PDF -> text using pdf.js. Loaded lazily so the ~1 MB library and its worker are only
// fetched when a paper's full text is first needed. The worker is bundled by Vite (no CDN).
import type { ExtractedDoc } from './types';
import { buildLines, linesToSections, type PdfItem, type PdfLine } from './textSections';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

const loadPdfJs = () => {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  }).catch(e => {
    pdfjsPromise = null; // allow a retry (e.g. after a network blip)
    throw e;
  });
  return pdfjsPromise;
};

export async function extractPdf(
  data: ArrayBuffer,
  source: ExtractedDoc['source'],
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedDoc> {
  const pdfjs = await loadPdfJs();
  // pdf.js transfers (detaches) the buffer it is given, so hand it a copy
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const lines: PdfLine[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue; // marked-content markers
        const [a, b, c, d, e, f] = it.transform as number[];
        items.push({
          str: it.str,
          x: e,
          y: f,
          width: it.width,
          fontSize: Math.hypot(c, d) || it.height,
          hasEOL: it.hasEOL,
          rotated: Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a < 0,
        });
      }
      lines.push(...buildLines(items, n));
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    let pdfTitle: string | undefined;
    try {
      const meta = await doc.getMetadata();
      const title = (meta.info as { Title?: string } | undefined)?.Title?.trim();
      if (title && !/^(untitled|microsoft word|document)\b/i.test(title)) pdfTitle = title;
    } catch { /* metadata is optional */ }

    return { sections: linesToSections(lines), pageCount: doc.numPages, source, extractedAt: Date.now(), pdfTitle };
  } finally {
    void doc.destroy();
  }
}
