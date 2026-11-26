import Link from "next/link";
import { adminOverview } from "@/lib/admin";
import { listImportJobs } from "@/lib/notion/jobs";
import { requireUser } from "@/lib/session";
import { adminStartImport } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";

export const metadata = { title: "Importeren uit Notion" };

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }) : "";

const STATS: Record<string, string> = { paginas: "pagina's", databases: "databases", rijen: "rijen", bestanden: "bestanden" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ taak?: string }> }) {
  const user = await requireUser();
  if (!user.isAdmin) {
    return (
      <article className="page">
        <h1 className="title-input">Geen toegang</h1>
        <p className="muted">Alleen beheerders kunnen importeren uit Notion.</p>
      </article>
    );
  }
  const { taak } = await searchParams;
  const [{ people, teams }, jobs] = await Promise.all([adminOverview(user), listImportJobs()]);
  const running = jobs.some((j) => j.status === "bezig");

  return (
    <article className="page">
      <p><Link href="/beheer">← Beheer</Link></p>
      <h1 className="title-input">Importeren uit Notion</h1>
      <p className="muted">
        Zet een Notion-pagina met alles eronder over: subpagina&apos;s, databases met hun rijen, tekst, lijsten, tabellen, kolommen en
        afbeeldingen. De stappen staan in <code>docs/notion-import.md</code>.
      </p>

      <form action={adminStartImport} className="import-form">
        <label>
          Link naar de Notion-pagina
          <input type="text" name="source" id="import-source" required placeholder="https://www.notion.so/Liv-Stage-Workspace-3bb8…" />
        </label>
        <label>
          Token van de Notion-integratie
          <input type="password" name="token" id="import-token" required autoComplete="off" placeholder="ntn_… of secret_…" />
          <span className="muted hint">Wordt alleen voor deze import gebruikt en nergens opgeslagen.</span>
        </label>
        <label>
          Waar moet het komen?
          <select name="targetSpaceId" id="import-target" required>
            {people.filter((p) => p.active && p.privateSpaceId).map((p) => (
              <option key={p.privateSpaceId!} value={p.privateSpaceId!}>Privé van {p.name}</option>
            ))}
            {teams.map((t) => <option key={t.id} value={t.id}>Teamruimte {t.name}</option>)}
          </select>
          <span className="muted hint">Importeren in iemands privé-ruimte komt in het inzagelog.</span>
        </label>
        <button className="btn primary" type="submit">Import starten</button>
      </form>

      {running && <AutoRefresh everyMs={2000} />}
      <h2>Imports</h2>
      {jobs.length === 0 && <p className="muted">Nog geen imports.</p>}
      {jobs.map((j) => (
        <details key={j.id} className="panel" open={j.id === taak || j.status === "bezig"}>
          <summary>
            <span className={`tag status-${j.status}`}>{j.status === "bezig" ? "Bezig…" : j.status === "klaar" ? "Klaar" : "Mislukt"}</span>{" "}
            {j.spaceKind === "private" ? `Privé van ${j.ownerName ?? "?"}` : j.spaceName} · {fmt(j.createdAt)}
          </summary>
          <div>
            {j.status === "klaar" && (
              <p style={{ margin: 0 }}>
                {Object.entries(j.stats)
                  .filter(([k]) => STATS[k])
                  .map(([k, v]) => `${v} ${STATS[k]}`)
                  .join(" · ")}
                {j.rootPageId && <> · <Link href={`/p/${j.rootPageId}`}>Bekijk het resultaat</Link></>}
              </p>
            )}
            {j.error && <p className="db-error" style={{ margin: 0 }}>{j.error}</p>}
            <pre className="import-log">{j.log.slice(-200).join("\n")}</pre>
          </div>
        </details>
      ))}
    </article>
  );
}
