import type Database from "better-sqlite3";
import db from "../lib/database";
import { migration as migration1 } from "./migrations/001_initial_schema";
import * as migration2Module from "./migrations/002_initial_market_buy_quote";
import * as migration3Module from "./migrations/003_idempotency_constraints";
import * as migration4Module from "./migrations/004_reconciliation_records";

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

const migrations: Migration[] = [
  migration1,
  {
    version: migration2Module.version,
    up: migration2Module.up,
  },
  {
    version: migration3Module.version,
    up: migration3Module.up,
  },
  {
    version: migration4Module.version,
    up: migration4Module.up,
  },
].sort((a, b) => a.version - b.version);

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

for (const migration of migrations) {
  const applied = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(migration.version) as { version: number } | undefined;

  if (applied) {
    console.log(`Migration ${migration.version}: already applied`);
    continue;
  }

  const runMigration = db.transaction(() => {
    migration.up(db);
    db.prepare(
      "INSERT INTO schema_migrations (version) VALUES (?)",
    ).run(migration.version);
  });

  runMigration();
  console.log(`Migration ${migration.version}: applied`);
}

const appliedVersions = db
  .prepare("SELECT version FROM schema_migrations ORDER BY version")
  .all() as Array<{ version: number }>;

const tables = db
  .prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  .all() as Array<{ name: string }>;

console.log(
  "Applied migrations:",
  appliedVersions.map((item) => item.version).join(", "),
);
console.log("Tables:", tables.map((table) => table.name).join(", "));
