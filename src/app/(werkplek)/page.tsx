import { redirect } from "next/navigation";
import { getSidebar } from "@/lib/access";
import { requireUser } from "@/lib/session";

/** Startpunt: de eerste pagina van je privé-ruimte. In blok 2 wordt dit de stagiair-startpagina (R10). */
export default async function Home() {
  const user = await requireUser();
  const { privateSpace } = await getSidebar(user);
  const first = privateSpace?.pages.find((p) => !p.parentId);
  if (first) redirect(`/p/${first.id}`);
  return (
    <div className="page">
      <h1 className="title-input">Je werkplek is leeg</h1>
      <p className="muted">Maak links met + je eerste pagina.</p>
    </div>
  );
}
