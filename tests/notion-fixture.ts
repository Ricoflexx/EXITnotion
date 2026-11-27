/**
 * Nagebootste Notion-API voor tests, met de opbouw van een stagiair-werkplek zoals die van Liv.
 * Alleen de endpoints die de import gebruikt.
 */
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const rt = (text: string, extra: J = {}) => ({
  type: "text",
  plain_text: text,
  text: { content: text, link: extra.href ? { url: extra.href } : null },
  href: extra.href ?? null,
  annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default", ...extra.annotations },
});
const block = (id: string, type: string, data: J, children?: J[]) => ({ object: "block", id, type, has_children: Boolean(children?.length), [type]: data, _children: children });

export const IDS = {
  root: "11111111-1111-1111-1111-111111111111",
  notities: "22222222-2222-2222-2222-222222222222",
  kalender: "33333333-3333-3333-3333-333333333333",
  planning: "44444444-4444-4444-4444-444444444444",
  rowWeek: "55555555-5555-5555-5555-555555555555",
  rowShoot: "66666666-6666-6666-6666-666666666666",
  noteRow: "77777777-7777-7777-7777-777777777777",
  statusTodo: "s-todo",
  statusStuck: "s-stuck",
  statusDone: "s-done",
  linked: "88888888-8888-8888-8888-888888888888",
};

