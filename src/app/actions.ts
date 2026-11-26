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
