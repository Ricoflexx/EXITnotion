"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import * as access from "@/lib/access";
import * as admin from "@/lib/admin";
import * as docs from "@/lib/docs";
import * as dbs from "@/lib/databases";
import { DB_TEMPLATES } from "@/lib/db-templates";
import { PAGE_TEMPLATES } from "@/lib/page-templates";
import { mentionTargets } from "@/lib/search";

const id = z.uuid();
const grantLevel = z.enum(["read", "comment", "edit", "full"]);

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}

// --- Inloggen -------------------------------------------------------------------------------

export async function loginMicrosoft() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

export async function loginDev(form: FormData) {
  await signIn("dev", { email: str(form, "email"), redirectTo: "/" });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function acceptPrivacy() {
  const user = await requireUser({ allowWithoutPrivacy: true });
  await db.update(users).set({ privacyAcceptedAt: new Date() }).where(eq(users.id, user.id));
  redirect("/");
}

// --- Pagina's -------------------------------------------------------------------------------

export async function newPage(form: FormData) {
  const user = await requireUser();
  const parentId = form.get("parentId") ? id.parse(str(form, "parentId")) : null;
  const spaceId = form.get("spaceId") ? id.parse(str(form, "spaceId")) : undefined;
  const page = await access.createPage(user, { parentId, spaceId });
  revalidatePath("/", "layout");
  redirect(`/p/${page.id}`);
}

export async function saveTitle(pageId: string, title: string) {
  const user = await requireUser();
  await access.renamePage(user, id.parse(pageId), z.string().max(300).parse(title));
  revalidatePath("/", "layout");
}

// --- Editor (Yjs) ---------------------------------------------------------------------------

const b64 = z.string().max(14_000_000).regex(/^[A-Za-z0-9+/=]*$/);

export async function pushDocUpdate(pageId: string, update: string) {
  const user = await requireUser();
  await docs.applyDocUpdate(user, id.parse(pageId), b64.parse(update));
}

export async function pullDocUpdates(pageId: string, stateVector: string | null, editing: boolean) {
  const user = await requireUser();
  return docs.pullDoc(user, id.parse(pageId), stateVector === null ? null : b64.parse(stateVector), Boolean(editing));
}

export async function templateDone(pageId: string) {
  const user = await requireUser();
  await docs.clearTemplateFlag(user, id.parse(pageId));
}

export async function findMentionTargets(query: string) {
  const user = await requireUser();
  return mentionTargets(user, z.string().max(100).parse(query));
}

export async function toggleFullWidth(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  await access.setFullWidth(user, pageId, str(form, "fullWidth") === "true");
  revalidatePath(`/p/${pageId}`);
}

export async function trash(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  const { page } = await access.getPageAccess(user, pageId, { logAdminView: false });
  await access.trashPage(user, pageId);
  revalidatePath("/", "layout");
  redirect(page.parentId ? `/p/${page.parentId}` : "/");
}

export async function restore(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  await access.restorePage(user, pageId);
  revalidatePath("/", "layout");
  redirect(`/p/${pageId}`);
}

export async function favorite(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  await access.toggleFavorite(user, pageId);
  revalidatePath("/", "layout");
}

/** Doel is "space:<id>" (wortel van een ruimte) of "page:<id>" (onder een pagina). */
export async function move(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  const [kind, targetId] = str(form, "target").split(":");
  await access.movePage(user, pageId, kind === "page" ? { parentId: id.parse(targetId) } : { spaceId: id.parse(targetId) });
  revalidatePath("/", "layout");
  redirect(`/p/${pageId}`);
}

export async function share(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  await access.sharePage(user, pageId, id.parse(str(form, "userId")), grantLevel.parse(str(form, "level")));
  revalidatePath(`/p/${pageId}`);
}

export async function unshare(form: FormData) {
  const user = await requireUser();
  const pageId = id.parse(str(form, "pageId"));
  await access.unsharePage(user, pageId, id.parse(str(form, "userId")));
  revalidatePath(`/p/${pageId}`);
}

// --- Databases (R30–R34) ---------------------------------------------------------------------

const dbTemplate = z.enum(DB_TEMPLATES);
const pageTemplate = z.enum(PAGE_TEMPLATES);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Nieuwe database als subpagina of in de wortel van een ruimte; opent hem daarna. */
export async function newDatabase(form: FormData) {
  const user = await requireUser();
  const parentId = form.get("parentId") ? id.parse(str(form, "parentId")) : null;
  const spaceId = form.get("spaceId") ? id.parse(str(form, "spaceId")) : undefined;
  const template = dbTemplate.parse(str(form, "template") || "leeg");
  const { DB_TEMPLATE_LABELS } = await import("@/lib/db-templates");
  const page = await dbs.createDatabase(user, { parentId, spaceId }, { template, title: template === "leeg" ? "" : DB_TEMPLATE_LABELS[template] });
  revalidatePath("/", "layout");
  redirect(`/p/${page.id}`);
}

/** Database midden op een pagina (R12): maakt hem als subpagina en geeft het id terug voor het blok in de editor. */
export async function newInlineDatabase(parentId: string, template: string) {
  const user = await requireUser();
  const t = dbTemplate.parse(template);
  const { DB_TEMPLATE_LABELS } = await import("@/lib/db-templates");
  const page = await dbs.createDatabase(user, { parentId: id.parse(parentId) }, { template: t, title: t === "leeg" ? "Database" : DB_TEMPLATE_LABELS[t] });
  revalidatePath("/", "layout");
  return page.id;
}

export async function getDatabaseData(databaseId: string) {
  const user = await requireUser();
  return dbs.getDatabase(user, id.parse(databaseId));
}

export async function saveDatabaseSchema(databaseId: string, schema: unknown) {
  const user = await requireUser();
  return dbs.saveSchema(user, id.parse(databaseId), schema);
}

const rowInput = z.object({ title: z.string().max(300).optional(), props: z.record(z.string(), z.unknown()).optional() });

export async function addDatabaseRow(databaseId: string, input: unknown) {
  const user = await requireUser();
  return dbs.createRow(user, id.parse(databaseId), rowInput.parse(input));
}

export async function updateDatabaseRow(rowId: string, patch: unknown) {
  const user = await requireUser();
  await dbs.updateRow(user, id.parse(rowId), rowInput.parse(patch));
}

export async function deleteDatabaseRow(rowId: string) {
  const user = await requireUser();
  await dbs.deleteRow(user, id.parse(rowId));
}

export async function moveDatabaseRow(rowId: string, beforeRowId: string | null) {
  const user = await requireUser();
  await dbs.moveRow(user, id.parse(rowId), beforeRowId ? id.parse(beforeRowId) : null);
}

// --- Mijn taken en To Do (R35, R36) -----------------------------------------------------------

export async function taskQuickAdd(title: string, forDay: string | null) {
  const user = await requireUser();
  await dbs.quickAddTodo(user, z.string().min(1).max(300).parse(title.trim()), forDay === null ? null : day.parse(forDay));
  revalidatePath("/taken");
}

export async function taskComplete(rowId: string) {
  const user = await requireUser();
  await dbs.completeTask(user, id.parse(rowId));
  revalidatePath("/taken");
}

export async function taskReschedule(rowId: string, toDay: string) {
  const user = await requireUser();
  await dbs.rescheduleTask(user, id.parse(rowId), day.parse(toDay));
  revalidatePath("/taken");
}

// --- Pagina uit sjabloon (R72) ----------------------------------------------------------------

export async function newPageFromTemplate(form: FormData) {
  const user = await requireUser();
  const parentId = form.get("parentId") ? id.parse(str(form, "parentId")) : null;
  const spaceId = form.get("spaceId") ? id.parse(str(form, "spaceId")) : undefined;
  const template = pageTemplate.parse(str(form, "template"));
  const { PAGE_TEMPLATE_TITLES } = await import("@/lib/page-templates");
  const page = await access.createPage(user, { parentId, spaceId, title: PAGE_TEMPLATE_TITLES[template]() });
  await docs.setTemplate(user, page.id, template);
  revalidatePath("/", "layout");
  redirect(`/p/${page.id}`);
}

// --- Beheer ---------------------------------------------------------------------------------

export async function adminSetActive(form: FormData) {
  const user = await requireUser();
  await admin.setUserActive(user, id.parse(str(form, "userId")), str(form, "active") === "true");
  revalidatePath("/beheer");
}

export async function adminCreateTeam(form: FormData) {
  const user = await requireUser();
  await admin.createTeamSpace(user, str(form, "name"));
  revalidatePath("/", "layout");
}

export async function adminSetMember(form: FormData) {
  const user = await requireUser();
  const level = str(form, "level");
  await admin.setTeamMember(
    user,
    id.parse(str(form, "spaceId")),
    id.parse(str(form, "userId")),
    level === "remove" ? null : grantLevel.parse(level),
  );
  revalidatePath("/", "layout");
}

export async function adminStartImport(form: FormData) {
  const user = await requireUser();
  const { startNotionImport } = await import("@/lib/notion/import");
  const { jobId } = await startNotionImport(user, {
    token: str(form, "token"),
    source: str(form, "source"),
    targetSpaceId: id.parse(str(form, "targetSpaceId")),
  });
  // De import loopt op de achtergrond door; de pagina toont de voortgang.
  redirect(`/beheer/import?taak=${jobId}`);
}

export async function adminTransfer(form: FormData) {
  const user = await requireUser();
  const result = await admin.transferWork(user, {
    fromUserId: id.parse(str(form, "fromUserId")),
    toSpaceId: id.parse(str(form, "toSpaceId")),
    deactivate: form.get("deactivate") === "on",
  });
  revalidatePath("/", "layout");
  redirect(`/p/${result.containerId}`);
}
