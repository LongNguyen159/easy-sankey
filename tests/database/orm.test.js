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
test("month ranges load hundreds of parent relations across months", () =>
  fixture(async ({ store, file }) => {
    const db = new Database(file);
    const months = ["2025-04", "2025-05"];
    try {
      const insertMonth = db.prepare("INSERT INTO finance_months (id) VALUES (?)");
      const insertEntry = db.prepare(`
        INSERT INTO finance_entries
          (month_id, id, type, name, normalized_name, amount, position, parent_entry_id)
        VALUES (?, ?, 'expense', ?, ?, 1, ?, ?)
      `);
      db.transaction(() => {
        for (const month of months) {
          insertMonth.run(month);
          for (let i = 0; i < 300; i++) {
            const parentId = `parent-${i}`;
            const parentName = `${month} parent ${i}`;
            const childId = `child-${i}`;
            insertEntry.run(month, parentId, parentName, parentName, i * 2, null);
            insertEntry.run(month, childId, childId, childId, i * 2 + 1, parentId);
          }
        }
      })();
    } finally {
      db.close();
    }

    const { value } = await store.crud.months.range();
    assert.deepEqual(value.map((row) => row.month), months);
    for (const row of value) {
      assert.equal(row.entries.length, 600);
      for (let i = 0; i < 300; i++) {
        assert.equal(row.entries[i * 2 + 1].id, `child-${i}`);
        assert.equal(row.entries[i * 2 + 1].source, `${row.month} parent ${i}`);
      }
    }
    assert.deepEqual(
      (await store.crud.months.range({ from: months[1], to: months[1] })).value,
      [value[1]],
    );
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
      store.prisma.trackingTarget.create({
        data: { id:"missing-target", categoryId: "missing", targetAmount: 1, position:0 },
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
    await store.crud.tracking.create({
      item: { name: category, targetSpending: 100 },
    });
    await store.crud.settings.set({
      key: "essentialCategories",
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
        fs.readdirSync(path.join(process.cwd(), "prisma/migrations")).filter(name => fs.existsSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"))).length + 1,
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
  await store.crud.tracking.create({item:{name:category,targetSpending:42}});await store.close();
  fs.cpSync(path.join(process.cwd(),'prisma/migrations'),directory,{recursive:true});
  let db=new Database(file);const sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='categories'").get().sql.replace('"categories"','"new_categories"');db.close();
  const migration=path.join(directory,'202611200002_rebuild');fs.mkdirSync(migration);
  fs.writeFileSync(path.join(migration,'migration.sql'),`${sql}; INSERT INTO new_categories SELECT * FROM categories; DROP TABLE categories; ALTER TABLE new_categories RENAME TO categories;`);
  require('../../electron/migrations').migrate(file,{directory});
  db=new Database(file);assert.equal(db.prepare('SELECT count(*) AS n FROM tracking_targets').get().n,1);assert.equal(db.prepare('SELECT category_id FROM finance_entries').get().category_id,category);db.close();
  const broken=path.join(directory,'202611200003_broken');fs.mkdirSync(broken);fs.writeFileSync(path.join(broken,'migration.sql'),'CREATE TABLE should_rollback(id TEXT); THIS IS NOT SQL;');
  assert.throws(()=>require('../../electron/migrations').migrate(file,{directory}));
  db=new Database(file);assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='should_rollback'").get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM tracking_targets').get().n,1);db.close();
 }finally{await store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('monthly envelopes persist independent category membership, survive backup/restart, and reject invalid references', () =>
  fixture(async ({ store, reopen }) => {
    const month = '2026-11';
    const envelopes = [{id:'personal', name:'Personal spending', budget:500}];
    const items = [{...entry('dinner',40),source:category,envelopeId:'personal'}, {...entry('lunch',60),source:category}];
    await store.crud.months.save({month,lastUpdated:'-',entries:items,envelopes});
    let saved = await store.crud.months.get(month);
    assert.deepEqual(saved.envelopes,envelopes);
    assert.equal(saved.entries[0].envelopeId,'personal');
    assert.equal(saved.entries[0].source,category);
    assert.equal((await store.crud.months.range()).value.find(item=>item.month===month).envelopes[0].budget,500);
    await assert.rejects(store.crud.entries.update({month,id:'lunch',changes:{envelopeId:'missing'}}),/envelope/);
    await assert.rejects(store.crud.entries.update({month,id:'lunch',changes:{envelopeId:'personal',type:'income',source:undefined}}),/Invalid entry/);
    await assert.rejects(store.crud.months.save({month:'2026-12',lastUpdated:'-',entries:items,envelopes}),/another month/);
    await assert.rejects(store.crud.months.save({month,lastUpdated:'-',entries:items,envelopes:[{...envelopes[0],budget:-1}]}),/envelope/);
    assert.deepEqual(await store.crud.months.get(month),saved);
    await store.crud.entries.update({month,id:'lunch',changes:{envelopeId:'personal'}});
    const backup=await store.exportBackup();
    await store.reset((await store.crud.status()).revision);
    await store.restore(backup,(await store.crud.status()).revision);
    const opened=await reopen();
    saved=await opened.crud.months.get(month);
    assert.deepEqual(saved.envelopes,envelopes);
    assert.ok(saved.entries.every(item=>item.envelopeId==='personal'));
    await opened.crud.months.save({month,lastUpdated:'-',entries:saved.entries.map(item=>({...item,envelopeId:null})),envelopes:[]});
    const ungrouped=await opened.crud.months.get(month);
    assert.deepEqual(ungrouped.envelopes,[]);
    assert.ok(ungrouped.entries.every(item=>!item.envelopeId && item.source===category));
  }));

test('budget migration drops category limits and preserves finance entries and categories', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'envelope-upgrade-'));
  const file=path.join(dir,'db.sqlite'); const initial=path.join(dir,'initial');
  fs.mkdirSync(initial);
  fs.cpSync(path.join(process.cwd(),'prisma/migrations/202611200001_relational'),path.join(initial,'202611200001_relational'),{recursive:true});
  let store;
  try {
    require('../../electron/migrations').migrate(file,{directory:initial});
    const db=new Database(file);
    db.prepare('INSERT INTO categories (id,label,position) VALUES (?,?,?)').run('old-category','Food',0);
    db.prepare('INSERT INTO budgets (category_id,amount,position) VALUES (?,?,?)').run('old-category',100,0);
    db.prepare('INSERT INTO finance_months (id) VALUES (?)').run('2026-11');
    db.prepare('INSERT INTO finance_entries (month_id,id,type,name,normalized_name,amount,position) VALUES (?,?,?,?,?,?,?)')
      .run('2026-11','old','expense','Existing purchase','existing purchase',25,0);
    db.prepare('INSERT INTO fixed_cost_templates (id,type,name,normalized_name,amount,position,category_id) VALUES (?,?,?,?,?,?,?)').run('rent','expense','Rent','rent',600,0,'old-category');
    db.prepare('INSERT INTO finance_entry_history (id,month_id,entry_id,position,timestamp_text,value_number) VALUES (?,?,?,?,?,?)').run('history','2026-11','old',0,'2026-11-01',25);
    db.close();
    store=openDatabase(file);
    const month=await store.crud.months.get('2026-11');
    assert.equal(month.entries[0].value,25);
    assert.deepEqual(month.envelopes,[]);
    const upgraded=new Database(file);
    assert.equal(upgraded.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='budgets'").get().n,0);
    assert.equal(upgraded.prepare('SELECT label FROM categories WHERE id=?').get('old-category').label,'Food');
    assert.equal(upgraded.prepare('SELECT amount FROM fixed_cost_templates WHERE id=?').get('rent').amount,600);
    assert.equal(upgraded.prepare('SELECT category_id FROM fixed_cost_templates WHERE id=?').get('rent').category_id,'old-category');
    assert.equal(upgraded.prepare('SELECT value_number FROM finance_entry_history WHERE id=?').get('history').value_number,25);
    upgraded.close();
  } finally { if(store)await store.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});

test('global envelopes are shared definitions with independent monthly memberships and complete backup lifecycle', () =>
  fixture(async ({store,reopen}) => {
    const global={id:'revolut',name:'Revolut spending',budget:500,isGlobal:true};
    await store.crud.months.save({month:'2026-11',entries:[],lastUpdated:'-',globalEnvelopes:[global],expectedGlobalEnvelopes:[]});
    await store.crud.months.save({month:'2026-11',lastUpdated:'-',entries:[{...entry('dinner',40),source:category,envelopeId:'revolut'}]});
    await store.crud.months.save({month:'2026-12',lastUpdated:'-',entries:[{...entry('dinner',90),source:category,envelopeId:'revolut'}]});
    assert.deepEqual(await store.crud.envelopes.listGlobal(),[global]);
    assert.equal((await store.crud.months.get('2026-11')).entries[0].value,40);
    assert.equal((await store.crud.months.get('2026-12')).entries[0].value,90);
    const december=await store.crud.months.get('2026-12');
    await store.crud.months.save({month:'2026-11',lastUpdated:'-',entries:(await store.crud.months.get('2026-11')).entries,
      globalEnvelopes:[{...global,budget:600}],expectedGlobalEnvelopes:[global]});
    assert.equal((await store.crud.envelopes.listGlobal())[0].budget,600);
    await assert.rejects(store.crud.months.save({month:'2026-12',lastUpdated:'-',entries:december.entries,expectedRevision:december.revision}),/CONFLICT/);
    await assert.rejects(store.crud.months.save({month:'2026-11',lastUpdated:'-',entries:[],globalEnvelopes:[],expectedGlobalEnvelopes:[global]}),/CONFLICT/);
    const backup=await store.exportBackup();
    assert.equal(JSON.parse(backup).data.globalEnvelopes[0].budget,600);
    await store.reset((await store.crud.status()).revision);
    await store.restore(backup,(await store.crud.status()).revision);
    const opened=await reopen();
    assert.equal((await opened.crud.months.get('2026-12')).entries[0].envelopeId,'revolut');
    await opened.crud.months.delete({month:'2026-11'});
    assert.equal((await opened.crud.envelopes.listGlobal()).length,1);
    await opened.crud.months.save({month:'2027-01',lastUpdated:'-',entries:[],globalEnvelopes:[],
      expectedGlobalEnvelopes:[{...global,budget:600}]});
    const retained=await opened.crud.months.get('2026-12');
    assert.equal(retained.entries[0].envelopeId,undefined);
    assert.equal(retained.entries[0].source,category);
    assert.equal(retained.entries[0].value,90);
  }));

test('global-envelope upgrade preserves existing month-only definitions and entry foreign keys', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'global-envelope-upgrade-'));
  const file=path.join(dir,'db.sqlite'), initial=path.join(dir,'migrations');
  fs.mkdirSync(initial);let store;
  try {
    for(const name of ['202611200001_relational','202611200002_add_envelopes']) {
      fs.cpSync(path.join(process.cwd(),'prisma/migrations',name),path.join(initial,name),{recursive:true});
    }
    require('../../electron/migrations').migrate(file,{directory:initial});
    const db=new Database(file);
    db.exec(`INSERT INTO finance_months(id) VALUES('2026-11');
      INSERT INTO envelopes(id,month_id,name,budget,position) VALUES('local','2026-11','Personal',500,0);
      INSERT INTO finance_entries(month_id,id,type,name,normalized_name,amount,position,envelope_id)
        VALUES('2026-11','dinner','expense','Dinner','dinner',40,0,'local');`);
    db.close();store=openDatabase(file);
    const month=await store.crud.months.get('2026-11');
    assert.deepEqual(month.envelopes,[{id:'local',name:'Personal',budget:500}]);
    assert.equal(month.entries[0].envelopeId,'local');
    assert.deepEqual(await store.crud.envelopes.listGlobal(),[]);
  } finally {if(store)await store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('central global-envelope editing needs no month and preserves actual entries', () =>
  fixture(async ({store}) => {
    const global={id:'shared',name:'Revolut',budget:500,isGlobal:true};
    await store.crud.envelopes.replaceGlobal({items:[global],base:[]});
    assert.deepEqual(await store.crud.months.list(),[]);
    await store.crud.months.save({month:'2026-11',lastUpdated:'-',entries:[{...entry('dinner',40),source:category,envelopeId:'shared'}]});
    const changed={...global,name:'Revolut spending',budget:600};
    await store.crud.envelopes.replaceGlobal({items:[changed],base:[global]});
    assert.deepEqual(await store.crud.envelopes.listGlobal(),[changed]);
    assert.deepEqual((await store.crud.months.get('2026-11')).entries,[{...entry('dinner',40),source:category,envelopeId:'shared'}]);
    await assert.rejects(store.crud.envelopes.replaceGlobal({items:[],base:[global]}),/CONFLICT/);
    await store.crud.envelopes.replaceGlobal({items:[],base:[changed]});
    assert.deepEqual(await store.crud.envelopes.listGlobal(),[]);
    const retained=(await store.crud.months.get('2026-11')).entries[0];
    assert.equal(retained.value,40);assert.equal(retained.source,category);assert.equal(retained.envelopeId,undefined);
  }));

test("investment entries and templates survive backup restore with shared categories", () =>
  fixture(async ({ store, reopen }) => {
    const id = "Brokerage@__system/category__";
    await store.crud.categories.create({ item: { value: id, label: "Brokerage" } });
    const contribution = { ...entry("fund", 300), type: "investment", source: id };
    await save(store, "2025-04", [contribution, { ...entry("fee", 5), source: id }]);
    await store.crud.fixedCosts.replace({ items: [contribution] });

    const backup = await store.exportBackup();
    const opened = await reopen();
    await opened.restore(backup, (await opened.crud.status()).revision);
    const { entries } = await opened.crud.months.get("2025-04");
    assert.deepEqual(entries.map(item => [item.type, item.source]), [["investment", id], ["expense", id]]);
    assert.equal((await opened.crud.fixedCosts.get({ id: contribution.id })).type, "investment");
  }));

test("investment migration converts classified entries and templates while preserving their references", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "investment-entry-type-"));
  const filename = path.join(dir, "db.sqlite");
  const previous = path.join(dir, "migrations");
  const migrations = path.join(process.cwd(), "prisma/migrations");
  fs.mkdirSync(previous);
  let store;
  try {
    for (const name of fs.readdirSync(migrations).filter(name => name < "202611270002_investment_entry_type")) {
      fs.cpSync(path.join(migrations, name), path.join(previous, name), { recursive: true });
    }
    require("../../electron/migrations").migrate(filename, { directory: previous });
    const db = new Database(filename);
    try {
      db.prepare("INSERT INTO categories (id, label, position) VALUES (?, ?, ?)").run(category, "Housing", 0);
      db.prepare("INSERT INTO categories (id, label, position, classification) VALUES (?, ?, ?, ?)")
        .run("brokerage", "Brokerage", 1, "INVESTMENT");
      db.prepare("INSERT INTO finance_months (id) VALUES (?)").run("2025-04");
      db.prepare("INSERT INTO finance_entries (month_id, id, type, name, normalized_name, amount, position, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run("2025-04", "rent", "expense", "Rent", "rent", 300, 0, category);
      db.prepare("INSERT INTO finance_entries (month_id, id, type, name, normalized_name, amount, position, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run("2025-04", "fund", "expense", "Fund", "fund", 200, 1, "brokerage");
      db.prepare("INSERT INTO fixed_cost_templates (id, type, name, normalized_name, amount, position, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run("fund", "expense", "Fund", "fund", 200, 0, "brokerage");
    } finally {
      db.close();
    }
    store = openDatabase(filename);
    const { entries } = await store.crud.months.get("2025-04");
    assert.deepEqual(entries.map(item => [item.type, item.source]), [["expense", category], ["investment", "brokerage"]]);
    assert.equal((await store.crud.fixedCosts.get({ id: "fund" })).type, "investment");
  } finally {
    await store?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fixed cost templates keep global budget assignments through backup and clear them on deletion", () =>
  fixture(async ({ store }) => {
    const global = { id: "housing", name: "Housing", budget: 1000, isGlobal: true };
    const local = { id: "local", name: "Local", budget: 1000 };
    await store.crud.envelopes.replaceGlobal({ items: [global], base: [] });
    await store.crud.months.save({ month: "2026-11", entries: [], envelopes: [local], lastUpdated: "-" });
    const template = {
      id: "rent-template", target: "Rent", type: "expense", value: 800,
      isFixCost: true, envelopeId: global.id,
    };
    await assert.rejects(store.crud.fixedCosts.replace({
      items: [{ ...template, envelopeId: local.id }],
    }), /You can only assign global budgets to recurring amounts/);
    await store.crud.fixedCosts.replace({ items: [template] });
    const backup = await store.exportBackup();
    await store.restore(backup, (await store.crud.status()).revision);
    assert.equal((await store.crud.fixedCosts.get({ id: template.id })).envelopeId, global.id);
    await store.crud.envelopes.replaceGlobal({ items: [], base: [global] });
    const saved = await store.crud.fixedCosts.get({ id: template.id });
    assert.equal(saved.envelopeId, undefined);
    assert.equal(saved.value, 800);
  }));
