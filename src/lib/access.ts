import "server-only";
import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, favorites, pageGrants, pages, spaceMembers, spaces, users, type Page, type Space, type User } from "@/db/schema";
import { can, canMove, resolveAccess, type GrantLevel, type Level } from "./permissions";

export class AccessError extends Error {
  constructor(message = "Je hebt hier geen toegang toe.") {
    super(message);
  }
}

export type CurrentUser = Pick<User, "id" | "isAdmin" | "active" | "name" | "email">;

// ---------------------------------------------------------------------------
// Gebruikers en privé-ruimtes
// ---------------------------------------------------------------------------

/** Maakt of werkt een gebruiker bij na het inloggen, en zorgt dat hij een privé-ruimte heeft (R02). */
export async function upsertUserFromLogin(input: {
  entraOid: string | null;
  email: string;
  name: string;
  isAdmin?: boolean;
}): Promise<User> {
  const email = input.email.toLowerCase();
  const existing = input.entraOid
    ? await db.query.users.findFirst({ where: eq(users.entraOid, input.entraOid) })
    : await db.query.users.findFirst({ where: eq(users.email, email) });

  let user: User;
  if (existing) {
    [user] = await db
      .update(users)
      .set({
        email,
        name: input.name || existing.name,
        lastLoginAt: new Date(),
        ...(input.isAdmin === undefined ? {} : { isAdmin: input.isAdmin }),
      })
      .where(eq(users.id, existing.id))
      .returning();
  } else {
    [user] = await db
      .insert(users)
      .values({ entraOid: input.entraOid, email, name: input.name || email, isAdmin: input.isAdmin ?? false, lastLoginAt: new Date() })
      .returning();
  }
  await ensurePrivateSpace(user);
  return user;
}

export async function ensurePrivateSpace(user: Pick<User, "id" | "name">): Promise<Space> {
  const found = await db.query.spaces.findFirst({ where: and(eq(spaces.kind, "private"), eq(spaces.ownerId, user.id)) });
  if (found) return found;
  const [space] = await db.insert(spaces).values({ kind: "private", name: "Privé", ownerId: user.id }).returning();
  await db.insert(pages).values({
    spaceId: space.id,
    title: "Welkom in je werkplek",
    createdBy: user.id,
    content: { type: "welcome" },
  });
  return space;
}

export async function getUser(id: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

// ---------------------------------------------------------------------------
// Rechten
// ---------------------------------------------------------------------------

/** De pagina zelf plus alle bovenliggende pagina's, van de pagina omhoog naar de wortel. */
async function pageChain(pageId: string): Promise<Page[]> {
  const rows = await db.execute<{ id: string; depth: number }>(sql`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, 0 AS depth FROM pages WHERE id = ${pageId}
      UNION ALL
      SELECT p.id, p.parent_id, c.depth + 1 FROM pages p JOIN chain c ON p.id = c.parent_id WHERE c.depth < 100
    )
    SELECT id, depth FROM chain ORDER BY depth`);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const found = await db.select().from(pages).where(inArray(pages.id, ids));
  return ids.map((id) => found.find((p) => p.id === id)!).filter(Boolean);
}

async function membershipLevel(userId: string, spaceId: string): Promise<Level | null> {
  const m = await db.query.spaceMembers.findFirst({
    where: and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)),
  });
  return m?.level ?? null;
}

/** Niveau op ruimteniveau, voor het maken van pagina's in de wortel van een ruimte. */
export async function getSpaceAccess(user: CurrentUser, spaceId: string) {
  const space = await db.query.spaces.findFirst({ where: eq(spaces.id, spaceId) });
  if (!space) throw new AccessError("Deze ruimte bestaat niet.");
  const result = resolveAccess({
    user,
    space: { kind: space.kind, ownerId: space.ownerId },
    membership: await membershipLevel(user.id, space.id),
    grants: [],
  });
  return { space, ...result };
}

