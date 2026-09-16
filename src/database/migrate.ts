import db from "../lib/database";
import { migration } from "./migrations/001_initial_schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const applied = db
  .prepare("SELECT version FROM schema_migrations WHERE version = ?")
  .get(migration.version) as { version: number } | undefined;

if (!applied) {
  const runMigration = db.transaction(() => {
    migration.up(db);
    db.prepare(
      "INSERT INTO schema_migrations (version) VALUES (?)",
    ).run(migration.version);
  });

  runMigration();
  console.log(`Migration ${migration.version}: applied`);
} else {
  console.log(`Migration ${migration.version}: already applied`);
}

const tables = db
  .prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  .all() as Array<{ name: string }>;

console.log("Tables:", tables.map((table) => table.name).join(", "));
