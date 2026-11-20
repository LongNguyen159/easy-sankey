const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { openDatabase } = require("../../electron/database");
const category = "Housing@__system/category__";
const entry = (id = "a", value = 1) => ({
  id,
  type: "expense",
  target: id,
  value,
});
async function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orm-test-"));
  const file = path.join(dir, "finance.sqlite");
  let store = openDatabase(file);
  try {
    await store.initialize({});
    await run({
      store,
      file,
      reopen: async () => {
        await store.close();
        store = openDatabase(file);
        return store;
      },
    });
  } finally {
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const save = (store, month = "2025-04", entries = [entry()]) =>
  store.crud.months.save({ month, lastUpdated: "-", entries });

test("actual ORM tables have columns and foreign keys, with no JSON persistence tables", () =>
  fixture(async ({ store, file }) => {
    await save(store);
    const db = new Database(file, { readonly: true });
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name);
      assert.ok(tables.includes("finance_entries"));
      assert.ok(!tables.includes("records"));
      assert.ok(!tables.includes("documents"));
      const columns = db
        .prepare("PRAGMA table_info(finance_entries)")
        .all()
        .map((row) => row.name);
      assert.ok(columns.includes("amount"));
      assert.ok(columns.includes("parent_entry_id"));
      assert.ok(!columns.includes("payload"));
      assert.ok(
        db.prepare("PRAGMA foreign_key_list(finance_entries)").all().length >=
          3,
      );
    } finally {
      db.close();
    }
  }));
test("partial financial edits preserve other entries, precision and scoped IDs", () =>
  fixture(async ({ store }) => {
    await save(store, "2025-04", [entry("a", 1.234567), entry("b", 2)]);
    await save(store, "2025-05", [entry("a", 9)]);
    const original = await store.crud.entries.get( {
      month: "2025-04",
      id: "a",
    });
    await store.crud.entries.update( {
      month: "2025-04",
      id: "a",
      entry: { ...original, value: 3.456789 },
      expected: original,
    });
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "b" })).value,
      2,
    );
    assert.equal(
      (await store.crud.entries.get( { month: "2025-05", id: "a" })).value,
      9,
    );
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "a" })).value,
      3.456789,
    );
    await assert.rejects(
      store.crud.entries.update( {
        month: "2025-04",
        id: "a",
        entry: original,
        expected: original,
      }),
      /CONFLICT/,
    );
  }));
test("parent FKs survive renaming and deletion reparents children without amount changes", () =>
  fixture(async ({ store }) => {
    await save(store, "2025-04", [
      { ...entry("parent", 10), source: category },
      { ...entry("child", 2), source: "parent" },
    ]);
    const child = await store.prisma.entry.findUnique({
      where: { monthId_id: { monthId: "2025-04", id: "child" } },
    });
    assert.equal(child.parentEntryId, "parent");
    assert.equal(child.categoryId, null);
    await store.crud.entries.update( {
      month: "2025-04",
      id: "parent",
      entry: { ...entry("parent", 10), target: "Renamed", source: category },
    });
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "child" }))
        .source,
      "Renamed",
    );
    assert.deepEqual(
      await store.prisma.entry.findUnique({
        where: { monthId_id: { monthId: "2025-04", id: "child" } },
      }),
      child,
    );
    await store.crud.entries.delete( { month: "2025-04", id: "parent" });
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "child" }))
        .source,
      category,
    );
  }));
test("cycles and duplicate names reject atomically and foreign keys prevent dangling records", () =>
  fixture(async ({ store }) => {
    await save(store, "2025-04", [entry("a"), { ...entry("b"), source: "a" }]);
    const before = await store.crud.months.get("2025-04");
    await assert.rejects(
      store.crud.entries.update( {
        month: "2025-04",
        id: "a",
        entry: { ...entry("a"), source: "b" },
      }),
      /cycle/,
    );
    await assert.rejects(
      save(store, "2025-04", [entry("a"), { ...entry("b"), target: "a" }]),
      /Duplicate/,
    );
    assert.deepEqual(await store.crud.months.get("2025-04"), before);
    await assert.rejects(
      store.prisma.budget.create({
        data: { categoryId: "missing", amount: 1 },
      }),
    );
  }));
test("entry update and expression history roll back together and retain five values", () =>
  fixture(async ({ store }) => {
    await save(store);
    await assert.rejects(
      store.crud.entries.update( {
        month: "2025-04",
        id: "a",
        entry: entry("a", 2),
        history: { missing: { timestamp: "now", value: "1+1" } },
      }),
    );
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "a" })).value,
      1,
    );
    for (let i = 0; i < 8; i++)
      await store.crud.history.append({
        month: "2025-04",
        id: "a",
        item: { timestamp: String(i), value: i === 7 ? "3+4" : i },
      });
    const history = (
      await store.crud.history.list({ month: "2025-04", id: "a" })
    ).value;
    assert.equal(history.length, 5);
    assert.equal(history[0].value, "3+4");
    await store.crud.months.delete({ month: "2025-04" });
    assert.equal(await store.prisma.entryHistory.count(), 0);
  }));
test("category deletion clears relations and dependent configuration atomically", () =>
  fixture(async ({ store }) => {
    await save(store, "2025-04", [{ ...entry(), source: category }]);
    await store.crud.fixedCosts.create({
      item: { ...entry("template"), source: category },
    });
    await store.crud.budgets.create({ item: { category, value: 100 } });
    await store.crud.tracking.create({
      item: { name: category, targetSpending: 100 },
    });
    await store.crud.settings.set({
      key: "essentialCategories",
      value: [category],
    });
    await store.crud.settings.set({
      key: "budgetManualOrder",
      value: [category],
    });
    await store.crud.deleteCategory({ id: category });
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "a" })).source,
      undefined,
    );
    assert.equal(
      (await store.crud.fixedCosts.get({ id: "template" })).source,
      undefined,
    );
    assert.equal(await store.prisma.budget.count(), 0);
    assert.equal(await store.prisma.trackingTarget.count(), 0);
    assert.deepEqual(
      (await store.crud.settings.list()).value.essentialCategories,
      [],
    );
  }));
