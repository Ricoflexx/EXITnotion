import Link from "next/link";
import { adminOverview } from "@/lib/admin";
import { requireUser } from "@/lib/session";
import { LEVEL_LABELS } from "@/lib/permissions";
import { adminCreateTeam, adminSetActive, adminSetMember, adminTransfer } from "@/app/actions";

export const metadata = { title: "Beheer" };

const ACTIONS: Record<string, string> = {
  "beheerder.inzage": "Bekeek als beheerder",
  "gebruiker.uitgezet": "Zette account uit",
  "gebruiker.aangezet": "Zette account aan",
  "teamruimte.gemaakt": "Maakte teamruimte",
  "teamruimte.lid": "Wijzigde lid van teamruimte",
  "werk.overgedragen": "Droeg werk over",
  "notion.import": "Importeerde uit Notion",
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }) : "nooit";

export default async function AdminPage() {
  const user = await requireUser();
  if (!user.isAdmin) {
    return (
      <article className="page">
        <h1 className="title-input">Geen toegang</h1>
        <p className="muted">Alleen beheerders kunnen deze pagina zien.</p>
      </article>
    );
  }
  const { people, teams, recentLog } = await adminOverview(user);
  const names = new Map(people.map((p) => [p.id, p.name]));

  return (
    <article className="page" style={{ maxWidth: 1000 }}>
      <h1 className="title-input">Beheer</h1>

      <h2>Gebruikers</h2>
      <div className="tablewrap">
        <table className="list">
          <thead>
            <tr><th>Naam</th><th>Laatst ingelogd</th><th>Pagina&apos;s</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name} {p.isAdmin && <span className="tag">Beheerder</span>}
                  <div className="muted" style={{ fontSize: 14 }}>{p.email}</div>
                </td>
                <td className="muted">{fmt(p.lastLoginAt)}</td>
                <td>
                  <Link href={`/beheer/gebruiker/${p.id}`}>{p.pageCount ?? 0} bekijken</Link>
                </td>
                <td>{p.active ? "Actief" : <span className="tag">Uitgezet</span>}</td>
                <td style={{ textAlign: "right" }}>
                  {p.id !== user.id && (
                    <form action={adminSetActive}>
                      <input type="hidden" name="userId" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <button className="btn" type="submit">{p.active ? "Uitzetten" : "Aanzetten"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Teamruimtes</h2>
      {teams.map((t) => (
        <details className="panel" key={t.id}>
          <summary>{t.name} · {t.members.length} leden</summary>
          <div>
            {t.members.map((m) => (
              <form key={m.id} action={adminSetMember} className="row">
                <input type="hidden" name="spaceId" value={t.id} />
                <input type="hidden" name="userId" value={m.id} />
                <span style={{ flex: 1 }}>{m.name}</span>
                <select name="level" aria-label={`Rechten van ${m.name}`} defaultValue={m.level}>
                  <option value="read">{LEVEL_LABELS.read}</option>
                  <option value="comment">{LEVEL_LABELS.comment}</option>
                  <option value="edit">{LEVEL_LABELS.edit}</option>
                  <option value="full">{LEVEL_LABELS.full}</option>
                  <option value="remove">Verwijderen uit ruimte</option>
                </select>
                <button className="btn" type="submit">Opslaan</button>
              </form>
            ))}
            <form action={adminSetMember} className="row">
              <input type="hidden" name="spaceId" value={t.id} />
              <select name="userId" aria-label="Nieuw lid">
                {people.filter((p) => p.active && !t.members.some((m) => m.id === p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input type="hidden" name="level" value="edit" />
              <button className="btn primary" type="submit">Toevoegen</button>
            </form>
          </div>
        </details>
      ))}
      <form action={adminCreateTeam} className="row" style={{ marginTop: 12 }}>
        <input type="text" name="name" id="team-name" placeholder="Bijvoorbeeld Social Media Hub" aria-label="Naam van de teamruimte" required />
        <button className="btn" type="submit">Teamruimte maken</button>
      </form>

      <h2>Werk overdragen bij vertrek</h2>
      <p className="muted">Alle pagina&apos;s uit iemands privé-ruimte komen onder één nieuwe pagina &quot;Werk van …&quot; in de ruimte die je kiest.</p>
      <form action={adminTransfer} className="row">
        <select name="fromUserId" aria-label="Van wie">
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span>naar</span>
        <select name="toSpaceId" aria-label="Naar welke ruimte">
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {people.filter((p) => p.privateSpaceId).map((p) => <option key={p.privateSpaceId!} value={p.privateSpaceId!}>Privé van {p.name}</option>)}
        </select>
        <label className="row" style={{ gap: 4 }}>
          <input type="checkbox" name="deactivate" /> account daarna uitzetten
        </label>
        <button className="btn primary" type="submit">Overdragen</button>
      </form>

      <h2>Importeren uit Notion</h2>
      <p className="muted">Werkplekken uit Notion overzetten, met subpagina&apos;s, databases en afbeeldingen.</p>
      <p><Link href="/beheer/import" className="btn">Naar importeren</Link></p>

      <h2>Inzagelog</h2>
      <p className="muted">Elke inzage door een beheerder in iets wat niet met hem gedeeld is, en elke beheeractie. Dit log wordt nooit door de app verwijderd.</p>
      <div className="tablewrap">
        <table className="list">
          <thead><tr><th>Wanneer</th><th>Wie</th><th>Wat</th><th>Van wie</th></tr></thead>
          <tbody>
            {recentLog.map((l) => (
              <tr key={l.id}>
                <td className="muted">{fmt(l.at)}</td>
                <td>{l.actorName}</td>
                <td>
                  {ACTIONS[l.action] ?? l.action}
                  {l.pageId && <> · <Link href={`/p/${l.pageId}`}>{l.pageTitle || "Naamloos"}</Link></>}
                </td>
                <td>{l.subjectUserId ? names.get(l.subjectUserId) ?? "—" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
