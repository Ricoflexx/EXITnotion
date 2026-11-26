import { redirect } from "next/navigation";
import { auth, devLoginEnabled, entraEnabled } from "@/auth";
import { loginDev, loginMicrosoft } from "@/app/actions";
import { db } from "@/db";
import { isNull } from "drizzle-orm";
import { users } from "@/db/schema";

export const metadata = { title: "Inloggen" };

const errors: Record<string, string> = {
  uitgezet: "Je account staat uit. Vraag een beheerder om het weer aan te zetten.",
  AccessDenied: "Inloggen is niet gelukt. Gebruik je EXIT-account, of vraag een beheerder om hulp.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fout?: string; error?: string }> }) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user?.id && !params.fout) redirect("/");
  const error = errors[params.fout ?? params.error ?? ""] ?? (params.error ? "Inloggen is niet gelukt. Probeer het opnieuw." : null);
  const testUsers = devLoginEnabled
    ? await db.select({ email: users.email, name: users.name }).from(users).where(isNull(users.entraOid))
    : [];

  return (
    <main className="center">
      <div className="card">
        <h1>EXITnotion</h1>
        <p className="muted" style={{ margin: 0 }}>Plannen, notuleren en ideeën uitwerken. Log in met je EXIT-account.</p>
        {error && <div className="banner admin">{error}</div>}
        {entraEnabled && (
          <form action={loginMicrosoft}>
            <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
              Inloggen met Microsoft
            </button>
          </form>
        )}
        {!entraEnabled && !devLoginEnabled && (
          <div className="banner admin">Inloggen is nog niet ingesteld. Zie docs/azure-setup.md.</div>
        )}
        {devLoginEnabled && (
          <form action={loginDev} className="row">
            <select name="email" id="dev-email" aria-label="Testgebruiker" style={{ flex: 1 }}>
              {testUsers.map((u) => (
                <option key={u.email} value={u.email}>{u.name}</option>
              ))}
            </select>
            <button className="btn" type="submit">Testlogin</button>
          </form>
        )}
        {devLoginEnabled && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Testlogin staat aan: alleen voor lokaal ontwikkelen.</p>}
        <div className="payoff">GO PLAY!</div>
      </div>
    </main>
  );
}
