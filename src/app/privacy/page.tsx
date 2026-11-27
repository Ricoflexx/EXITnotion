import { acceptPrivacy } from "@/app/actions";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Goed om te weten" };

export default async function PrivacyPage() {
  const user = await requireUser({ allowWithoutPrivacy: true });
  return (
    <main className="center">
      <div className="card">
        <h1>Goed om te weten</h1>
        <p style={{ margin: 0 }}>Hoi {user.name.split(" ")[0]}, welkom in Homebase. Voor je begint:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>Je hebt een eigen privé-ruimte. Collega&apos;s zien die alleen als jij iets met ze deelt.</li>
          <li><b>Beheerders kunnen alles inzien</b>, ook je privé-pagina&apos;s. Elke keer dat een beheerder iets bekijkt wat niet met hem gedeeld is, wordt dat vastgelegd.</li>
          <li>Zet hier <b>geen wachtwoorden of inloggegevens</b> neer. Gebruik daarvoor een wachtwoordmanager.</li>
          <li>Bestanden blijven in Box. Projecten waar collega&apos;s op wachten blijven in Monday.</li>
        </ul>
        <form action={acceptPrivacy}>
          <button className="btn primary" type="submit">Begrepen, aan de slag</button>
        </form>
      </div>
    </main>
  );
}
