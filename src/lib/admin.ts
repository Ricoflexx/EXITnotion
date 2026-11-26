import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, pages, spaceMembers, spaces, users } from "@/db/schema";
import { AccessError, ensurePrivateSpace, type CurrentUser } from "./access";
import type { GrantLevel } from "./permissions";

function requireAdmin(user: CurrentUser) {
  if (!user.isAdmin || !user.active) throw new AccessError("Alleen beheerders mogen dit.");
}

async function log(actor: CurrentUser, action: string, extra: Partial<typeof auditLog.$inferInsert> = {}) {
  await db.insert(auditLog).values({ actorId: actor.id, action, ...extra });
}

export async function adminOverview(actor: CurrentUser) {
  requireAdmin(actor);
  const people = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isAdmin: users.isAdmin,
      active: users.active,
      lastLoginAt: users.lastLoginAt,
      privateSpaceId: spaces.id,
      pageCount: sql<number>`(select count(*)::int from pages p where p.space_id = "spaces"."id" and p.deleted_at is null)`,
    })
    .from(users)
    .leftJoin(spaces, and(eq(spaces.ownerId, users.id), eq(spaces.kind, "private")))
    .orderBy(asc(users.name));

  const teams = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      members: sql<{ id: string; name: string; level: GrantLevel }[]>`coalesce((
        select json_agg(json_build_object('id', u.id, 'name', u.name, 'level', m.level) order by u.name)
        from space_members m join users u on u.id = m.user_id where m.space_id = "spaces"."id"), '[]')`,
    })
    .from(spaces)
    .where(eq(spaces.kind, "team"))
    .orderBy(asc(spaces.name));

  const recentLog = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      actorName: users.name,
      pageId: auditLog.pageId,
      pageTitle: pages.title,
      subjectUserId: auditLog.subjectUserId,
      details: auditLog.details,
    })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .leftJoin(pages, eq(pages.id, auditLog.pageId))
    .orderBy(desc(auditLog.at))
    .limit(100);

  return { people, teams, recentLog };
}

/** Top-level pagina's van iemands privé-ruimte, om als beheerder in te kunnen kijken (R03). */
export async function privateSpaceRoots(actor: CurrentUser, ownerId: string) {
  requireAdmin(actor);
  const space = await db.query.spaces.findFirst({ where: and(eq(spaces.kind, "private"), eq(spaces.ownerId, ownerId)) });
  if (!space) return [];
  return db
    .select({ id: pages.id, title: pages.title })
    .from(pages)
    .where(and(eq(pages.spaceId, space.id), isNull(pages.parentId), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position));
}

export async function setUserActive(actor: CurrentUser, userId: string, active: boolean) {
  requireAdmin(actor);
  if (userId === actor.id && !active) throw new AccessError("Je kunt jezelf niet uitzetten.");
  await db.update(users).set({ active }).where(eq(users.id, userId));
  await log(actor, active ? "gebruiker.aangezet" : "gebruiker.uitgezet", { subjectUserId: userId });
}

export async function createTeamSpace(actor: CurrentUser, name: string) {
  requireAdmin(actor);
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new AccessError("Geef de teamruimte een naam.");
  const [space] = await db.insert(spaces).values({ kind: "team", name: clean }).returning();
  await log(actor, "teamruimte.gemaakt", { spaceId: space.id, details: { name: clean } });
  return space;
}

export async function setTeamMember(actor: CurrentUser, spaceId: string, userId: string, level: GrantLevel | null) {
  requireAdmin(actor);
  const space = await db.query.spaces.findFirst({ where: eq(spaces.id, spaceId) });
  if (space?.kind !== "team") throw new AccessError("Dit is geen teamruimte.");
  if (level === null) {
    await db.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
  } else {
    await db
      .insert(spaceMembers)
      .values({ spaceId, userId, level })
      .onConflictDoUpdate({ target: [spaceMembers.spaceId, spaceMembers.userId], set: { level } });
  }
  await log(actor, "teamruimte.lid", { spaceId, subjectUserId: userId, details: { level } });
}

/**
 * Overdragen bij vertrek (R81): alle pagina's uit de privé-ruimte van `fromUserId` komen onder één nieuwe pagina
 * "Werk van <naam>" in de gekozen ruimte (een teamruimte of de privé-ruimte van een collega).
 * Optioneel wordt het account daarna uitgezet.
 */
export async function transferWork(
  actor: CurrentUser,
  args: { fromUserId: string; toSpaceId: string; deactivate: boolean },
) {
  requireAdmin(actor);
  const from = await db.query.users.findFirst({ where: eq(users.id, args.fromUserId) });
  if (!from) throw new AccessError("Deze gebruiker bestaat niet.");
  const source = await ensurePrivateSpace(from);
  const target = await db.query.spaces.findFirst({ where: eq(spaces.id, args.toSpaceId) });
  if (!target) throw new AccessError("Deze bestemming bestaat niet.");
  if (target.id === source.id) throw new AccessError("Kies een andere ruimte dan de eigen privé-ruimte.");

  const roots = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.spaceId, source.id), isNull(pages.parentId)));

  const moved = await db.transaction(async (tx) => {
    const [container] = await tx
      .insert(pages)
      .values({ spaceId: target.id, title: `Werk van ${from.name}`, createdBy: actor.id, updatedBy: actor.id, position: Date.now() })
      .returning();
    const all = await tx.select({ id: pages.id }).from(pages).where(eq(pages.spaceId, source.id));
    if (all.length) {
      await tx.update(pages).set({ spaceId: target.id }).where(inArray(pages.id, all.map((p) => p.id)));
    }
    if (roots.length) {
      await tx.update(pages).set({ parentId: container.id }).where(inArray(pages.id, roots.map((p) => p.id)));
    }
    if (args.deactivate) await tx.update(users).set({ active: false }).where(eq(users.id, from.id));
    return { containerId: container.id, count: all.length };
  });

  await log(actor, "werk.overgedragen", {
    pageId: moved.containerId,
    spaceId: target.id,
    subjectUserId: from.id,
    details: { pages: moved.count, deactivated: args.deactivate },
  });
  return moved;
}
