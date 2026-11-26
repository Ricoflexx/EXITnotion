import { auth } from "@/auth";
import { AccessError, getUser } from "@/lib/access";
import { readUpload } from "@/lib/files";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user?.id ? await getUser(session.user.id) : undefined;
  if (!user?.active) return new Response("Log opnieuw in.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Niet gevonden", { status: 404 });
  try {
    const { row, data, inline } = await readUpload(user, id);
    const name = encodeURIComponent(row.name);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": inline ? row.contentType : "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        // PDF's tonen in de ingebouwde viewer van de browser; die werkt niet in een sandbox.
        ...(row.contentType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'" }),
      },
    });
  } catch (e) {
    if (e instanceof AccessError) return new Response("Geen toegang", { status: 403 });
    throw e;
  }
}
