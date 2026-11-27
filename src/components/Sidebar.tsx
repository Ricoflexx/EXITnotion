import Link from "next/link";
import { logout, newPage } from "@/app/actions";
import type { CurrentUser } from "@/lib/access";
import { getSidebar } from "@/lib/access";
import { can } from "@/lib/permissions";
import { PageTree } from "./PageTree";
import { SearchShortcut } from "./SearchShortcut";
import { HomebaseMark } from "./Logo";

export async function Sidebar({ user }: { user: CurrentUser }) {
  const data = await getSidebar(user);
  return (
    <nav className="sidebar" aria-label="Werkplek">
      <Link href="/" className="brand" aria-label="Homebase, naar je werkplek">
        <HomebaseMark size={26} title="" />
        <span>Homebase</span>
      </Link>
      <SearchShortcut />
      <Link href="/zoeken" className="side-link search-link">
        Zoeken <kbd>Ctrl K</kbd>
      </Link>
      <Link href="/taken" className="side-link">✓ Mijn taken</Link>

      {data.favorites.length > 0 && (
        <section className="side-section">
          <h4>Favorieten</h4>
          {data.favorites.map((p) => (
            <Link key={p.id} href={`/p/${p.id}`} className="side-link">
              ★ {p.title || "Naamloos"}
            </Link>
          ))}
        </section>
      )}

      {data.privateSpace && (
        <section className="side-section">
          <h4>
            Privé
            <form action={newPage}>
              <input type="hidden" name="spaceId" value={data.privateSpace.space.id} />
              <button className="add-btn" type="submit" aria-label="Nieuwe privé-pagina" title="Nieuwe pagina">+</button>
            </form>
          </h4>
          <PageTree items={data.privateSpace.pages} canAdd />
        </section>
      )}

      {data.teamSpaces.map(({ space, level, pages }) => (
        <section className="side-section" key={space.id}>
          <h4>
            {space.name}
            {can.edit(level) && (
              <form action={newPage}>
                <input type="hidden" name="spaceId" value={space.id} />
                <button className="add-btn" type="submit" aria-label={`Nieuwe pagina in ${space.name}`} title="Nieuwe pagina">+</button>
              </form>
            )}
          </h4>
          <PageTree items={pages} canAdd={can.edit(level)} />
        </section>
      ))}

      {data.sharedWithMe.length > 0 && (
        <section className="side-section">
          <h4>Gedeeld met mij</h4>
          {data.sharedWithMe.map((p) => (
            <Link key={p.id} href={`/p/${p.id}`} className="side-link">
              {p.title || "Naamloos"}
            </Link>
          ))}
        </section>
      )}

      <div className="side-foot">
        <Link href="/prullenbak" className="side-link">Prullenbak</Link>
        {user.isAdmin && <Link href="/beheer" className="side-link">Beheer</Link>}
        <div className="who">{user.name}</div>
        <form action={logout}>
          <button type="submit" className="btn ghost" style={{ width: "100%", justifyContent: "flex-start" }}>Uitloggen</button>
        </form>
      </div>
    </nav>
  );
}
