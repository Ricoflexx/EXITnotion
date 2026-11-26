import { listTrash } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { restore } from "@/app/actions";

export const metadata = { title: "Prullenbak" };

export default async function TrashPage() {
  const user = await requireUser();
  const items = await listTrash(user);
  return (
    <article className="page">
      <h1 className="title-input">Prullenbak</h1>
      <p className="muted">Verwijderde pagina&apos;s, met hun subpagina&apos;s. Na 30 dagen worden ze definitief opgeruimd.</p>
      {items.length === 0 && <p>De prullenbak is leeg.</p>}
      <div className="tablewrap">
        <table className="list">
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.title || "Naamloos"}</td>
                <td className="muted">{p.deletedAt?.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" })}</td>
                <td style={{ textAlign: "right" }}>
                  <form action={restore}>
                    <input type="hidden" name="pageId" value={p.id} />
                    <button className="btn" type="submit">Terugzetten</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
