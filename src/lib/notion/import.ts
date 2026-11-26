import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import * as Y from "yjs";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { db } from "@/db";
import { auditLog, files, importJobs, pages, spaces, users } from "@/db/schema";
import { editorSchema } from "@/components/editor/schema";
import { AccessError, type CurrentUser } from "../access";
import { withDefaults, type DbSchema } from "../db-model";
import { MAX_UPLOAD_BYTES, storage } from "../storage";
import { extractText, FRAGMENT } from "../yjs-text";
import { NotionClient, NotionError, parseNotionId, type Json } from "./client";
import { convertBlocks, mapDatabase, mapRowProps, pageTitle, plainText, type ConvertContext, type DbMapping, type NotionBlock } from "./convert";

/**
 * Import uit Notion (blok 3, R84).
 *
 * Stap 1: alles ophalen vanaf de gekozen pagina (subpagina's, databases met rijen, blokken) en per Notion-pagina
 *         alvast een pagina bij ons aanmaken. Zo weten we alle nieuwe ids, ook voor verwijzingen tussen pagina's.
 * Stap 2: inhoud omzetten (blokken → editordocument, databasevelden → ons model) en bestanden downloaden.
 *
 * Wat niet meekomt: weergaven van databases (de Notion-API geeft die niet; we maken Tabel/Bord/Kalender),
 * relaties tussen databases, opmerkingen en versiegeschiedenis. Alles wat wordt overgeslagen staat in het log.
 */

interface Node {
  notionId: string;
  kind: "page" | "database" | "row";
  title: string;
  icon: string | null;
  parent: string | null;
  blocks: NotionBlock[];
  page?: Json;
  mapping?: DbMapping;
  inline?: boolean;
  ourId?: string;
}

export interface ImportResult {
  rootPageId: string;
  stats: Record<string, number>;
}

const MAX_NODES = 3000;
const MAX_DEPTH = 12;

