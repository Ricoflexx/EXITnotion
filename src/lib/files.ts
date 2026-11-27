import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { files, pages } from "@/db/schema";
import { can } from "./permissions";
import { AccessError, getPageAccess, requirePageLevel, type CurrentUser } from "./access";
import { MAX_UPLOAD_BYTES, storage } from "./storage";

/** Bestandstypes die de browser direct mag tonen. Al het andere (ook SVG en HTML) wordt een download. */
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

export async function saveUpload(user: CurrentUser, pageId: string, file: File) {
  const access = await requirePageLevel(user, pageId, can.edit);
  if (access.page.deletedAt) throw new AccessError("Deze pagina staat in de prullenbak.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AccessError("Dit bestand is groter dan 25 MB. Zet het in Box en plak de link.");
  if (file.size === 0) throw new AccessError("Dit bestand is leeg.");
  const contentType = file.type || "application/octet-stream";
  const key = await storage.put(Buffer.from(await file.arrayBuffer()), contentType);
  const [row] = await db
    .insert(files)
    .values({ pageId, name: file.name.slice(0, 255) || "bestand", contentType, size: file.size, storageKey: key, uploadedBy: user.id })
    .returning({ id: files.id });
  return { id: row.id, url: `/api/files/${row.id}` };
}

export async function readUpload(user: CurrentUser, fileId: string) {
  const row = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!row) throw new AccessError("Dit bestand bestaat niet.");
  // Leesrechten op de pagina waar het bestand bij hoort. Beheerdersinzage is al gelogd bij het openen van de pagina.
  await getPageAccess(user, row.pageId, { logAdminView: false });
  const data = await storage.get(row.storageKey);
  return { row, data, inline: INLINE_TYPES.has(row.contentType) };
}

/** Verwijdert bestanden van pagina's die definitief uit de prullenbak gaan (na 30 dagen). */
export async function purgeExpiredTrash() {
  const expired = await db
    .select({ id: pages.id })
    .from(pages)
    .where(sql`${pages.deletedAt} < now() - interval '30 days'`);
  if (!expired.length) return;
  const ids = expired.map((p) => p.id);
  const keys = await db.select({ key: files.storageKey }).from(files).where(inArray(files.pageId, ids));
  await db.delete(pages).where(inArray(pages.id, ids));
  for (const { key } of keys) await storage.remove(key).catch(() => {});
}

