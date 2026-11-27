import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUser, AccessError } from "@/lib/access";
import { saveUpload } from "@/lib/files";

/** Upload vanuit de editor (R25). Formulier met "file" en "pageId". */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user?.id ? await getUser(session.user.id) : undefined;
  if (!user?.active) return NextResponse.json({ error: "Log opnieuw in." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const pageId = String(form.get("pageId") ?? "");
  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(pageId)) {
    return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }
  try {
    return NextResponse.json(await saveUpload(user, pageId, file));
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
