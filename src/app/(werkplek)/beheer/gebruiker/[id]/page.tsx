import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/access";
import { privateSpaceRoots } from "@/lib/admin";
import { requireUser } from "@/lib/session";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user.isAdmin || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const person = await getUser(id);
  if (!person) notFound();
  const roots = await privateSpaceRoots(user, id);
  return (
    <article className="page">
      <p><Link href="/beheer">← Beheer</Link></p>
      <h1 className="title-input">Privé van {person.name}</h1>
      <div className="banner admin">Openen van een pagina hieronder wordt vastgelegd in het inzagelog.</div>
      {roots.length === 0 && <p className="muted">Geen pagina&apos;s.</p>}
      <div className="subpages">
        {roots.map((r) => <Link key={r.id} href={`/p/${r.id}`}>📄 {r.title || "Naamloos"}</Link>)}
      </div>
    </article>
  );
}
