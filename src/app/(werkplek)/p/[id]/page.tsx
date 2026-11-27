import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites, users } from "@/db/schema";
import { AccessError, childPages, getPageAccess, getSidebar, listColleagues, listGrants, type TreePage } from "@/lib/access";
import { can, LEVEL_LABELS, type Level } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { favorite, toggleFullWidth, move, newDatabase, newPage, newPageFromTemplate, restore, share, trash, unshare } from "@/app/actions";
import { DatabaseView } from "@/components/database/DatabaseView";
import { RowProperties } from "@/components/database/RowProperties";
import { getDatabase, getRowContext } from "@/lib/databases";
import { DB_TEMPLATES, DB_TEMPLATE_LABELS } from "@/lib/db-templates";
import { PAGE_TEMPLATES, PAGE_TEMPLATE_LABELS } from "@/lib/page-templates";
import type { TemplateName } from "@/components/editor/templates";
import { TitleEditor } from "@/components/TitleEditor";
import { EditorLoader } from "@/components/editor/EditorLoader";
import { loadDoc } from "@/lib/docs";

export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();

  let access;
  try {
    access = await getPageAccess(user, id);
  } catch (e) {
    if (e instanceof AccessError) {
      return (
        <div className="page">
          <h1 className="title-input">Geen toegang</h1>
          <p className="muted">{e.message} Vraag de eigenaar om de pagina met je te delen.</p>
        </div>
      );
    }
    throw e;
  }
  const { page, space, ancestors, level, viaAdmin } = access;
  const editable = can.edit(level) && !viaAdmin && !page.deletedAt;
  const manageable = can.manage(level) && !viaAdmin;

  const isDatabase = page.kind === "database";
  const isRow = page.kind === "row";
  const [docState, children, grants, colleagues, fav, owner, sidebar, dbData, rowCtx] = await Promise.all([
    isDatabase ? Promise.resolve(null) : loadDoc(user, page.id),
    childPages(page.id),
    manageable ? listGrants(page.id) : Promise.resolve([]),
    manageable ? listColleagues() : Promise.resolve([]),
    db.query.favorites.findFirst({ where: and(eq(favorites.userId, user.id), eq(favorites.pageId, page.id)) }),
    space.ownerId ? db.query.users.findFirst({ where: eq(users.id, space.ownerId), columns: { name: true } }) : null,
    manageable && !isRow ? getSidebar(user) : Promise.resolve(null),
    isDatabase ? getDatabase(user, page.id) : Promise.resolve(null),
    isRow ? getRowContext(user, page.id) : Promise.resolve(null),
  ]);
  const content = page.content as { template?: TemplateName; refs?: Record<string, string>; type?: string } | null;
  const template = content?.template
    ? { name: content.template, refs: content.refs ?? {} }
    : content?.type === "welcome"
      ? { name: "welcome" as const, refs: {} }
      : null;

  // Verplaatsen (R52): ruimtes en pagina's waar ik mag bewerken, zonder deze pagina en zijn subpagina's.
  const moveTargets: { value: string; label: string }[] = [];
  if (sidebar) {
    const editableSpaces = [
      ...(sidebar.privateSpace ? [sidebar.privateSpace] : []),
      ...sidebar.teamSpaces.filter((t) => can.edit(t.level as Level)),
    ];
    for (const s of editableSpaces) {
      moveTargets.push({ value: `space:${s.space.id}`, label: `${s.space.name} (bovenaan)` });
      const excluded = new Set([page.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of s.pages) if (p.parentId && excluded.has(p.parentId) && !excluded.has(p.id)) { excluded.add(p.id); grew = true; }
      }
      const depth = (p: TreePage): number => {
        let d = 0;
        let cur = p;
        while (cur.parentId) {
          const parent = s.pages.find((x) => x.id === cur.parentId);
          if (!parent) break;
          d++;
          cur = parent;
        }
        return d;
      };
      for (const p of s.pages) {
        if (excluded.has(p.id) || p.kind !== "page") continue;
        moveTargets.push({ value: `page:${p.id}`, label: `${s.space.name} / ${"  ".repeat(depth(p))}${p.title || "Naamloos"}` });
      }
    }
  }

  const spaceLabel = space.kind === "private" ? (space.ownerId === user.id ? "Privé" : `Privé van ${owner?.name ?? "collega"}`) : space.name;
  const grantedIds = new Set(grants.map((g) => g.userId));

  return (
    <>
      <header className="topbar">
        <nav className="crumbs" aria-label="Kruimelpad">
          <span>{spaceLabel}</span>
          {ancestors.map((a) => (
            <span key={a.id}>
              / <Link href={`/p/${a.id}`}>{a.title || "Naamloos"}</Link>
            </span>
          ))}
          <span>/ {page.title || "Naamloos"}</span>
        </nav>
        <span className="spacer" />
        <span className="tag" title="Jouw rechten op deze pagina">{LEVEL_LABELS[level]}</span>
        {editable && (
          <form action={toggleFullWidth}>
            <input type="hidden" name="pageId" value={page.id} />
            <input type="hidden" name="fullWidth" value={String(!page.fullWidth)} />
            <button className="btn ghost" type="submit" title={page.fullWidth ? "Smalle pagina" : "Volle breedte"}>
              {page.fullWidth ? "⇥⇤ Smal" : "⇤⇥ Breed"}
            </button>
          </form>
        )}
        {!page.deletedAt && (
          <form action={favorite}>
            <input type="hidden" name="pageId" value={page.id} />
            <button className="btn ghost" type="submit">{fav ? "★ Favoriet" : "☆ Favoriet"}</button>
          </form>
        )}
      </header>

      <article className={"page" + (page.fullWidth ? " page-full" : isDatabase ? " page-wide" : "")}>
        {viaAdmin && (
          <div className="banner admin" role="status">
            Je bekijkt deze pagina als beheerder. Hij is niet met je gedeeld, dus deze inzage is vastgelegd in het inzagelog.
          </div>
        )}
        {page.deletedAt && (
          <div className="banner admin" role="status">
            Deze pagina staat in de prullenbak.
            {manageable && (
              <form action={restore} style={{ display: "inline", marginLeft: 10 }}>
                <input type="hidden" name="pageId" value={page.id} />
                <button className="btn" type="submit">Terugzetten</button>
              </form>
            )}
          </div>
        )}

        <TitleEditor pageId={page.id} initial={page.title} editable={editable} />

        {rowCtx && (
          <RowProperties
            rowId={page.id}
            databaseId={rowCtx.databaseId}
            schema={rowCtx.schema}
            props={rowCtx.props}
            people={rowCtx.people}
            editable={editable}
          />
        )}

        {dbData ? (
          <DatabaseView key={page.id} databaseId={page.id} initial={dbData} me={user.id} />
        ) : (
          <EditorLoader
            key={page.id}
            pageId={page.id}
            initialState={docState}
            editable={editable}
            userName={user.name}
            userId={user.id}
            template={editable ? template : null}
          />
        )}

        {children.length > 0 && !isDatabase && (
          <section className="subpages" aria-label="Subpagina's">
            {children.map((c) => (
              <Link key={c.id} href={`/p/${c.id}`}>{c.kind === "database" ? "▦" : "📄"} {c.title || "Naamloos"}</Link>
            ))}
          </section>
        )}

        {editable && !isDatabase && !isRow && (
          <div className="row page-add">
            <form action={newPage}>
              <input type="hidden" name="parentId" value={page.id} />
              <button className="btn ghost" type="submit">+ Subpagina</button>
            </form>
            <form action={newPageFromTemplate} className="row">
              <input type="hidden" name="parentId" value={page.id} />
              <select name="template" aria-label="Sjabloon" id="page-template">
                {PAGE_TEMPLATES.map((t) => <option key={t} value={t}>{PAGE_TEMPLATE_LABELS[t]}</option>)}
              </select>
              <button className="btn ghost" type="submit">+ Uit sjabloon</button>
            </form>
            <form action={newDatabase} className="row">
              <input type="hidden" name="parentId" value={page.id} />
              <select name="template" aria-label="Soort database" id="db-template">
                {DB_TEMPLATES.map((t) => <option key={t} value={t}>{DB_TEMPLATE_LABELS[t]}</option>)}
              </select>
              <button className="btn ghost" type="submit">+ Database</button>
            </form>
          </div>
        )}

        {manageable && !page.deletedAt && (
          <>
            <details className="panel">
              <summary>Delen</summary>
              <div>
                {grants.length === 0 && <p className="muted" style={{ margin: 0 }}>Nog met niemand gedeeld. Subpagina&apos;s worden automatisch mee gedeeld.</p>}
                {grants.map((g) => (
                  <form key={g.userId} action={unshare} className="row">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="userId" value={g.userId} />
                    <span style={{ flex: 1 }}>{g.name} · <span className="muted">{LEVEL_LABELS[g.level]}</span></span>
                    <button className="btn" type="submit">Stop delen</button>
                  </form>
                ))}
                <form action={share} className="row">
                  <input type="hidden" name="pageId" value={page.id} />
                  <select name="userId" id="share-user" aria-label="Collega" required>
                    {colleagues
                      .filter((c) => c.id !== user.id && !grantedIds.has(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <select name="level" id="share-level" aria-label="Rechten" defaultValue="edit">
                    <option value="read">Kan lezen</option>
                    <option value="comment">Kan reageren</option>
                    <option value="edit">Kan bewerken</option>
                    <option value="full">Volledige toegang</option>
                  </select>
                  <button className="btn primary" type="submit">Delen</button>
                </form>
              </div>
            </details>

            {!isRow && <details className="panel">
              <summary>Verplaatsen</summary>
              <div>
                <form action={move} className="row">
                  <input type="hidden" name="pageId" value={page.id} />
                  <select name="target" id="move-target" aria-label="Nieuwe plek" style={{ flex: 1, minWidth: 0 }}>
                    {moveTargets.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <button className="btn" type="submit">Verplaatsen</button>
                </form>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>Subpagina&apos;s gaan mee. Ook naar een teamruimte, zoals de Social Media Hub.</p>
              </div>
            </details>}

            <form action={trash} style={{ marginTop: 16 }}>
              <input type="hidden" name="pageId" value={page.id} />
              <button className="btn danger" type="submit">Naar prullenbak</button>
            </form>
          </>
        )}
      </article>
    </>
  );
}