export interface PageAccess {
  page: Page;
  space: Space;
  /** Bovenliggende pagina's, van de wortel naar beneden (voor het kruimelpad). */
  ancestors: Page[];
  level: Level;
  viaAdmin: boolean;
}

/**
 * Bepaalt wat de gebruiker met een pagina mag. Logt automatisch een beheerdersinzage (R93).
 * Gooit AccessError als de gebruiker de pagina niet mag zien.
 */
export async function getPageAccess(user: CurrentUser, pageId: string, opts: { logAdminView?: boolean } = {}): Promise<PageAccess> {
  const chain = await pageChain(pageId);
  if (!chain.length) throw new AccessError("Deze pagina bestaat niet.");
  const page = chain[0];
  const space = await db.query.spaces.findFirst({ where: eq(spaces.id, page.spaceId) });
  if (!space) throw new AccessError("Deze pagina bestaat niet.");

  const grantRows = await db
    .select({ level: pageGrants.level })
    .from(pageGrants)
    .where(and(eq(pageGrants.userId, user.id), inArray(pageGrants.pageId, chain.map((p) => p.id))));

  const result = resolveAccess({
    user,
    space: { kind: space.kind, ownerId: space.ownerId },
    membership: await membershipLevel(user.id, space.id),
    grants: grantRows.map((g) => g.level),
  });
  if (!can.read(result.level)) throw new AccessError();

  if (result.viaAdmin && opts.logAdminView !== false) {
    await db.insert(auditLog).values({
      actorId: user.id,
      action: "beheerder.inzage",
      pageId: page.id,
      spaceId: space.id,
      subjectUserId: space.ownerId,
    });
  }
  return { page, space, ancestors: chain.slice(1).reverse(), ...result };
}

export async function requirePageLevel(user: CurrentUser, pageId: string, check: (l: Level) => boolean) {
  const access = await getPageAccess(user, pageId, { logAdminView: false });
  if (!check(access.level) || access.viaAdmin) throw new AccessError("Je mag deze pagina niet aanpassen.");
  return access;
}

// ---------------------------------------------------------------------------
// Zijbalk
// ---------------------------------------------------------------------------

export type TreePage = Pick<Page, "id" | "title" | "icon" | "parentId" | "position">;
export interface SidebarSpace {
  space: Space;
  level: Level;
  pages: TreePage[];
}

const treeColumns = { id: pages.id, title: pages.title, icon: pages.icon, parentId: pages.parentId, position: pages.position };

async function spacePages(spaceId: string): Promise<TreePage[]> {
  return db
    .select(treeColumns)
    .from(pages)
    .where(and(eq(pages.spaceId, spaceId), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position), asc(pages.createdAt));
}

export async function getSidebar(user: CurrentUser) {
  const own = await db.query.spaces.findFirst({ where: and(eq(spaces.kind, "private"), eq(spaces.ownerId, user.id)) });

  const teams = await db
    .select({ space: spaces, level: spaceMembers.level })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, user.id))
    .orderBy(asc(spaces.name));

  // Pagina's die met mij gedeeld zijn in ruimtes waar ik zelf geen toegang toe heb.
  const memberSpaceIds = new Set([own?.id, ...teams.map((t) => t.space.id)].filter(Boolean) as string[]);
  const shared = await db
    .select({ ...treeColumns, level: pageGrants.level, spaceId: pages.spaceId })
    .from(pageGrants)
    .innerJoin(pages, eq(pages.id, pageGrants.pageId))
    .where(and(eq(pageGrants.userId, user.id), isNull(pages.deletedAt)))
    .orderBy(asc(pages.title));

  const favs = await db
    .select(treeColumns)
    .from(favorites)
    .innerJoin(pages, eq(pages.id, favorites.pageId))
    .where(and(eq(favorites.userId, user.id), isNull(pages.deletedAt)))
    .orderBy(asc(favorites.createdAt));

  return {
    privateSpace: own ? ({ space: own, level: "full", pages: await spacePages(own.id) } satisfies SidebarSpace) : null,
    teamSpaces: await Promise.all(
      teams.map(async (t) => ({ space: t.space, level: t.level as Level, pages: await spacePages(t.space.id) }) satisfies SidebarSpace),
    ),
    sharedWithMe: shared.filter((s) => !memberSpaceIds.has(s.spaceId)),
    favorites: favs,
  };
}

