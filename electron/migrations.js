const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
/** Runs committed Prisma migration SQL offline; never invokes development commands. */
function migrate(
  filename,
  { directory = path.join(__dirname, "../prisma/migrations") } = {},
) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  fs.chmodSync(filename, 0o600);
  try {
    db.pragma("foreign_keys=ON");
    db.pragma("journal_mode=WAL");
    db.pragma("busy_timeout=5000");
    db.exec(
      `CREATE TABLE IF NOT EXISTS _prisma_migrations(id TEXT PRIMARY KEY NOT NULL,checksum TEXT NOT NULL,finished_at DATETIME,migration_name TEXT NOT NULL,logs TEXT,rolled_back_at DATETIME,started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_steps_count INTEGER NOT NULL DEFAULT 0)`,
    );
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name, "migration.sql");
      if (!fs.existsSync(file)) continue;
      const sql = fs.readFileSync(file, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const previous = db
        .prepare(
          "SELECT checksum FROM _prisma_migrations WHERE migration_name=? AND finished_at IS NOT NULL",
        )
        .get(name);
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Migration ${name} was modified after application.`);
        continue;
      }
      // SQLite table-rebuild migrations must disable FK actions before the transaction,
      // otherwise DROP TABLE can cascade-delete related rows during a schema change.
      db.pragma("foreign_keys=OFF");
      try {
        db.transaction(() => {
          db.exec(sql);
          if (db.pragma("foreign_key_check").length) {
            throw new Error(`Migration ${name} would leave invalid foreign keys.`);
          }
          db.prepare(
            "INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,applied_steps_count) VALUES(?,?,?,?,1)",
          ).run(crypto.randomUUID(), checksum, new Date().toISOString(), name);
        })();
      } finally {
        db.pragma("foreign_keys=ON");
      }
    }
  } finally {
    db.close();
  }
}
module.exports = { migrate };
