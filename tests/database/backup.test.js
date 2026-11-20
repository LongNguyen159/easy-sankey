const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, readdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { openDatabase } = require("../../electron/database");
test("development database starts directly, round-trips backups, and creates no recovery sidecars", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-db-"));
  let store;
  try {
    const file = join(dir, "finance.sqlite");
    store = openDatabase(file);
    await store.initialize({});
    await store.crud.settings.set({ key: "selectedCurrency", value: "EUR" });
    await store.crud.months.save({
      month: "2025-04",
      entries: [{ id: "a", type: "expense", target: "Food", value: 12.3456 }],
      lastUpdated: "-",
    });
    const backup = await store.exportBackup();
    await store.reset((await store.snapshot()).revision);
    await store.restore(backup, (await store.snapshot()).revision);
    assert.equal(
      (await store.crud.months.get("2025-04")).entries[0].value,
      12.3456,
    );
    await assert.rejects(
      store.restore('{"app":"other"}', (await store.snapshot()).revision),
      /Invalid/,
    );
    await store.close();
    store = openDatabase(file);
    assert.equal((await store.snapshot()).data.selectedCurrency, "EUR");
    assert.equal(
      readdirSync(dir).some((name) =>
        /schema-|legacy.json|before-restore/.test(name),
      ),
      false,
    );
  } finally {
    await store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