export async function importFromNotion(opts: {
  actor: CurrentUser;
  client: NotionClient;
  rootId: string;
  targetSpaceId: string;
  log: (line: string) => void;
}): Promise<ImportResult> {
  const { client, log, actor } = opts;
  const nodes = new Map<string, Node>();
  const order: string[] = [];
  const skipped = new Map<string, number>();
  const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1);

  // --- Stap 1: ophalen ----------------------------------------------------------------------

  const add = (node: Node) => {
    if (nodes.has(node.notionId)) return false;
    if (nodes.size >= MAX_NODES) throw new AccessError(`Meer dan ${MAX_NODES} pagina's. Importeer in kleinere stukken.`);
    nodes.set(node.notionId, node);
    order.push(node.notionId);
    return true;
  };

  /** Blokken met kinderen ophalen; subpagina's en databases worden apart opgehaald. */
  const fetchTree = async (blockId: string, found: { id: string; type: string }[], depth = 0): Promise<NotionBlock[]> => {
    const list = (await client.blockChildren(blockId)) as NotionBlock[];
    for (const b of list) {
      if (b.type === "child_page" || b.type === "child_database") {
        found.push({ id: b.id as string, type: b.type });
        continue;
      }
      if (b.has_children && depth < MAX_DEPTH) b.children = await fetchTree(b.id as string, found, depth + 1);
    }
    return list;
  };

  const icon = (obj: Json) => (obj.icon?.type === "emoji" ? (obj.icon.emoji as string) : null);

  const visitPage = async (id: string, parent: string | null, depth: number): Promise<void> => {
    const page = await client.retrievePage(id);
    const node: Node = { notionId: id, kind: "page", title: pageTitle(page), icon: icon(page), parent, blocks: [] };
    if (!add(node)) return;
    log(`Pagina: ${node.title || "Naamloos"}`);
    const found: { id: string; type: string }[] = [];
    node.blocks = await fetchTree(id, found);
    for (const f of found) await visit(f.id, f.type === "child_database" ? "database" : "page", id, depth + 1);
  };

  const visitDatabase = async (id: string, parent: string | null, depth: number): Promise<void> => {
    let dbObj: Json;
    try {
      dbObj = await client.retrieveDatabase(id);
    } catch (e) {
      // Gekoppelde databases (linked views) kan de API niet lezen.
      if (e instanceof NotionError && (e.status === 404 || e.status === 400)) {
        skip("gekoppelde databases (alleen een weergave van een andere database)");
        return;
      }
      throw e;
    }
    const mapping = mapDatabase(dbObj, { skip });
    const node: Node = {
      notionId: id,
      kind: "database",
      title: plainText(dbObj.title),
      icon: icon(dbObj),
      parent,
      blocks: [],
      mapping,
      inline: Boolean(dbObj.is_inline),
    };
    if (!add(node)) return;
    const rows = await client.queryDatabase(id);
    log(`Database: ${node.title || "Naamloos"} (${rows.length} rijen)`);
    for (const row of rows) {
      const rowNode: Node = { notionId: row.id, kind: "row", title: pageTitle(row), icon: icon(row), parent: id, blocks: [], page: row };
      if (!add(rowNode)) continue;
      const found: { id: string; type: string }[] = [];
      rowNode.blocks = await fetchTree(row.id, found);
      for (const f of found) await visit(f.id, f.type === "child_database" ? "database" : "page", row.id, depth + 1);
    }
  };

  const visit = async (id: string, kind: "page" | "database", parent: string | null, depth: number) => {
    if (depth > MAX_DEPTH) return skip("pagina's die te diep genest zijn");
    return kind === "database" ? visitDatabase(id, parent, depth) : visitPage(id, parent, depth);
  };

  // De gekozen link kan een pagina of een database zijn.
  try {
    await visit(opts.rootId, "page", null, 0);
  } catch (e) {
    if (e instanceof NotionError && (e.status === 404 || e.status === 400)) {
      try {
        await client.retrieveDatabase(opts.rootId);
      } catch {
        throw e;
      }
      await visit(opts.rootId, "database", null, 0);
    } else throw e;
  }
  log(`Opgehaald: ${nodes.size} pagina's en rijen (${client.requests} verzoeken aan Notion).`);

  // --- Pagina's aanmaken -------------------------------------------------------------------
  // Gaat er vanaf hier iets mis, dan gaat alles wat al is aangemaakt naar de prullenbak (geen halve import).
  try {
    return await createAndFill();
  } catch (e) {
    const created = [...nodes.values()].map((n) => n.ourId).filter((x): x is string => Boolean(x));
    if (created.length) {
      await db.update(pages).set({ deletedAt: new Date(), deletedBy: actor.id }).where(inArray(pages.id, created));
      log(`Halve import opgeruimd: ${created.length} pagina's naar de prullenbak.`);
    }
    throw e;
  }

  async function createAndFill(): Promise<ImportResult> {

  const position = new Map<string | null, number>();
  for (const id of order) {
    const n = nodes.get(id)!;
    const parentNode = n.parent ? nodes.get(n.parent) : null;
    const pos = (position.get(n.parent) ?? 0) + 1;
    position.set(n.parent, pos);
    const [row] = await db
      .insert(pages)
      .values({
        spaceId: opts.targetSpaceId,
        parentId: parentNode?.ourId ?? null,
        kind: n.kind,
        title: n.title.slice(0, 300),
        icon: n.icon,
        dbSchema: n.kind === "database" ? (n.mapping!.schema as DbSchema) : null,
        createdBy: actor.id,
        updatedBy: actor.id,
        position: parentNode ? pos : Date.now() / 1e9,
      })
      .returning({ id: pages.id });
    n.ourId = row.id;
  }

  // --- Stap 2: inhoud en velden ------------------------------------------------------------

  const people = await db.select({ id: users.id, email: users.email, name: users.name }).from(users);
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.id]));
  const byName = new Map<string, string | null>();
  for (const p of people) byName.set(p.name.toLowerCase(), byName.has(p.name.toLowerCase()) ? null : p.id);
  const userId = (u: Json): string | null => {
    const email = u?.person?.email as string | undefined;
    if (email) return byEmail.get(email.toLowerCase()) ?? null;
    if (u?.name) {
      skip("personen zonder e-mailadres (op naam gekoppeld als dat kon)");
      return byName.get(String(u.name).toLowerCase()) ?? null;
    }
    return null;
  };

  const editor = ServerBlockNoteEditor.create({ schema: editorSchema });
  let filesStored = 0;

  for (const id of order) {
    const n = nodes.get(id)!;
    const ctx: ConvertContext = {
      pageId: (notionId) => nodes.get(normalize(notionId))?.ourId ?? null,
      isInlineDatabase: (notionId) => Boolean(nodes.get(normalize(notionId))?.inline),
      userId,
      skip,
      storeFile: async (url, name) => {
        if (!url) return null;
        try {
          const { data, contentType } = await client.download(url);
          if (data.byteLength > MAX_UPLOAD_BYTES) {
            skip("bestanden groter dan 25 MB");
            return null;
          }
          const key = await storage.put(data, contentType);
          const [f] = await db
            .insert(files)
            .values({ pageId: n.ourId!, name: name.slice(0, 255), contentType, size: data.byteLength, storageKey: key, uploadedBy: actor.id })
            .returning({ id: files.id });
          filesStored++;
          return `/api/files/${f.id}`;
        } catch {
          return null;
        }
      },
    };

    const blocks = await convertBlocks(n.blocks, ctx);
    const patch: Partial<typeof pages.$inferInsert> = {};
    if (blocks.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = editor.blocksToYDoc(blocks as any, FRAGMENT);
      patch.doc = Buffer.from(Y.encodeStateAsUpdate(doc));
      patch.searchText = extractText(doc);
      doc.destroy();
    }
    if (n.kind === "row" && n.page && n.parent) {
      const mapping = nodes.get(n.parent)!.mapping!;
      patch.props = withDefaults(mapping.schema, mapRowProps(n.page, mapping, { userId }));
    }
    if (Object.keys(patch).length) await db.update(pages).set(patch).where(eq(pages.id, n.ourId!));
  }

  const stats: Record<string, number> = {
    paginas: [...nodes.values()].filter((n) => n.kind === "page").length,
    databases: [...nodes.values()].filter((n) => n.kind === "database").length,
    rijen: [...nodes.values()].filter((n) => n.kind === "row").length,
    bestanden: filesStored,
    verzoeken: client.requests,
  };
  for (const [what, count] of skipped) log(`Overgeslagen of aangepast: ${count}× ${what}`);
  return { rootPageId: nodes.get(order[0])!.ourId!, stats };
  }
}