export function makeNotionFixture(opts: { livEmail: string; nikkiEmail: string }) {
  const liv = { object: "user", id: "u-liv", name: "Liv", type: "person", person: { email: opts.livEmail } };
  const nikki = { object: "user", id: "u-nikki", name: "Nikki", type: "person", person: { email: opts.nikkiEmail } };

  const pages: Record<string, J> = {
    [IDS.root]: { object: "page", id: IDS.root, icon: { type: "emoji", emoji: "📸" }, properties: { title: { type: "title", title: [rt("Liv - Stage Workspace")] } } },
    [IDS.planning]: { object: "page", id: IDS.planning, properties: { title: { type: "title", title: [rt("Planning (Opdrachten)")] } } },
  };

  const kalenderDb = {
    object: "database",
    id: IDS.kalender,
    is_inline: true,
    title: [rt("Kalender en taken")],
    properties: {
      Naam: { id: "title", type: "title", title: {} },
      Datum: { id: "d", type: "date", date: {} },
      Status: {
        id: "s",
        type: "status",
        status: {
          options: [
            { id: IDS.statusTodo, name: "Niet gestart", color: "default" },
            { id: IDS.statusStuck, name: "Vastgelopen", color: "orange" },
            { id: IDS.statusDone, name: "Completed", color: "green" },
          ],
          groups: [
            { name: "To-do", option_ids: [IDS.statusTodo] },
            { name: "In progress", option_ids: [IDS.statusStuck] },
            { name: "Complete", option_ids: [IDS.statusDone] },
          ],
        },
      },
      Tags: { id: "t", type: "multi_select", multi_select: { options: [{ id: "tag-ig", name: "Instagram", color: "pink" }] } },
      Wie: { id: "w", type: "people", people: {} },
      Tekst: { id: "x", type: "rich_text", rich_text: {} },
      Relatie: { id: "r", type: "relation", relation: {} },
    },
  };
  const notitiesDb = {
    object: "database",
    id: IDS.notities,
    is_inline: false,
    title: [rt("Notities")],
    properties: {
      Naam: { id: "title", type: "title", title: {} },
      Selecteren: { id: "c", type: "select", select: { options: [{ id: "cat-ig", name: "Instagram", color: "pink" }, { id: "cat-school", name: "School", color: "blue" }] } },
    },
  };
  const rows: Record<string, J[]> = {
    [IDS.kalender]: [
      {
        object: "page",
        id: IDS.rowWeek,
        properties: {
          Naam: { type: "title", title: [rt("Weekafsluiting")] },
          Datum: { type: "date", date: { start: "2026-08-28T16:00:00.000+02:00", end: null } },
          Status: { type: "status", status: { id: IDS.statusStuck, name: "Vastgelopen" } },
          Tags: { type: "multi_select", multi_select: [{ id: "tag-ig", name: "Instagram" }] },
          Wie: { type: "people", people: [liv, nikki, { object: "user", id: "u-x", name: "Onbekend Persoon", person: { email: "niemand@elders.nl" } }] },
          Tekst: { type: "rich_text", rich_text: [rt("Wie: Team. Doel: vrijmibo.")] },
          Relatie: { type: "relation", relation: [] },
        },
      },
      {
        object: "page",
        id: IDS.rowShoot,
        properties: {
          Naam: { type: "title", title: [rt("DZC shoot")] },
          Datum: { type: "date", date: { start: "2026-10-12", end: "2026-10-13" } },
          Status: { type: "status", status: { id: IDS.statusDone, name: "Completed" } },
          Tags: { type: "multi_select", multi_select: [] },
          Wie: { type: "people", people: [] },
          Tekst: { type: "rich_text", rich_text: [] },
          Relatie: { type: "relation", relation: [] },
        },
      },
    ],
    [IDS.notities]: [
      {
        object: "page",
        id: IDS.noteRow,
        properties: { Naam: { type: "title", title: [rt("Contentplanning Startpunt")] }, Selecteren: { type: "select", select: { id: "cat-ig", name: "Instagram" } } },
      },
    ],
  };

  const children: Record<string, J[]> = {
    [IDS.root]: [
      block("b-cols", "column_list", {}, [
        block("b-col1", "column", { width_ratio: 0.375 }, [
          block("b-h-todo", "heading_1", { rich_text: [rt("To Do")], is_toggleable: false, color: "default" }),
          block("b-todo1", "to_do", { rich_text: [rt("Vul elke dag even je taken in")], checked: false, color: "default" }),
          block("b-todo2", "to_do", { rich_text: [rt("Hou de taken klein", { annotations: { bold: true } })], checked: true, color: "default" }),
          block("b-toggle", "toggle", { rich_text: [rt("Notities")], color: "default" }, [
            { object: "block", id: IDS.notities, type: "child_database", has_children: false, child_database: { title: "Notities" } },
            block("b-mention", "paragraph", {
              rich_text: [
                rt("Zie ook "),
                { type: "mention", plain_text: "Planning (Opdrachten)", href: null, mention: { type: "page", page: { id: IDS.planning } }, annotations: {} },
                rt(" en "),
                { type: "mention", plain_text: "@Nikki", href: null, mention: { type: "user", user: nikki }, annotations: {} },
              ],
              color: "default",
            }),
          ]),
          block("b-linked", "paragraph", { rich_text: [rt("Link naar ExitToys", { href: "https://www.exittoys.nl" })], color: "default" }),
          { object: "block", id: IDS.linked, type: "child_database", has_children: false, child_database: { title: "Gekoppelde weergave" } },
        ]),
        block("b-col2", "column", { width_ratio: 0.625 }, [
          block("b-h-kal", "heading_1", { rich_text: [rt("Kalender en taken")], color: "default" }),
          { object: "block", id: IDS.kalender, type: "child_database", has_children: false, child_database: { title: "Kalender en taken" } },
          block("b-table", "table", { table_width: 3, has_column_header: true, has_row_header: false }, [
            block("b-tr1", "table_row", { cells: [[rt("Wie")], [rt("Functie")], [rt("Emailadres")]] }),
            block("b-tr2", "table_row", { cells: [[rt("Ricardo")], [rt("Teamlead Marketing")], [rt("ricardo@example.com")]] }),
          ]),
          block("b-img", "image", { type: "file", file: { url: "https://files.notion.test/foto.png", expiry_time: "2026-11-26T14:00:00Z" }, caption: [rt("Moodboard")] }),
          block("b-bookmark", "bookmark", { url: "https://www.pinterest.com/exittoys", caption: [] }),
        ]),
      ]),
      { object: "block", id: IDS.planning, type: "child_page", has_children: true, child_page: { title: "Planning (Opdrachten)" } },
      block("b-toc", "table_of_contents", {}),
    ],
    [IDS.planning]: [
      block("b-p1", "paragraph", { rich_text: [rt("Social media planning ✅")], color: "default" }),
      block("b-p2", "bulleted_list_item", { rich_text: [rt("3 verschillende campagnes ✅")], color: "default" }, [
        block("b-p3", "bulleted_list_item", { rich_text: [rt("challenges bij lokale clubs?")], color: "default" }),
      ]),
      block("b-code", "callout", { rich_text: [rt("Onderdelen het hele jaar door")], icon: { type: "emoji", emoji: "💡" }, color: "gray_background" }),
    ],
    [IDS.rowWeek]: [block("b-r1", "paragraph", { rich_text: [rt("Taart regelen")], color: "default" })],
    [IDS.rowShoot]: [],
    [IDS.noteRow]: [block("b-n1", "heading_2", { rich_text: [rt("Thema's per maand")], color: "default" })],
  };
  // Kinderen van gewone blokken (kolommen, toggles, tabellen) staan in _children.
  const index = (list: J[]) => {
    for (const b of list) {
      if (b._children) {
        children[b.id] = b._children;
        index(b._children);
        delete b._children;
      }
    }
  };
  Object.values({ ...children }).forEach(index);

  const calls: string[] = [];
  const json = (body: J, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.hostname === "files.notion.test") {
      return new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3]), { headers: { "content-type": "image/png" } });
    }
    if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer secret_test") return json({ code: "unauthorized" }, 401);
    const m = url.pathname.match(/^\/v1\/(pages|databases|blocks)\/([^/]+)(\/children|\/query)?$/);
    if (!m) return json({ code: "invalid_request_url" }, 400);
    const [, kind, id, sub] = m;
    if (kind === "pages") return pages[id] ? json(pages[id]) : json({ code: "object_not_found" }, 404);
    if (kind === "databases" && !sub) {
      const dbs: Record<string, J> = { [IDS.kalender]: kalenderDb, [IDS.notities]: notitiesDb };
      return dbs[id] ? json(dbs[id]) : json({ code: "object_not_found" }, 404);
    }
    if (kind === "databases" && sub === "/query") return json({ results: rows[id] ?? [], has_more: false, next_cursor: null });
    if (kind === "blocks" && sub === "/children") return json({ results: children[id] ?? [], has_more: false, next_cursor: null });
    return json({ code: "object_not_found" }, 404);
  };
  return { fetchImpl: fetchImpl as typeof fetch, calls };
}
