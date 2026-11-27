import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  integer,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/** Rechtenniveaus, van laag naar hoog. Volgorde staat ook in src/lib/permissions.ts. */
export const accessLevel = pgEnum("access_level", ["read", "comment", "edit", "full"]);

/** Gewone pagina, database (met rijen) of rij in een database. */
export const pageKind = pgEnum("page_kind", ["page", "database", "row"]);

/** Privé-ruimte (één per persoon) of teamruimte (bijvoorbeeld "Stagiairs" of de Social Media Hub). */
export const spaceKind = pgEnum("space_kind", ["private", "team"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Object-id uit Microsoft Entra ID. Leeg voor lokale testgebruikers. */
    entraOid: text("entra_oid").unique(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    active: boolean("active").notNull().default(true),
    /** Moment waarop iemand de privacymelding (beheerders kunnen alles inzien) heeft gezien. */
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }),
    /** De persoonlijke To Do-database (R36), aangemaakt met de stagiair-werkplek (R10). */
    todoPageId: uuid("todo_page_id"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: spaceKind("kind").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    /** Eigenaar van een privé-ruimte. Leeg bij teamruimtes. */
    ownerId: uuid("owner_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("spaces_owner_idx").on(t.ownerId)],
);

/** Wie in een teamruimte zit, en met welk niveau. */
export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    level: accessLevel("level").notNull().default("edit"),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").notNull().references(() => spaces.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => pages.id),
    kind: pageKind("kind").notNull().default("page"),
    /** Alleen bij databases: velden en weergaven (zie src/lib/db-model.ts). */
    dbSchema: jsonb("db_schema"),
    /** Alleen bij rijen: waarden per veld-id. */
    props: jsonb("props"),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    /** Pagina over de volle breedte van het scherm, zoals in Notion. */
    fullWidth: boolean("full_width").notNull().default(false),
    /** Volgorde tussen broertjes en zusjes. */
    position: doublePrecision("position").notNull().default(0),
    /** Losse kenmerken, zoals { type: "welcome" } voor de welkomstpagina die nog gevuld moet worden. */
    content: jsonb("content"),
    /** De inhoud van de editor als Yjs-document (zie src/lib/docs.ts). Leeg = lege pagina. */
    doc: bytea("doc"),
    /** Platte tekst van de inhoud, voor zoeken (R70). Wordt bij elke opslag opnieuw bepaald. */
    searchText: text("search_text").notNull().default(""),
    /** Zoekindex op titel (zwaarder) en inhoud, met Nederlandse woordstammen. */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('dutch', coalesce(title, '')), 'A') || setweight(to_tsvector('dutch', coalesce(search_text, '')), 'B')`,
    ),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Gevuld = in de prullenbak (R63). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
  },
  (t) => [
    index("pages_space_idx").on(t.spaceId),
    index("pages_parent_idx").on(t.parentId),
    index("pages_search_idx").using("gin", t.searchVector),
  ],
);

/** Een pagina delen met een collega (R04). Geldt ook voor alle subpagina's. */
export const pageGrants = pgTable(
  "page_grants",
  {
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    level: accessLevel("level").notNull(),
    grantedBy: uuid("granted_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.userId] }), index("page_grants_user_idx").on(t.userId)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pageId] })],
);

/**
 * Inzagelog (R93): elke keer dat een beheerder iets bekijkt wat hij alleen via de beheerdersrol mag zien,
 * en elke beheeractie (zoals overdragen). Wordt nooit door de app verwijderd.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    pageId: uuid("page_id"),
    spaceId: uuid("space_id"),
    /** Van wie de inhoud is (bij inzage in een privé-ruimte). */
    subjectUserId: uuid("subject_user_id"),
    details: jsonb("details"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_at_idx").on(t.at), index("audit_log_subject_idx").on(t.subjectUserId)],
);

/** Geüploade bestanden en afbeeldingen (R25). Het bestand zelf staat in Azure Blob Storage (lokaal: op schijf). */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** De pagina waarop het bestand is geüpload; bepaalt wie het mag zien. */
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_page_idx").on(t.pageId)],
);

/** Wie een pagina nu open heeft, voor de melding "Nikki is deze pagina ook aan het bewerken". */
export const pagePresence = pgTable(
  "page_presence",
  {
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    editing: boolean("editing").notNull().default(false),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.userId] })],
);

/** Imports uit Notion (blok 3). Het Notion-token wordt nooit opgeslagen; alleen de voortgang en het logboek. */
export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  status: text("status", { enum: ["bezig", "klaar", "mislukt"] }).notNull().default("bezig"),
  source: text("source").notNull(),
  targetSpaceId: uuid("target_space_id").notNull().references(() => spaces.id),
  rootPageId: uuid("root_page_id"),
  log: jsonb("log").$type<string[]>().notNull().default([]),
  stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type Space = typeof spaces.$inferSelect;
export type Page = typeof pages.$inferSelect;
