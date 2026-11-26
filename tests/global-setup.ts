import { execFileSync } from "node:child_process";
import postgres from "postgres";

/** Maakt de testdatabase leeg en voert alle migraties uit. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://exitnotion:exitnotion@localhost:5432/exitnotion_test";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await sql.end();
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/migrate.ts"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
