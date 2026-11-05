import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import JSZip from "jszip";
import { eq, sql } from "drizzle-orm";
import { dataDir, getDb, schema } from "@/db";
import { env } from "./env";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const LECTURE_ACCEPT = ".pdf,.pptx,.png,.jpg,.jpeg,.webp";

export function uploadDir() {
  return env.uploadDir || path.join(dataDir(), "uploads");
}

export function kindOf(name: string, mime: string): "pdf" | "pptx" | "image" | null {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf" || mime === "application/pdf") return "pdf";
  if (ext === ".pptx") return "pptx";
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext) || mime.startsWith("image/")) return "image";
  return null;
}

/** Text of each page/slide. Images have no text (they are only sent to an AI that can read images). */
export async function extractPages(buf: Buffer, name: string, mime: string): Promise<string[]> {
  const kind = kindOf(name, mime);
  if (kind === "pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return (text as string[]).map((t) => t.replace(/[ \t]+/g, " ").trim());
  }
  if (kind === "pptx") {
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f))
      .filter((m): m is RegExpExecArray => !!m)
      .sort((a, b) => Number(a[1]) - Number(b[1]));
    const out: string[] = [];
    for (const m of slides) {
      const xml = await zip.file(m[0])!.async("string");
      const paras = xml.split(/<\/a:p>/).map((p) =>
        [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
          .map((x) => decodeXml(x[1]))
          .join(""),
      );
      out.push(paras.filter((p) => p.trim()).join("\n"));
    }
    return out;
  }
  if (kind === "image") return [""];
  throw new Error("Unsupported file type. Use PDF, PowerPoint (.pptx) or an image.");
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function saveUpload(buf: Buffer, name: string) {
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  const safe = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const stored = path.join(dir, `${crypto.randomUUID()}-${safe}`);
  await fs.writeFile(stored, buf);
  return stored;
}

/** Read a stored lecture file and (re)build its searchable pages. */
export async function processDocument(id: string) {
  const db = await getDb();
  const [doc] = await db.select().from(schema.courseDocuments).where(eq(schema.courseDocuments.id, id));
  if (!doc) return;
  try {
    const buf = await fs.readFile(doc.storedPath);
    const pages = await extractPages(buf, doc.fileName, doc.mimeType);
    await db.delete(schema.docChunks).where(eq(schema.docChunks.documentId, id));
    const rows = pages
      .map((text, i) => ({ documentId: id, pageNo: i + 1, text: text.slice(0, 8000) }))
      .filter((r) => r.text.trim().length > 0);
    if (rows.length) await db.insert(schema.docChunks).values(rows);
    await db.update(schema.courseDocuments).set({ status: "ready", pages: pages.length, error: null }).where(eq(schema.courseDocuments.id, id));
  } catch (e) {
    await db
      .update(schema.courseDocuments)
      .set({ status: "failed", error: String((e as Error).message).slice(0, 500) })
      .where(eq(schema.courseDocuments.id, id));
  }
}

export interface LibraryHit {
  documentId: string;
  title: string;
  lecture: string | null;
  pageNo: number;
  text: string;
}

/** Postgres full-text search over all lecture pages (any word may match; best pages first). */
export async function searchLibrary(query: string, limit = 8): Promise<LibraryHit[]> {
  const words = Array.from(new Set(query.toLowerCase().match(/[a-z]{3,}/g) ?? [])).slice(0, 40);
  if (!words.length) return [];
  const tsq = words.join(" | ");
  const db = await getDb();
  const res = await db.execute(sql`
    select c.document_id as "documentId", d.title, d.lecture, c.page_no as "pageNo", c.text,
           ts_rank(to_tsvector('english', c.text), to_tsquery('english', ${tsq})) as rank
    from doc_chunks c join course_documents d on d.id = c.document_id
    where d.status = 'ready' and to_tsvector('english', c.text) @@ to_tsquery('english', ${tsq})
    order by rank desc
    limit ${limit}`);
  const rows = (res as unknown as { rows: LibraryHit[] }).rows ?? (res as unknown as LibraryHit[]);
  return rows.map((r) => ({ documentId: r.documentId, title: r.title, lecture: r.lecture, pageNo: Number(r.pageNo), text: r.text }));
}

export async function libraryIndex(): Promise<string> {
  const db = await getDb();
  const docs = await db
    .select({ title: schema.courseDocuments.title, lecture: schema.courseDocuments.lecture })
    .from(schema.courseDocuments)
    .where(eq(schema.courseDocuments.status, "ready"));
  return docs.map((d) => `- ${d.lecture ? `${d.lecture}: ` : ""}${d.title}`).join("\n");
}
