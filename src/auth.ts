import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { upsertUserFromLogin } from "@/lib/access";

/**
 * Testlogin zonder Microsoft. Alleen lokaal: staat uit tenzij AUTH_DEV_LOGIN=true,
 * en werkt nooit op Azure App Service (daar is WEBSITE_SITE_NAME altijd gezet).
 */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true" && !process.env.WEBSITE_SITE_NAME;
export const entraEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Beheerder volgens Entra: lid van de groep ADMIN_GROUP_ID, of (zonder groep) in ADMIN_EMAILS. */
function isAdminFromEntra(email: string, groups: unknown): boolean | undefined {
  const groupId = process.env.ADMIN_GROUP_ID;
  if (groupId) return Array.isArray(groups) && groups.includes(groupId);
  if (adminEmails.length) return adminEmails.includes(email.toLowerCase());
  return undefined; // niets ingesteld: bestaande waarde in de database laten staan
}

const providers: NextAuthConfig["providers"] = [];
if (entraEnabled) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Testgebruiker",
      credentials: { email: { label: "E-mail" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase();
        const user = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (!user || user.entraOid) return null; // alleen geseede testgebruikers
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "microsoft-entra-id") return true;
      const oid = (profile?.oid as string | undefined) ?? (profile?.sub as string | undefined);
      const email = (profile?.email as string | undefined) ?? (profile?.preferred_username as string | undefined);
      if (!oid || !email) return false;
      const user = await upsertUserFromLogin({
        entraOid: oid,
        email,
        name: (profile?.name as string | undefined) ?? email,
        isAdmin: isAdminFromEntra(email, profile?.groups),
      });
      return user.active;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "microsoft-entra-id") {
        const oid = (profile?.oid as string | undefined) ?? (profile?.sub as string | undefined);
        const row = oid ? await db.query.users.findFirst({ where: eq(users.entraOid, oid) }) : undefined;
        if (row) token.uid = row.id;
      } else if (account?.provider === "dev" && user?.id) {
        await upsertUserFromLogin({ entraOid: null, email: user.email!, name: user.name ?? user.email! });
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
