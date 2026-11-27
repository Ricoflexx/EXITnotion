import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/session";

export default async function WerkplekLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <Sidebar user={user} />
      <div className="main">{children}</div>
    </div>
  );
}
