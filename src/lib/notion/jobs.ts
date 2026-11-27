import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { importJobs, spaces, users } from "@/db/schema";

/** De laatste imports, voor Beheer → Importeren uit Notion. */
export async function listImportJobs() {
  return db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      source: importJobs.source,
      rootPageId: importJobs.rootPageId,
      log: importJobs.log,
      stats: importJobs.stats,
      error: importJobs.error,
      createdAt: importJobs.createdAt,
      finishedAt: importJobs.finishedAt,
      spaceName: spaces.name,
      spaceKind: spaces.kind,
      ownerName: users.name,
    })
    .from(importJobs)
    .innerJoin(spaces, eq(spaces.id, importJobs.targetSpaceId))
    .leftJoin(users, eq(users.id, spaces.ownerId))
    .orderBy(sql`${importJobs.createdAt} desc`)
    .limit(20);
}