// ---------------------------------------------------------------------------
// Pagina's maken, aanpassen, verwijderen, verplaatsen
// ---------------------------------------------------------------------------

async function nextPosition(spaceId: string, parentId: string | null) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${pages.position})` })
    .from(pages)
    .where(and(eq(pages.spaceId, spaceId), parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId)));
  return (row?.max ?? 0) + 1;
}

export async function createPage(user: CurrentUser, target: { spaceId?: string; parentId?: string | null; title?: string }) {
  let spaceId: string;
  let parentId: string | null = null;
  if (target.parentId) {
    const parent = await requirePageLevel(user, target.parentId, can.edit);
    spaceId = parent.space.id;
    parentId = parent.page.id;
  } else if (target.spaceId) {
    const access = await getSpaceAccess(user, target.spaceId);
    if (!can.edit(access.level) || access.viaAdmin) throw new AccessError("Je mag in deze ruimte geen pagina's maken.");
    spaceId = access.space.id;
  } else {
    throw new AccessError("Geef aan waar de pagina moet komen.");
  }
  const [page] = await db
    .insert(pages)
    .values({ spaceId, parentId, title: target.title ?? "", createdBy: user.id, updatedBy: user.id, position: await nextPosition(spaceId, parentId) })
    .returning();
  return page;
}

export async function renamePage(user: CurrentUser, pageId: string, title: string) {
  await requirePageLevel(user, pageId, can.edit);
  await db
    .update(pages)
    .set({ title: title.trim().slice(0, 300), updatedBy: user.id, updatedAt: new Date() })
    .where(eq(pages.id, pageId));
}

async function descendantIds(pageId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM pages WHERE id = ${pageId}
      UNION ALL
      SELECT p.id FROM pages p JOIN tree t ON p.parent_id = t.id
    )
    SELECT id FROM tree`);
  return rows.map((r) => r.id);
}

/** Naar de prullenbak (R63), inclusief subpagina's. */
export async function trashPage(user: CurrentUser, pageId: string) {
  await requirePageLevel(user, pageId, can.manage);
  const ids = await descendantIds(pageId);
  await db
    .update(pages)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(and(inArray(pages.id, ids), isNull(pages.deletedAt)));
}

export async function restorePage(user: CurrentUser, pageId: string) {
  const access = await getPageAccess(user, pageId, { logAdminView: false });
  if (!can.manage(access.level) || access.viaAdmin) throw new AccessError();
  const deletedAt = access.page.deletedAt;
  if (!deletedAt) return;
  const ids = await descendantIds(pageId);
  // Alleen terugzetten wat in dezelfde actie is verwijderd.
  await db.update(pages).set({ deletedAt: null, deletedBy: null }).where(and(inArray(pages.id, ids), eq(pages.deletedAt, deletedAt)));
  // Staat de bovenliggende pagina nog in de prullenbak, dan komt deze pagina in de wortel van de ruimte.
  const parent = access.ancestors.at(-1);
  if (parent?.deletedAt) await db.update(pages).set({ parentId: null }).where(eq(pages.id, pageId));
}

/** Prullenbak: alleen de bovenste verwijderde pagina's die ik mag terugzetten. */
export async function listTrash(user: CurrentUser) {
  // Na 30 dagen definitief weg. Subpagina's uit dezelfde verwijdering hebben dezelfde deletedAt.
  await db.delete(pages).where(sql`${pages.deletedAt} < now() - interval '30 days'`);
  const rows = await db
    .select({ id: pages.id, title: pages.title, deletedAt: pages.deletedAt, parentId: pages.parentId, spaceId: pages.spaceId })
    .from(pages)
    .where(isNotNull(pages.deletedAt))
    .orderBy(desc(pages.deletedAt))
    .limit(500);
  const out: typeof rows = [];
  for (const r of rows) {
    const parentInSameDeletion = r.parentId && rows.some((o) => o.id === r.parentId && o.deletedAt?.getTime() === r.deletedAt?.getTime());
    if (parentInSameDeletion) continue;
    try {
      const a = await getPageAccess(user, r.id, { logAdminView: false });
      if (can.manage(a.level) && !a.viaAdmin) out.push(r);
    } catch {
      /* geen toegang */
    }
  }
  return out;
}

