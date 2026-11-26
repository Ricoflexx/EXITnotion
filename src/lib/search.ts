import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { CurrentUser } from "./access";

export interface SearchHit {
  id: string;
  title: string;
  spaceName: string;
  spaceKind: "private" | "team";
  /** Stukje tekst rond de treffer, met <b>…</b> om de gevonden woorden. Alleen tags <b> en </b>; de rest is ge-escaped. */
  snippet: string;
  updatedAt: Date;
}

/**
 * Maakt van vrije invoer een veilige tsquery: losse woorden, elk als voorvoegsel, alles moet voorkomen.
 * "draai dag" → "draai:* & dag:*"
 */
export function toPrefixQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  if (!words.length) return null;
  return words.map((w) => `${w}:*`).join(" & ");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Zoeken in titels en inhoud (R70). Alleen pagina's waar je normale toegang toe hebt: je eigen privé-ruimte,
 * je teamruimtes en wat met je gedeeld is (inclusief subpagina's). Beheerders zoeken niet in andermans privé-ruimtes;
 * die bekijken ze via Beheer, zodat elke inzage gelogd blijft.
 */
export async function searchPages(user: CurrentUser, input: string, limit = 30): Promise<SearchHit[]> {
  const q = input.trim().slice(0, 200);
  const tsq = toPrefixQuery(q);
  if (!tsq || !user.active) return [];
  const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;

  const rows = await db.execute<{
    id: string;
    title: string;
    space_name: string;
    space_kind: "private" | "team";
    snippet: string;
    updated_at: Date;
  }>(sql`
    WITH RECURSIVE granted AS (
      SELECT g.page_id AS id FROM page_grants g WHERE g.user_id = ${user.id}
      UNION
      SELECT c.id FROM pages c JOIN granted gr ON c.parent_id = gr.id
    ),
    query AS (SELECT to_tsquery('dutch', ${tsq}) AS q)
    SELECT p.id, p.title, s.name AS space_name, s.kind AS space_kind, p.updated_at,
           ts_headline('dutch', left(p.search_text, 5000), query.q,
             'StartSel=[[[, StopSel=]]], MaxWords=18, MinWords=6, MaxFragments=1') AS snippet
    FROM pages p
    JOIN spaces s ON s.id = p.space_id
    CROSS JOIN query
    WHERE p.deleted_at IS NULL
      AND (
        (s.kind = 'private' AND s.owner_id = ${user.id})
        OR EXISTS (SELECT 1 FROM space_members m WHERE m.space_id = s.id AND m.user_id = ${user.id})
        OR p.id IN (SELECT id FROM granted)
      )
      AND (p.search_vector @@ query.q OR p.title ILIKE ${like})
    ORDER BY ts_rank(p.search_vector, query.q) DESC, p.updated_at DESC
    LIMIT ${limit}`);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    spaceName: r.space_kind === "private" ? "Privé" : r.space_name,
    spaceKind: r.space_kind,
    // Eerst escapen, dan pas onze eigen markeringen omzetten naar <b>.
    snippet: escapeHtml(r.snippet ?? "").replaceAll("[[[", "<b>").replaceAll("]]]", "</b>"),
    updatedAt: new Date(r.updated_at),
  }));
}

/** Snelle lijst voor @-verwijzingen: pagina's (op titel) en collega's. */
export async function mentionTargets(user: CurrentUser, input: string) {
  const q = input.trim();
  const pagesFound = q ? await searchPages(user, q, 8) : [];
  const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const people = await db.execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM users WHERE active AND (name ILIKE ${like} OR email ILIKE ${like}) ORDER BY name LIMIT 6`);
  return {
    pages: pagesFound.map((p) => ({ id: p.id, title: p.title || "Naamloos", spaceName: p.spaceName })),
    people: people.map((p) => ({ id: p.id, name: p.name })),
  };
}