test("backup and restore preserve templates, named trackers, settings, history and restart persistence", () =>
  fixture(async ({ store, reopen }) => {
    await save(store);
    await store.crud.fixedCosts.replace({
      items: [
        { ...entry("p"), source: category },
        { ...entry("c"), source: "p" },
      ],
    });
    await store.crud.tracking.replace({
      items: [{ name: "Named aggregate", targetSpending: 123.456 }],
      metadata: { avgIncome: 2000, targetSurplus: 100 },
    });
    await store.crud.settings.set({
      key: "themeSettings",
      value: {
        selectedTheme: "dark",
        isDarkMode: true,
        isManualThemeSet: true,
      },
    });
    await store.crud.history.append({
      month: "2025-04",
      id: "a",
      item: { timestamp: "old display timestamp", value: "100+20" },
    });
    const backup = await store.exportBackup();
    await store.reset((await store.crud.status()).revision);
    await store.restore(backup, (await store.crud.status()).revision);
    const opened = await reopen();
    const exported = JSON.parse(await opened.exportBackup()).data;
    assert.deepEqual(exported, JSON.parse(backup).data);
  }));
test("committed migrations apply once and add a later schema change without data loss", () =>
  fixture(async ({ store, file, reopen }) => {
    await save(store);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "orm-migrations-"));
    try {
      fs.cpSync(path.join(process.cwd(), "prisma/migrations"), directory, {
        recursive: true,
      });
      const next = path.join(directory, "202611200002_test_column");
      fs.mkdirSync(next);
      fs.writeFileSync(
        path.join(next, "migration.sql"),
        "ALTER TABLE categories ADD COLUMN description TEXT;",
      );
      await store.close();
      require("../../electron/migrations").migrate(file, { directory });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    const opened = await reopen();
    assert.equal((await opened.crud.months.get("2025-04")).entries[0].id, "a");
    const db = new Database(file, { readonly: true });
    try {
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM _prisma_migrations").get().n,
        2,
      );
      assert.ok(
        db
          .prepare("PRAGMA table_info(categories)")
          .all()
          .some((column) => column.name === "description"),
      );
    } finally {
      db.close();
    }
  }));

test("patch API updates only requested columns and preserves child relationship rows", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orm-patch-"));
  const queries = [];
  const store = openDatabase(path.join(dir, "db.sqlite"), {
    onQuery: (query) => queries.push(query),
  });
  try {
    await store.initialize({});
    await save(store, "2025-04", [
      entry("parent", 10),
      { ...entry("child", 2), source: "parent" },
    ]);
    queries.length = 0;
    await store.crud.entries.update( {
      month: "2025-04",
      id: "parent",
      changes: { value: 11 },
    });
    const update = queries.find((query) =>
      /UPDATE.*finance_entries/.test(query),
    );
    assert.ok(update);
    const set = update.split(" SET ")[1].split(" WHERE ")[0];
    assert.match(set, /amount/);
    assert.doesNotMatch(set, /normalized_name|parent_entry_id|"name"/);
    const child = await store.prisma.entry.findUnique({
      where: { monthId_id: { monthId: "2025-04", id: "child" } },
    });
    await store.crud.entries.update( {
      month: "2025-04",
      id: "parent",
      changes: { target: "New name" },
    });
    assert.deepEqual(
      await store.prisma.entry.findUnique({
        where: { monthId_id: { monthId: "2025-04", id: "child" } },
      }),
      child,
    );
    assert.equal(
      (await store.crud.entries.get( { month: "2025-04", id: "child" }))
        .source,
      "New name",
    );
  } finally {
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SQLite table-rebuild migrations preserve dependent rows and failed migrations roll back',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schema-rebuild-'));const file=path.join(dir,'database.sqlite');let store=openDatabase(file);
 const directory=path.join(dir,'migrations');
 try {
  await store.initialize({});await save(store,'2025-04',[{...entry(),source:category}]);
  await store.crud.budgets.create({item:{category,value:42}});await store.close();
  fs.cpSync(path.join(process.cwd(),'prisma/migrations'),directory,{recursive:true});
  let db=new Database(file);const sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='categories'").get().sql.replace('"categories"','"new_categories"');db.close();
  const migration=path.join(directory,'202611200002_rebuild');fs.mkdirSync(migration);
  fs.writeFileSync(path.join(migration,'migration.sql'),`${sql}; INSERT INTO new_categories SELECT * FROM categories; DROP TABLE categories; ALTER TABLE new_categories RENAME TO categories;`);
  require('../../electron/migrations').migrate(file,{directory});
  db=new Database(file);assert.equal(db.prepare('SELECT count(*) AS n FROM budgets').get().n,1);assert.equal(db.prepare('SELECT category_id FROM finance_entries').get().category_id,category);db.close();
  const broken=path.join(directory,'202611200003_broken');fs.mkdirSync(broken);fs.writeFileSync(path.join(broken,'migration.sql'),'CREATE TABLE should_rollback(id TEXT); THIS IS NOT SQL;');
  assert.throws(()=>require('../../electron/migrations').migrate(file,{directory}));
  db=new Database(file);assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='should_rollback'").get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM budgets').get().n,1);db.close();
 }finally{await store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