/** Een pagina met subpagina's verplaatsen, ook naar een andere ruimte (R52). */
export async function movePage(user: CurrentUser, pageId: string, target: { spaceId?: string; parentId?: string | null }) {
  const source = await requirePageLevel(user, pageId, can.manage);
  let targetSpaceId: string;
  let targetLevel: Level;
  let isDescendant = false;
  if (target.parentId) {
    const t = await getPageAccess(user, target.parentId, { logAdminView: false });
    targetSpaceId = t.space.id;
    targetLevel = t.viaAdmin ? "none" : t.level;
    isDescendant = (await descendantIds(pageId)).includes(target.parentId);
  } else if (target.spaceId) {
    const t = await getSpaceAccess(user, target.spaceId);
    targetSpaceId = t.space.id;
    targetLevel = t.viaAdmin ? "none" : t.level;
  } else throw new AccessError("Geef aan waar de pagina heen moet.");

  if (!canMove({ pageLevel: source.level, targetLevel, targetIsDescendant: isDescendant })) {
    throw new AccessError(isDescendant ? "Een pagina kan niet onder zijn eigen subpagina." : "Je mag de pagina niet daarheen verplaatsen.");
  }
  const ids = await descendantIds(pageId);
  await db.transaction(async (tx) => {
    await tx
      .update(pages)
      .set({ parentId: target.parentId ?? null, position: await nextPosition(targetSpaceId, target.parentId ?? null), updatedBy: user.id, updatedAt: new Date() })
      .where(eq(pages.id, pageId));
    if (targetSpaceId !== source.space.id) await tx.update(pages).set({ spaceId: targetSpaceId }).where(inArray(pages.id, ids));
  });
}

// ---------------------------------------------------------------------------
// Delen (R04) en favorieten (R71)
// ---------------------------------------------------------------------------

export async function sharePage(user: CurrentUser, pageId: string, targetUserId: string, level: GrantLevel) {
  await requirePageLevel(user, pageId, can.manage);
  const target = await getUser(targetUserId);
  if (!target?.active) throw new AccessError("Deze collega bestaat niet of is niet actief.");
  await db
    .insert(pageGrants)
    .values({ pageId, userId: targetUserId, level, grantedBy: user.id })
    .onConflictDoUpdate({ target: [pageGrants.pageId, pageGrants.userId], set: { level, grantedBy: user.id } });
}

export async function unsharePage(user: CurrentUser, pageId: string, targetUserId: string) {
  await requirePageLevel(user, pageId, can.manage);
  await db.delete(pageGrants).where(and(eq(pageGrants.pageId, pageId), eq(pageGrants.userId, targetUserId)));
}

export async function listGrants(pageId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, level: pageGrants.level })
    .from(pageGrants)
    .innerJoin(users, eq(users.id, pageGrants.userId))
    .where(eq(pageGrants.pageId, pageId))
    .orderBy(asc(users.name));
}

export async function toggleFavorite(user: CurrentUser, pageId: string) {
  await getPageAccess(user, pageId, { logAdminView: false });
  const deleted = await db
    .delete(favorites)
    .where(and(eq(favorites.userId, user.id), eq(favorites.pageId, pageId)))
    .returning();
  if (!deleted.length) await db.insert(favorites).values({ userId: user.id, pageId });
}

export async function listColleagues() {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
}

export async function childPages(pageId: string) {
  return db
    .select(treeColumns)
    .from(pages)
    .where(and(eq(pages.parentId, pageId), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position), asc(pages.createdAt));
}
