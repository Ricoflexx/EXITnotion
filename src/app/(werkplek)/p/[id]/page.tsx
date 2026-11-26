import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites, users } from "@/db/schema";
import { AccessError, childPages, getPageAccess, getSidebar, listColleagues, listGrants, type TreePage } from "@/lib/access";
import { can, LEVEL_LABELS, type Level } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { favorite, move, newPage, restore, share, trash, unshare } from "@/app/actions";
import { TitleEditor } from "@/components/TitleEditor";

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

  const [children, grants, colleagues, fav, owner, sidebar] = await Promise.all([
    childPages(page.id),
    manageable ? listGrants(page.id) : Promise.resolve([]),
    manageable ? listColleagues() : Promise.resolve([]),
    db.query.favorites.findFirst({ where: and(eq(favorites.userId, user.id), eq(favorites.pageId, page.id)) }),
    space.ownerId ? db.query.users.findFirst({ where: eq(users.id, space.ownerId), columns: { name: true } }) : null,
    manageable ? getSidebar(user) : Promise.resolve(null),
  ]);

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
        if (excluded.has(p.id)) continue;
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
        {!page.deletedAt && (
          <form action={favorite}>
            <input type="hidden" name="pageId" value={page.id} />
            <button className="btn ghost" type="submit">{fav ? "★ Favoriet" : "☆ Favoriet"}</button>
          </form>
        )}
      </header>

      <article className="page">
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

        <div className="placeholder-editor">
          Hier komt de editor met blokken, het /-menu en slepen. Die bouwen we in blok 1.
        </div>

        {children.length > 0 && (
          <section className="subpages" aria-label="Subpagina's">
            {children.map((c) => (
              <Link key={c.id} href={`/p/${c.id}`}>📄 {c.title || "Naamloos"}</Link>
            ))}
          </section>
        )}

        {editable && (
          <form action={newPage} style={{ marginTop: 12 }}>
            <input type="hidden" name="parentId" value={page.id} />
            <button className="btn ghost" type="submit">+ Subpagina</button>
          </form>
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

            <details className="panel">
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
            </details>

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
