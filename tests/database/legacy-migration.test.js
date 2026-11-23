const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { openDatabase } = require("../../electron/database");
async function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "legacy-"));
  let store;
  const file = join(dir, "finance.sqlite");
  try {
    store = openDatabase(file);
    await run({
      file,
      store,
      reopen: async () => {
        await await store.close();
        store = openDatabase(file);
        return store;
      },
    });
  } finally {
    await store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
const month = {
  month: "2025-04",
  lastUpdated: "2025-04-01T12:00:00Z",
  rawInput: [
    {
      id: "salary",
      target: "Salary",
      type: "income",
      value: 1000.123,
      lastEditedAt: 1234,
    },
    {
      id: "food",
      target: "Food",
      type: "expense",
      value: 12.345,
      isFixCost: true,
    },
  ],
  pieData: [{ name: "obsolete", value: 99 }],
};
test("released LocalStorage imports source records once with identities, precision, history and settings intact", () =>
  fixture(async ({ store, reopen }) => {
    const legacy = {
      monthlyData: JSON.stringify({ "2025-04": month }),
      selectedCurrency: "EUR",
      budgetView: "list",
      logs: JSON.stringify({
        "2025-04": { food: [{ timestamp: "Apr 01", value: "10+2.345" }] },
      }),
      trackedCategories: JSON.stringify({
        avgIncome: 2000,
        targetSurplus: 100,
        trackingCategories: [
          { name: "Food", targetSpending: 50, currentSpending: 12 },
        ],
      }),
    };
    assert.equal((await store.crud.status()).initialized, false);
    const state = await store.initialize(legacy);
    assert.deepEqual(
      state.data.monthlyData["2025-04"].rawInput,
      month.rawInput,
    );
    assert.equal(state.data.monthlyData["2025-04"].pieData, undefined);
    assert.equal(state.data.selectedCurrency, "EUR");
    assert.equal(state.data.budgetView, undefined);
    assert.deepEqual(state.data.logs, JSON.parse(legacy.logs));
    assert.equal(
      state.data.trackedCategories.trackingCategories[0].currentSpending,
      undefined,
    );
    const reopened = await reopen();
    assert.equal(
      (await reopened.initialize({ selectedCurrency: "OLD" })).data
        .selectedCurrency,
      "EUR",
    );
  }));
test("malformed legacy data rolls back and remains retryable after reopening", () =>
  fixture(async ({ store, reopen }) => {
    await assert.rejects(
      store.initialize({ selectedCurrency: "EUR", monthlyData: "broken" }),
    );
    assert.equal((await store.crud.status()).initialized, false);
    assert.equal((await store.snapshot()).data.selectedCurrency, undefined);
    const opened = await reopen();
    assert.equal((await opened.crud.status()).initialized, false);
    assert.equal(
      (await opened.initialize({ selectedCurrency: "EUR", logs: "{}" })).data
        .selectedCurrency,
      "EUR",
    );
  }));
test("legacy import retains entries and history when a parent or category is missing", () =>
  fixture(async ({ store, reopen }) => {
    const expense = (id, target, source) => ({
      id, target, type: "expense", value: 12.345, ...(source ? { source } : {}),
    });
    const missingParent = expense("internet", "Internet", "Deleted parent");
    const missingCategory = expense("rent", "Rent", "Deleted@__system/category__");
    const category = "Housing@__system/category__";
    const parent = expense("utilities", "Utilities", category);
    const child = expense("electricity", "Electricity", "Utilities");
    const template = expense("template", "Phone", "Utilities");
    const directExpense = {
      id: "e29d5689-8932-4b7e-ac95-2941caad4c40",
      type: "expense",
      target: "Rest Kaution",
      value: 200,
      isFixCost: false,
    };
    const logs = { "2025-04": { internet: [{ timestamp: "Apr 01", value: 12.345 }] } };
    await store.initialize({
      expenseCategories: JSON.stringify([{ value: category, label: "Housing" }]),
      monthlyData: JSON.stringify({
        "2025-04": {
          ...month,
          rawInput: [missingParent, missingCategory, child, parent, { ...directExpense, source: "-- None --" }],
        },
      }),
      fixCosts: JSON.stringify([template]),
      logs: JSON.stringify(logs),
    });
    const opened = await reopen();
    const state = await opened.snapshot();
    assert.equal(state.initialized, true);
    assert.deepEqual(state.data.monthlyData["2025-04"].rawInput, [
      expense("internet", "Internet"),
      expense("rent", "Rent"),
      child,
      parent,
      directExpense,
    ]);
    assert.deepEqual(state.data.fixCosts, [expense("template", "Phone")]);
    assert.deepEqual(state.data.logs, logs);
  }));
test("reset and missing database never resurrect obsolete LocalStorage; explicit restore recovers", () =>
  fixture(async ({ store, file, reopen }) => {
    await store.initialize({
      monthlyData: JSON.stringify({ "2025-04": month }),
    });
    const backup = await store.exportBackup();
    await store.reset((await store.snapshot()).revision);
    assert.equal(
      (await store.initialize({ selectedCurrency: "OLD" })).data
        .selectedCurrency,
      undefined,
    );
    await store.close();
    unlinkSync(file);
    const opened = await reopen();
    assert.equal((await opened.crud.status()).recoveryRequired, true);
    assert.equal(
      (await opened.initialize({ selectedCurrency: "OLD" })).data
        .selectedCurrency,
      undefined,
    );
    await opened.restore(backup, (await opened.snapshot()).revision);
    assert.equal((await opened.crud.status()).initialized, true);
    assert.deepEqual(
      (await opened.crud.months.get("2025-04")).entries,
      month.rawInput,
    );
  }));
