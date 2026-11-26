import Link from "next/link";
import { requireUser } from "@/lib/session";
import { searchPages } from "@/lib/search";

export const metadata = { title: "Zoeken" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").slice(0, 200);
  const hits = q ? await searchPages(user, q) : [];
  return (
    <article className="page">
      <form action="/zoeken" role="search" className="row" style={{ marginBottom: 20 }}>
        <input
          type="search"
          name="q"
          id="search-q"
          defaultValue={q}
          autoFocus
          placeholder="Zoek in titels en tekst…"
          aria-label="Zoeken"
          className="search-input"
        />
        <button className="btn primary" type="submit">Zoeken</button>
      </form>
      {q && hits.length === 0 && <p className="muted">Niets gevonden voor &quot;{q}&quot;. Probeer een ander of korter woord.</p>}
      <ol className="search-hits">
        {hits.map((h) => (
          <li key={h.id}>
            <Link href={`/p/${h.id}`} className="hit">
              <span className="hit-title">{h.title || "Naamloos"}</span>
              <span className="muted hit-meta">
                {h.spaceName} · {h.updatedAt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" })}
              </span>
              {/* snippet is in src/lib/search.ts ge-escaped; alleen <b> komt erdoor */}
              {h.snippet && <span className="hit-snippet" dangerouslySetInnerHTML={{ __html: h.snippet }} />}
            </Link>
          </li>
        ))}
      </ol>
    </article>
  );
}
