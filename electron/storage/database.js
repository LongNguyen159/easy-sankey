const Database = require('better-sqlite3');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

/** Owns the local database. Call only from Electron's main process. */
function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const version = db.pragma('user_version', { simple: true });
    if (version > 1) throw new Error('This database requires a newer application version.');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS months (
          month TEXT PRIMARY KEY,
          last_updated TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS entries (
          month TEXT NOT NULL REFERENCES months(month) ON DELETE CASCADE,
          id TEXT NOT NULL,
          position INTEGER NOT NULL,
          payload TEXT NOT NULL CHECK(json_valid(payload)),
          PRIMARY KEY(month, id)
        );
        CREATE TABLE IF NOT EXISTS preferences (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL CHECK(json_valid(value))
        );
        CREATE TABLE IF NOT EXISTS migration_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    })();
    const find = db.prepare('SELECT * FROM months WHERE month = ?');
    const entries = db.prepare('SELECT payload FROM entries WHERE month = ? ORDER BY position');
    const insertMonth = db.prepare('INSERT INTO months(month,last_updated) VALUES (?,?)');
    const updateMonth = db.prepare('UPDATE months SET last_updated=?, revision=revision+1 WHERE month=? AND revision=?');
    const insertEntry = db.prepare('INSERT INTO entries(month,id,position,payload) VALUES (?,?,?,?)');
    const removeEntries = db.prepare('DELETE FROM entries WHERE month=?');
    function validateMonth(value) {
      if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
        || typeof value.lastUpdated !== 'string' || !Array.isArray(value.entries)) {
        throw new Error('Invalid month record.');
      }
      const ids = new Set();
      for (const entry of value.entries) {
        if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
          || !['income', 'expense', 'tax'].includes(entry.type)
          || typeof entry.target !== 'string' || !entry.target.trim()
          || !Number.isFinite(entry.value) || entry.value < 0) throw new Error('Invalid entry.');
        ids.add(entry.id);
      }
    }
    function writeEntries(value) {
      value.entries.forEach((entry, index) => insertEntry.run(value.month, entry.id, index, JSON.stringify(entry)));
    }
    return {
      listMonths: () => db.prepare('SELECT month FROM months ORDER BY month').all().map(row => row.month),
      getMonth(month) {
        const row = find.get(month);
        return row ? { month, lastUpdated: row.last_updated, revision: row.revision,
          entries: entries.all(month).map(row => JSON.parse(row.payload)) } : null;
      },
      createMonth: db.transaction(value => {
        validateMonth(value);
        if (find.get(value.month)) throw new Error('Month already exists.');
        insertMonth.run(value.month, value.lastUpdated);
        writeEntries(value);
      }),
      updateMonth: db.transaction(value => {
        validateMonth(value);
        if (!find.get(value.month)) throw new Error('Month does not exist.');
        if (!Number.isInteger(value.revision) || updateMonth.run(value.lastUpdated, value.month, value.revision).changes !== 1) {
          throw new Error('Month was changed by another operation. Reload before saving.');
        }
        removeEntries.run(value.month);
        writeEntries(value);
      }),
      deleteMonth: month => db.prepare('DELETE FROM months WHERE month=?').run(month).changes > 0,
      close() { db.close(); },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
module.exports = { openDatabase };
