import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, spaces, users } from "@/db/schema";
import { can } from "./permissions";
import { AccessError, getPageAccess, requirePageLevel, type CurrentUser } from "./access";
import {
  addDays,
  cleanValue,
  dayOf,
  dbSchemaSchema,
  firstOfType,
  statusGroupOf,
  withDefaults,
  type DateValue,
  type DbSchema,
  type Props,
  type Row,
} from "./db-model";
import { makeDbSchema, type DbTemplate } from "./db-templates";

export interface DatabaseData {
  id: string;
  title: string;
  schema: DbSchema;
  rows: Row[];
  canEdit: boolean;
  /** Actieve collega's (voor het persoonsveld) en iedereen die in de rijen genoemd wordt. */
  people: { id: string; name: string }[];
}

function toRow(r: { id: string; title: string; props: unknown; createdAt: Date; updatedAt: Date }): Row {
  return {
    id: r.id,
    title: r.title,
    props: (r.props as Props | null) ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function nextPosition(parentId: string) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${pages.position})` })
    .from(pages)
    .where(eq(pages.parentId, parentId));
  return (row?.max ?? 0) + 1;
}

async function loadSchema(databaseId: string): Promise<DbSchema> {
  const [row] = await db.select({ kind: pages.kind, dbSchema: pages.dbSchema }).from(pages).where(eq(pages.id, databaseId));
  if (row?.kind !== "database") throw new AccessError("Dit is geen database.");
  return dbSchemaSchema.parse(row.dbSchema);
}

// ---------------------------------------------------------------------------------------------
// Databases
// ---------------------------------------------------------------------------------------------

export async function createDatabase(
  user: CurrentUser,
  target: { parentId?: string | null; spaceId?: string },
  opts: { title?: string; template?: DbTemplate } = {},
) {
  let spaceId: string;
  let parentId: string | null = null;
  if (target.parentId) {
    const parent = await requirePageLevel(user, target.parentId, can.edit);
    if (parent.page.kind === "database") throw new AccessError("Een database kan niet direct in een andere database.");
    spaceId = parent.space.id;
    parentId = parent.page.id;
  } else if (target.spaceId) {
    const { getSpaceAccess } = await import("./access");
    const access = await getSpaceAccess(user, target.spaceId);
    if (!can.edit(access.level) || access.viaAdmin) throw new AccessError("Je mag in deze ruimte geen pagina's maken.");
    spaceId = access.space.id;
  } else throw new AccessError("Geef aan waar de database moet komen.");

  const template = opts.template ?? "leeg";
  const [page] = await db
    .insert(pages)
    .values({
      spaceId,
      parentId,
      kind: "database",
      title: opts.title ?? "",
      dbSchema: makeDbSchema(template),
      createdBy: user.id,
      updatedBy: user.id,
      position: parentId ? await nextPosition(parentId) : Date.now() / 1e9,
    })
    .returning({ id: pages.id });
  return page;
}

export async function getDatabase(user: CurrentUser, databaseId: string): Promise<DatabaseData> {
  const access = await getPageAccess(user, databaseId, { logAdminView: false });
  if (access.page.kind !== "database") throw new AccessError("Dit is geen database.");
  const schema = await loadSchema(databaseId);
  const rows = await db
    .select({ id: pages.id, title: pages.title, props: pages.props, createdAt: pages.createdAt, updatedAt: pages.updatedAt })
    .from(pages)
    .where(and(eq(pages.parentId, databaseId), eq(pages.kind, "row"), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position), asc(pages.createdAt));
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name));
  return {
    id: databaseId,
    title: access.page.title,
    schema,
    rows: rows.map(toRow),
    canEdit: can.edit(access.level) && !access.viaAdmin && !access.page.deletedAt,
    people,
  };
}

/** Velden en weergaven opslaan. Waarden van verwijderde velden blijven in de rijen staan, maar worden niet meer getoond. */
export async function saveSchema(user: CurrentUser, databaseId: string, schema: unknown) {
  const access = await requirePageLevel(user, databaseId, can.edit);
  if (access.page.kind !== "database") throw new AccessError("Dit is geen database.");
  const clean = dbSchemaSchema.parse(schema);
  await db.update(pages).set({ dbSchema: clean, updatedBy: user.id, updatedAt: new Date() }).where(eq(pages.id, databaseId));
  return clean;
}

// ---------------------------------------------------------------------------------------------
// Rijen
// ---------------------------------------------------------------------------------------------

function cleanProps(schema: DbSchema, input: Record<string, unknown>): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(input)) {
    const prop = schema.properties.find((p) => p.id === key);
    if (prop) out[key] = cleanValue(prop, value);
  }
  return out;
}

export async function createRow(user: CurrentUser, databaseId: string, input: { title?: string; props?: Record<string, unknown> }) {
  const access = await requirePageLevel(user, databaseId, can.edit);
  if (access.page.kind !== "database" || access.page.deletedAt) throw new AccessError("Hier kun je geen rij toevoegen.");
  const schema = await loadSchema(databaseId);
  const [row] = await db
    .insert(pages)
    .values({
      spaceId: access.space.id,
      parentId: databaseId,
      kind: "row",
      title: (input.title ?? "").slice(0, 300),
      props: withDefaults(schema, cleanProps(schema, input.props ?? {})),
      createdBy: user.id,
      updatedBy: user.id,
      position: await nextPosition(databaseId),
    })
    .returning({ id: pages.id, title: pages.title, props: pages.props, createdAt: pages.createdAt, updatedAt: pages.updatedAt });
  return toRow(row);
}

async function requireRow(user: CurrentUser, rowId: string) {
  const access = await requirePageLevel(user, rowId, can.edit);
  if (access.page.kind !== "row" || !access.page.parentId) throw new AccessError("Dit is geen rij in een database.");
  return access;
}

export async function updateRow(user: CurrentUser, rowId: string, patch: { title?: string; props?: Record<string, unknown> }) {
  const access = await requireRow(user, rowId);
  const schema = await loadSchema(access.page.parentId!);
  const [current] = await db.select({ props: pages.props }).from(pages).where(eq(pages.id, rowId));
  const props = { ...((current?.props as Props | null) ?? {}), ...cleanProps(schema, patch.props ?? {}) };
  await db
    .update(pages)
    .set({
      props,
      ...(patch.title === undefined ? {} : { title: patch.title.slice(0, 300) }),
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(pages.id, rowId));
}

/** Rij naar de prullenbak. Voor rijen volstaan bewerkrechten op de database, zoals in Notion. */
export async function deleteRow(user: CurrentUser, rowId: string) {
  await requireRow(user, rowId);
  await db.update(pages).set({ deletedAt: new Date(), deletedBy: user.id }).where(eq(pages.id, rowId));
}

export async function moveRow(user: CurrentUser, rowId: string, beforeRowId: string | null) {
  const access = await requireRow(user, rowId);
  const siblings = await db
    .select({ id: pages.id, position: pages.position })
    .from(pages)
    .where(and(eq(pages.parentId, access.page.parentId!), eq(pages.kind, "row"), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position), asc(pages.createdAt));
  const others = siblings.filter((s) => s.id !== rowId);
  const idx = beforeRowId ? others.findIndex((s) => s.id === beforeRowId) : others.length;
  const prev = others[idx - 1]?.position ?? (others[0]?.position ?? 1) - 1;
  const next = others[idx]?.position ?? prev + 2;
  await db.update(pages).set({ position: (prev + next) / 2 }).where(eq(pages.id, rowId));
}

/** Schema en waarden van één rij, voor de eigenschappen bovenaan een rijpagina. */
export async function getRowContext(user: CurrentUser, rowId: string) {
  const access = await getPageAccess(user, rowId, { logAdminView: false });
  if (access.page.kind !== "row" || !access.page.parentId) return null;
  const schema = await loadSchema(access.page.parentId);
  const [row] = await db.select({ props: pages.props }).from(pages).where(eq(pages.id, rowId));
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name));
  return { databaseId: access.page.parentId, schema, props: (row?.props as Props | null) ?? {}, people };
}

// ---------------------------------------------------------------------------------------------
// Mijn taken (R35) en To Do (R36)
// ---------------------------------------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  databaseId: string;
  databaseTitle: string;
  day: string | null;
  time: string | null;
  statusName: string | null;
  statusColor: string | null;
  listName: string | null;
  listColor: string | null;
  own: boolean;
}

/**
 * Alle openstaande taken van deze gebruiker: rijen uit de eigen To Do, plus rijen in andere databases waar je bij
 * een persoonsveld staat. "Open" = status niet in de groep Klaar.
 */
export async function myTasks(user: CurrentUser): Promise<Task[]> {
  const me = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { todoPageId: true } });
  const rows = await db.execute<{
    id: string;
    title: string;
    props: Props | null;
    db_id: string;
    db_title: string;
    db_schema: DbSchema;
  }>(sql`
    WITH RECURSIVE granted AS (
      SELECT g.page_id AS id FROM page_grants g WHERE g.user_id = ${user.id}
      UNION
      SELECT c.id FROM pages c JOIN granted gr ON c.parent_id = gr.id
    )
    SELECT r.id, r.title, r.props, d.id AS db_id, d.title AS db_title, d.db_schema
    FROM pages r
    JOIN pages d ON d.id = r.parent_id AND d.kind = 'database' AND d.deleted_at IS NULL
    JOIN spaces s ON s.id = r.space_id
    WHERE r.kind = 'row' AND r.deleted_at IS NULL
      AND (
        (s.kind = 'private' AND s.owner_id = ${user.id})
        OR EXISTS (SELECT 1 FROM space_members m WHERE m.space_id = s.id AND m.user_id = ${user.id})
        OR r.id IN (SELECT id FROM granted)
      )
      AND (d.id = ${me?.todoPageId ?? null} OR r.props::text LIKE ${"%" + user.id + "%"})
    LIMIT 2000`);

  const tasks: Task[] = [];
  for (const r of rows) {
    const schema = r.db_schema;
    const props = r.props ?? {};
    const own = r.db_id === me?.todoPageId;
    const persons = schema.properties.filter((p) => p.type === "person");
    if (!own && !persons.some((p) => ((props[p.id] as string[] | null) ?? []).includes(user.id))) continue;
    const status = firstOfType(schema, "status");
    if (status && statusGroupOf(status, props[status.id] ?? null) === "done") continue;
    const date = firstOfType(schema, "date");
    const dateValue = date ? (props[date.id] as DateValue | null) : null;
    const statusOpt = status?.options?.find((o) => o.id === props[status.id]);
    const list = firstOfType(schema, "select");
    const listOpt = list?.options?.find((o) => o.id === props[list.id]);
    tasks.push({
      id: r.id,
      title: r.title,
      databaseId: r.db_id,
      databaseTitle: r.db_title,
      day: dayOf(dateValue),
      time: dateValue?.start.length === 16 ? dateValue.start.slice(11) : null,
      statusName: statusOpt?.name ?? null,
      statusColor: statusOpt?.color ?? null,
      listName: listOpt?.name ?? null,
      listColor: listOpt?.color ?? null,
      own,
    });
  }
  return tasks.sort((a, b) => (a.day ?? "9999") .localeCompare(b.day ?? "9999") || (a.time ?? "").localeCompare(b.time ?? ""));
}

export async function quickAddTodo(user: CurrentUser, title: string, day: string | null) {
  const me = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { todoPageId: true } });
  if (!me?.todoPageId) throw new AccessError("Je hebt nog geen To Do. Log opnieuw in om je werkplek in te richten.");
  const schema = await loadSchema(me.todoPageId);
  const date = firstOfType(schema, "date");
  return createRow(user, me.todoPageId, { title, props: date && day ? { [date.id]: { start: day } } : {} });
}

/** Afvinken: de status wordt de eerste optie uit de groep Klaar. */
export async function completeTask(user: CurrentUser, rowId: string) {
  const access = await requireRow(user, rowId);
  const schema = await loadSchema(access.page.parentId!);
  const status = firstOfType(schema, "status");
  const done = status?.options?.find((o) => o.group === "done");
  if (!status || !done) throw new AccessError("Deze database heeft geen status met Klaar.");
  await updateRow(user, rowId, { props: { [status.id]: done.id } });
}

/** Doorschuiven (R36): zet de datum op een andere dag, met behoud van de tijd. */
export async function rescheduleTask(user: CurrentUser, rowId: string, day: string) {
  const access = await requireRow(user, rowId);
  const schema = await loadSchema(access.page.parentId!);
  const date = firstOfType(schema, "date");
  if (!date) throw new AccessError("Deze database heeft geen datumveld.");
  const [row] = await db.select({ props: pages.props }).from(pages).where(eq(pages.id, rowId));
  const current = ((row?.props as Props | null) ?? {})[date.id] as DateValue | null;
  const time = current?.start.length === 16 ? current.start.slice(10) : "";
  await updateRow(user, rowId, { props: { [date.id]: { start: day + time } } });
}

export { addDays };

// ---------------------------------------------------------------------------------------------
// Stagiair-werkplek (R10)
// ---------------------------------------------------------------------------------------------

/**
 * Richt de privé-ruimte in zoals de huidige stagiair-werkplek in Notion: een startpagina met To Do, kalender en taken,
 * notities, tips en afgeronde projecten. Gebeurt één keer per gebruiker (bij de eerste login).
 * De startpagina krijgt haar blokken in de browser bij de eerste keer openen (zie components/editor/templates.ts).
 */
export async function provisionWorkspace(user: { id: string }) {
  const me = await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { todoPageId: true } });
  if (me?.todoPageId) return;
  const space = await db.query.spaces.findFirst({ where: and(eq(spaces.kind, "private"), eq(spaces.ownerId, user.id)) });
  if (!space) return;

  await db.transaction(async (tx) => {
    const base = { spaceId: space.id, createdBy: user.id, updatedBy: user.id };
    const [home] = await tx
      .insert(pages)
      .values({ ...base, title: "Mijn werkplek", icon: "🏠", position: -1, fullWidth: true })
      .returning({ id: pages.id });
    const child = async (title: string, values: Partial<typeof pages.$inferInsert>, position: number) =>
      (await tx.insert(pages).values({ ...base, parentId: home.id, title, position, ...values }).returning({ id: pages.id }))[0].id;

    const todo = await child("To Do", { kind: "database", dbSchema: makeDbSchema("todo") }, 1);
    const calendar = await child("Kalender en taken", { kind: "database", dbSchema: makeDbSchema("taken") }, 2);
    const notes = await child("Notities", { kind: "database", dbSchema: makeDbSchema("notities") }, 3);
    const projects = await child("Afgeronde projecten", { kind: "database", dbSchema: makeDbSchema("projecten") }, 4);
    const tips = await child("Tips en tricks", { content: { template: "tips" } }, 5);
    const logbook = await child("Logboek", { content: { template: "logboek" } }, 6);

    await tx
      .update(pages)
      .set({ content: { template: "werkplek", refs: { todo, calendar, notes, projects, tips, logbook } } })
      .where(eq(pages.id, home.id));
    await tx.update(users).set({ todoPageId: todo }).where(eq(users.id, user.id));
  });
}

/** Alle databases die je mag bewerken, voor "verplaatsen" en koppelingen. */
export async function databaseTitles(ids: string[]) {
  if (!ids.length) return {};
  const rows = await db.select({ id: pages.id, title: pages.title }).from(pages).where(inArray(pages.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.title]));
}
