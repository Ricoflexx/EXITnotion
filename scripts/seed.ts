// Testdata voor lokaal ontwikkelen: drie testgebruikers en een teamruimte. Draai NOOIT tegen productie.
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ontbreekt.");
if (process.env.WEBSITE_SITE_NAME) throw new Error("Seed draait niet op Azure.");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });
const { users, spaces, spaceMembers, pages } = schema;

const people = [
  { email: "beheerder@test.local", name: "Beheerder Test", isAdmin: true },
  { email: "stagiair1@test.local", name: "Stagiair Een", isAdmin: false },
  { email: "stagiair2@test.local", name: "Stagiair Twee", isAdmin: false },
];

const ids: string[] = [];
for (const p of people) {
  const [u] = await db
    .insert(users)
    .values({ ...p, privacyAcceptedAt: null })
    .onConflictDoUpdate({ target: users.email, set: { name: p.name, isAdmin: p.isAdmin } })
    .returning();
  ids.push(u.id);
  const own = await db.query.spaces.findFirst({ where: and(eq(spaces.kind, "private"), eq(spaces.ownerId, u.id)) });
  if (!own) {
    const [s] = await db.insert(spaces).values({ kind: "private", name: "Privé", ownerId: u.id }).returning();
    await db.insert(pages).values({ spaceId: s.id, title: "Welkom in je werkplek", createdBy: u.id });
  }
}

let team = await db.query.spaces.findFirst({ where: and(eq(spaces.kind, "team"), eq(spaces.name, "Stagiairs")) });
if (!team) {
  [team] = await db.insert(spaces).values({ kind: "team", name: "Stagiairs" }).returning();
  await db.insert(pages).values({ spaceId: team.id, title: "Social Media Hub", createdBy: ids[1] });
}
for (const uid of ids.slice(1)) {
  await db.insert(spaceMembers).values({ spaceId: team.id, userId: uid, level: "edit" }).onConflictDoNothing();
}

await sql.end();
console.log("Testdata klaar. Log in met de testlogin als een van:", people.map((p) => p.name).join(", "));
