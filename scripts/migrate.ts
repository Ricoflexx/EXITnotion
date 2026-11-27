// Voert de SQL-migraties uit de map drizzle/ uit op DATABASE_URL. Wordt ook bij elke uitrol op Azure gedraaid.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}
const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=require") ? "require" : undefined, onnotice: () => {} });
// Lokaal staat dit script in scripts/, in het uitrolpakket op Azure naast de map drizzle/.
const local = path.join(import.meta.dirname, "drizzle");
const migrationsFolder = fs.existsSync(local) ? local : path.join(import.meta.dirname, "..", "drizzle");
await migrate(drizzle(sql), { migrationsFolder });
await sql.end();
console.log("Migraties uitgevoerd.");
