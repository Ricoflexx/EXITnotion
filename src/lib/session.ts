import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUser, type CurrentUser } from "./access";

/**
 * De ingelogde gebruiker, vers uit de database (zodat uitzetten of beheerdersrechten direct gelden).
 * Stuurt naar /login als er niemand is ingelogd of het account is uitgezet,
 * en naar /privacy als de privacymelding nog niet is gezien (B5).
 */
export const requireUser = cache(async (opts: { allowWithoutPrivacy?: boolean } = {}): Promise<CurrentUser> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const user = await getUser(id);
  if (!user || !user.active) redirect("/login?fout=uitgezet");
  if (!user.privacyAcceptedAt && !opts.allowWithoutPrivacy) redirect("/privacy");
  return { id: user.id, isAdmin: user.isAdmin, active: user.active, name: user.name, email: user.email };
});