function normalize(id: string): string {
  return parseNotionId(id) ?? id;
}

// ---------------------------------------------------------------------------------------------
// Achtergrondtaak
// ---------------------------------------------------------------------------------------------

/**
 * Start een import op de achtergrond en geeft het id van de taak terug. Alleen voor beheerders.
 * Het token wordt alleen in het geheugen gebruikt en nergens opgeslagen.
 */
export async function startNotionImport(
  actor: CurrentUser,
  input: { token: string; source: string; targetSpaceId: string },
  deps: { fetchImpl?: typeof fetch; minIntervalMs?: number } = {},
): Promise<{ jobId: string; done: Promise<void> }> {
  if (!actor.isAdmin || !actor.active) throw new AccessError("Alleen beheerders kunnen importeren uit Notion.");
  const rootId = parseNotionId(input.source);
  if (!rootId) throw new AccessError("Dit is geen Notion-link. Kopieer de link van de pagina (••• → Link kopiëren).");
  if (!input.token.trim()) throw new AccessError("Plak het token van je Notion-integratie.");
  const target = await db.query.spaces.findFirst({ where: eq(spaces.id, input.targetSpaceId) });
  if (!target) throw new AccessError("Deze ruimte bestaat niet.");

  const [job] = await db
    .insert(importJobs)
    .values({ actorId: actor.id, source: input.source.slice(0, 500), targetSpaceId: target.id })
    .returning({ id: importJobs.id });
  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "notion.import",
    spaceId: target.id,
    subjectUserId: target.ownerId,
    details: { source: input.source.slice(0, 500), job: job.id },
  });

  const lines: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    flushTimer = null;
    await db
      .update(importJobs)
      .set({ log: sql`${importJobs.log} || ${JSON.stringify(lines.splice(0))}::jsonb` })
      .where(eq(importJobs.id, job.id));
  };
  const log = (line: string) => {
    lines.push(line);
    flushTimer ??= setTimeout(() => void flush(), 1000);
  };

  const done = (async () => {
    const client = new NotionClient({ token: input.token.trim(), fetchImpl: deps.fetchImpl, minIntervalMs: deps.minIntervalMs });
    try {
      log("Import gestart.");
      const result = await importFromNotion({ actor, client, rootId, targetSpaceId: target.id, log });
      log("Import klaar.");
      if (flushTimer) clearTimeout(flushTimer);
      await flush();
      await db
        .update(importJobs)
        .set({ status: "klaar", rootPageId: result.rootPageId, stats: result.stats, finishedAt: new Date() })
        .where(eq(importJobs.id, job.id));
    } catch (e) {
      const message = e instanceof NotionError || e instanceof AccessError ? e.message : "Er ging iets onverwachts mis tijdens de import.";
      if (!(e instanceof NotionError || e instanceof AccessError)) console.error("Notion-import mislukt", e);
      log(`Gestopt: ${message}`);
      if (flushTimer) clearTimeout(flushTimer);
      await flush();
      await db.update(importJobs).set({ status: "mislukt", error: message, finishedAt: new Date() }).where(eq(importJobs.id, job.id));
    }
  })();

  return { jobId: job.id, done };
}
