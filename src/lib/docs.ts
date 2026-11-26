import "server-only";
import * as Y from "yjs";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { pagePresence, pages, users } from "@/db/schema";
import { can } from "./permissions";
import { AccessError, getPageAccess, requirePageLevel, type CurrentUser } from "./access";
import { extractText, fromBase64, toBase64 } from "./yjs-text";

/**
 * Pagina-inhoud als Yjs-document.
 *
 * Waarom Yjs al in versie 1: wijzigingen van twee mensen worden samengevoegd in plaats van overschreven,
 * en in versie 1.1 kan live samen bewerken (Hocuspocus) erop aansluiten zonder dat bestaande pagina's
 * omgezet hoeven te worden. In versie 1 stuurt de browser wijzigingen op en haalt hij elke paar seconden
 * die van anderen op.
 */

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const PRESENCE_WINDOW_SECONDS = 20;

export async function loadDoc(user: CurrentUser, pageId: string): Promise<string | null> {
  await getPageAccess(user, pageId, { logAdminView: false });
  const [row] = await db.select({ doc: pages.doc }).from(pages).where(eq(pages.id, pageId));
  return row?.doc ? toBase64(row.doc) : null;
}

/** Voegt een wijziging (Yjs-update) samen met de opgeslagen pagina. Vereist bewerkrechten. */
export async function applyDocUpdate(user: CurrentUser, pageId: string, updateB64: string): Promise<void> {
  const access = await requirePageLevel(user, pageId, can.edit);
  if (access.page.deletedAt) throw new AccessError("Deze pagina staat in de prullenbak.");
  const update = fromBase64(updateB64);
  if (update.byteLength > MAX_DOC_BYTES) throw new AccessError("Deze wijziging is te groot.");

  await db.transaction(async (tx) => {
    // Rij vergrendelen zodat twee gelijktijdige opslagen elkaar niet overschrijven.
    const [row] = await tx.execute<{ doc: Buffer | null }>(sql`SELECT doc FROM pages WHERE id = ${pageId} FOR UPDATE`);
    const doc = new Y.Doc();
    if (row?.doc) Y.applyUpdate(doc, new Uint8Array(row.doc));
    Y.applyUpdate(doc, update);
    const state = Y.encodeStateAsUpdate(doc);
    if (state.byteLength > MAX_DOC_BYTES) throw new AccessError("Deze pagina is te groot geworden. Verdeel hem over subpagina's.");
    await tx
      .update(pages)
      .set({ doc: Buffer.from(state), searchText: extractText(doc), updatedAt: new Date(), updatedBy: user.id })
      .where(eq(pages.id, pageId));
    doc.destroy();
  });
}

export interface PullResult {
  /** Wijzigingen die de browser nog niet heeft (leeg als er niets nieuws is). */
  update: string | null;
  /** Andere mensen die de pagina nu open hebben. */
  others: { name: string; editing: boolean }[];
}

/**
 * Haalt wijzigingen van anderen op sinds `stateVectorB64`, en meldt dat deze gebruiker de pagina open heeft.
 */
export async function pullDoc(user: CurrentUser, pageId: string, stateVectorB64: string | null, editing: boolean): Promise<PullResult> {
  await getPageAccess(user, pageId, { logAdminView: false });

  await db
    .insert(pagePresence)
    .values({ pageId, userId: user.id, editing, seenAt: new Date() })
    .onConflictDoUpdate({ target: [pagePresence.pageId, pagePresence.userId], set: { editing, seenAt: new Date() } });

  const others = await db
    .select({ name: users.name, editing: pagePresence.editing })
    .from(pagePresence)
    .innerJoin(users, eq(users.id, pagePresence.userId))
    .where(
      and(
        eq(pagePresence.pageId, pageId),
        ne(pagePresence.userId, user.id),
        gt(pagePresence.seenAt, sql`now() - make_interval(secs => ${PRESENCE_WINDOW_SECONDS})`),
      ),
    );

  const [row] = await db.select({ doc: pages.doc }).from(pages).where(eq(pages.id, pageId));
  let update: string | null = null;
  if (row?.doc) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(row.doc));
    const diff = stateVectorB64 ? Y.encodeStateAsUpdate(doc, fromBase64(stateVectorB64)) : Y.encodeStateAsUpdate(doc);
    // Een lege diff is 2 bytes; dan is er niets nieuws.
    if (diff.byteLength > 2) update = toBase64(diff);
    doc.destroy();
  }
  return { update, others };
}

/**
 * Sjabloonpagina's (welkom, werkplek, notulen, logboek, tips) krijgen hun blokken in de browser bij de eerste keer
 * openen, met de editor zelf. Daarna wordt de markering weggehaald.
 */
export async function setTemplate(user: CurrentUser, pageId: string, template: string, refs: Record<string, string> = {}) {
  await requirePageLevel(user, pageId, can.edit);
  await db.update(pages).set({ content: { template, refs } }).where(eq(pages.id, pageId));
}

export async function clearTemplateFlag(user: CurrentUser, pageId: string) {
  await requirePageLevel(user, pageId, can.edit);
  await db.update(pages).set({ content: null }).where(eq(pages.id, pageId));
}
