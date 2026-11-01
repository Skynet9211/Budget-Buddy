/** Largest file accepted for import. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Fewer characters than this per page means the PDF is almost certainly a scan (images only). */
const MIN_CHARS_PER_PAGE = 40;

export type DocumentKind = "pdf" | "docx";

export function documentKind(file: File): DocumentKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  )
    return "docx";
  return null;
}

/** The plain text of a PDF or DOCX file, one table row per line where possible. */
export async function readDocumentText(file: File): Promise<string> {
  const kind = documentKind(file);
  if (!kind) throw new Error("Choose a PDF or Word (.docx) file.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("That file is too large (max 10 MB).");
  const data = await file.arrayBuffer();
  return kind === "pdf" ? readPdf(data) : readDocx(data);
}

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

async function readPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    void task.destroy();
    if ((err as Error)?.name === "PasswordException") {
      throw new Error("This PDF is password-protected. Password-protected PDFs aren't supported yet.");
    }
    throw new Error("Couldn't open that PDF. It may be damaged.");
  }

  try {
    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as unknown[]).filter(
        (i): i is PdfTextItem => typeof (i as PdfTextItem).str === "string" && !!(i as PdfTextItem).str.trim(),
      );
      pages.push(rowsFromItems(items).join("\n"));
      page.cleanup();
    }
    const text = pages.join("\n");
    if (text.replace(/\s/g, "").length < MIN_CHARS_PER_PAGE * doc.numPages) {
      throw new Error("This PDF looks scanned (it has no selectable text). Scanned PDFs aren't supported yet.");
    }
    return text;
  } finally {
    void task.destroy();
  }
}

/**
 * PDF text comes as positioned fragments. Rebuild visual rows: fragments whose baselines are close
 * belong to one row, read left to right. Each fragment is padded out to its horizontal position, like
 * a fixed-width printout, so an amount stays under its column header even when the cells before it
 * are empty (that is the only way to tell a Withdrawal from a Deposit).
 */
export function rowsFromItems(items: PdfTextItem[]): string[] {
  const sorted = items
    .map((i) => ({ text: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  if (!sorted.length) return [];

  const widths = sorted.filter((i) => i.w > 0 && i.text.length).map((i) => i.w / i.text.length).sort((a, b) => a - b);
  const charWidth = widths.length ? widths[Math.floor(widths.length / 2)] : 5;
  const left = Math.min(...sorted.map((i) => i.x));

  const rows: Array<typeof sorted> = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, row[0].h * 0.4)) row.push(item);
    else rows.push([item]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const item of row) {
      const column = Math.round((item.x - left) / charWidth);
      if (!line) line = " ".repeat(column);
      else if (item.x - end > item.h * 0.15) line += " ".repeat(Math.max(1, column - line.length));
      line += item.text;
      end = item.x + item.w;
    }
    return line.trimEnd();
  });
}

/** Word tables become one line per row, cells separated by " | " (so empty cells still show); other paragraphs one line each. */
async function readDocx(data: ArrayBuffer): Promise<string> {
  const mod = await import("mammoth/mammoth.browser.js");
  const mammoth = mod.default ?? mod;
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ arrayBuffer: data })).value;
  } catch {
    throw new Error("Couldn't open that Word file. It may be damaged.");
  }

  const body = new DOMParser().parseFromString(html, "text/html").body;
  const clean = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  for (const el of Array.from(body.children)) {
    if (el.tagName === "TABLE") {
      for (const tr of Array.from(el.querySelectorAll("tr"))) {
        lines.push(Array.from(tr.querySelectorAll("th,td")).map(clean).join(" | "));
      }
    } else {
      lines.push(clean(el));
    }
  }
  const text = lines.filter(Boolean).join("\n");
  if (!text) throw new Error("Couldn't read any text from that Word file.");
  return text;
}
