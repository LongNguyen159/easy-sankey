const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase } = require('./database');

test('SQLite CRUD preserves source entries, revisions and restart persistence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'easy-sankey-db-'));
  let db;
  try {
    const file = join(directory, 'finance.sqlite');
    db = openDatabase(file);
    const record = { month: '2025-04', lastUpdated: '-', entries: [
      { id: 'salary', type: 'income', target: 'Salary', value: 1000 },
    ] };
    db.createMonth(record);
    assert.throws(() => db.createMonth(record), /already exists/);
    db.createMonth({ ...record, month: '2025-05' });
    db.updateMonth({ ...record, revision: 0, entries: [{ ...record.entries[0], value: 1200 }] });
    assert.throws(() => db.updateMonth({ ...record, revision: 0 }), /changed/);
    db.close();
    db = openDatabase(file);
    assert.equal(db.getMonth(record.month).entries[0].value, 1200);
    assert.equal(db.getMonth(record.month).revision, 1);
    assert.equal(db.deleteMonth(record.month), true);
    assert.equal(db.deleteMonth(record.month), false);
    assert.deepEqual(db.listMonths(), ['2025-05']);
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
