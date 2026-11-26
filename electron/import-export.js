const defaults = require("./default-categories.json");
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textKeys = new Set(['selectedCurrency','entryView','fixCostSort','firstTime','appVersion']);
const collections = { expenseCategories: 'value', fixCosts: 'id' };
const keys = new Set(['monthlyData', 'globalEnvelopes', ...Object.keys(collections), ...textKeys,
  'trackedCategories','essentialCategories','logs','themeSettings']);
function fail(message) { throw new Error(message); }
function entry(value) {
  if (!object(value) || typeof value.id !== 'string' || !value.id || !['income','expense','tax'].includes(value.type)
    || typeof value.target !== 'string' || !value.target.trim() || !Number.isFinite(value.value) || value.value < 0
    || (value.envelopeId != null && (typeof value.envelopeId !== 'string' || !value.envelopeId || value.type !== 'expense'))
    || (value.source != null && typeof value.source !== 'string')
    || (value.lastEditedAt != null && (!Number.isFinite(value.lastEditedAt) || value.lastEditedAt < 0))
    || ['isFixCost','demo'].some(key => value[key] != null && typeof value[key] !== 'boolean')) fail('Invalid entry.');
  return value;
}
function entries(values) {
  if (!Array.isArray(values)) fail('Invalid entries.');
  const ids = new Set(), names = new Set();
  for (const value of values) {
    entry(value);
    const name = value.target.trim().toLowerCase();
    if (ids.has(value.id) || names.has(name)) fail('Duplicate entry identity or name.');
    ids.add(value.id); names.add(name);
  }
  const parents = new Map(values.filter(v => v.type === 'expense').map(v => [v.target,v.source]));
  for (const name of parents.keys()) {
    const seen = new Set();
    for (let current = name; parents.has(current); current = parents.get(current)) {
      if (seen.has(current)) fail('Expense hierarchy contains a cycle.');
      seen.add(current);
    }
  }
}
function envelopes(values) {
  if (!Array.isArray(values)) fail('Invalid envelopes.');
  const ids = new Set(), names = new Set();
  for (const value of values) {
    if (!object(value) || typeof value.id !== 'string' || !value.id
      || typeof value.name !== 'string' || !value.name.trim()
      || (value.isGlobal != null && typeof value.isGlobal !== 'boolean')
      || !Number.isFinite(value.budget) || value.budget <= 0
      || ids.has(value.id) || names.has(`${!!value.isGlobal}:${value.name.trim().toLowerCase()}`)) fail('Invalid or duplicate envelope.');
    ids.add(value.id); names.add(`${!!value.isGlobal}:${value.name.trim().toLowerCase()}`);
  }
}
function validate(key, value) {
  if (!keys.has(key)) fail('Unsupported storage field.');
  if (value === null) return;
  if (key === 'monthlyData') {
    if (!object(value)) fail('Invalid months.');
    for (const [month, record] of Object.entries(value)) {
      if (!monthPattern.test(month) || !object(record) || record.month !== month
        || typeof record.lastUpdated !== 'string'
        || (record.lastUpdated !== '-' && !Number.isFinite(Date.parse(record.lastUpdated)))) fail('Invalid month metadata.');
      entries(record.rawInput);
      envelopes(record.envelopes ?? []);

    }
  } else if (key === 'globalEnvelopes') envelopes(value);
  else if (textKeys.has(key)) {
    if (typeof value !== 'string') fail('Invalid preference.');
    if (key === 'fixCostSort' && !['manual','highest','lowest'].includes(value)) fail('Invalid sort preference.');
    if (key === 'firstTime' && !['true','false'].includes(value)) fail('Invalid onboarding flag.');
  } else if (key === 'fixCosts') entries(value);
  else if (key === 'expenseCategories') {
    if (!Array.isArray(value)) fail('Invalid categories.');
    const ids = new Set();
    for (const category of value) {
      if (!object(category) || typeof category.value !== 'string' || !category.value.endsWith('@__system/category__')
        || ids.has(category.value) || typeof category.label !== 'string' || !category.label.trim()
        || (category.classification !== undefined && !['EXPENSE', 'INVESTMENT'].includes(category.classification))
        || ['icon','colorLight','colorDark'].some(k => category[k] != null && typeof category[k] !== 'string')) fail('Invalid category.');
      ids.add(category.value);
    }
  } else if (key === 'essentialCategories') {
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) fail('Invalid category order.');
  } else if (key === 'themeSettings') {
    if (!object(value) || typeof value.isDarkMode !== 'boolean' || typeof value.isManualThemeSet !== 'boolean'
      || !['system','light','dark'].includes(value.selectedTheme)) fail('Invalid theme.');
  } else if (key === 'trackedCategories') {
    if (!object(value) || !Number.isFinite(value.targetSurplus) || (value.avgIncome!=null && !Number.isFinite(value.avgIncome))
      || !Array.isArray(value.trackingCategories) || value.trackingCategories.some(v => !object(v)
        || typeof v.name !== 'string' || !Number.isFinite(v.targetSpending))) fail('Invalid tracking targets.');
  } else if (key === 'logs') {
    if (!object(value)) fail('Invalid history.');
    for (const [month, values] of Object.entries(value)) {
      if (!monthPattern.test(month) || !object(values)) fail('Invalid history month.');
      for (const history of Object.values(values)) if (!Array.isArray(history) || history.some(v => !object(v)
        || typeof v.timestamp !== 'string' || !(typeof v.value === 'string' || Number.isFinite(v.value)))) fail('Invalid history record.');
    }
  }
}
function canonical(key,value) {
  validate(key,value);
  if (key === 'globalEnvelopes' && value) return value.map(item => ({id:item.id,name:item.name,budget:item.budget,isGlobal:true}));
  if (key === 'monthlyData' && value) return Object.fromEntries(Object.entries(value).map(([month, record]) =>
    [month, { month, lastUpdated: record.lastUpdated, rawInput: record.rawInput, ...(record.envelopes?.length ? {envelopes:record.envelopes} : {}) }]));
  if (key === 'trackedCategories' && value) return { targetSurplus: value.targetSurplus, avgIncome:value.avgIncome??0,
    trackingCategories: value.trackingCategories.map(v => ({ name:v.name, targetSpending:v.targetSpending })) };
  return value;
}

// Legacy file/IPC DTOs are mapped here. Database rows contain columns, never JSON.
/** @returns {Record<string, unknown>} */
function sourceData(data) {
  if (!object(data)) throw new Error("Invalid source data.");
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (['budgets', 'budgetManualOrder', 'budgetView', 'budgetSort'].includes(key)) continue; // Discard retired category limits.
    result[key] = canonical(key, value);
  }
  const globals = result.globalEnvelopes ?? [];
  envelopes(globals);
  for (const record of Object.values(result.monthlyData ?? {})) {
    const available = [...globals, ...(record.envelopes ?? [])];
    if (new Set(available.map(item => item.id)).size !== available.length) fail('Duplicate envelope identity.');
    const ids = new Set(available.map(item => item.id));
    if (record.rawInput.some(item => item.envelopeId && !ids.has(item.envelopeId))) fail('Missing envelope for entry.');
  }
  return result;
}
function legacyData(legacy) {
  if (!object(legacy)) throw new Error("Invalid LocalStorage export.");
  const data = {};
  for (const key of keys)
    if (Object.hasOwn(legacy, key)) {
      if (typeof legacy[key] !== "string")
        throw new Error("Invalid legacy value.");
      data[key] = textKeys.has(key) ? legacy[key] : JSON.parse(legacy[key]);
    }
  const parsed = sourceData(data);
  const categories = new Set((parsed.expenseCategories ?? defaults).map(item => item.value));
  const clearMissingSources = (items) => {
    const names = new Set(items.map(item => item.target.trim().toLowerCase()));
    return items.map(item => {
      const { source, ...uncategorized } = item;
      if (source !== "-- None --" && (item.type !== "expense" || !source
        || categories.has(source) || names.has(source.trim().toLowerCase()))) return item;
      // The old selector used "-- None --" for direct expenses. Legacy storage
      // could also retain references to removed parents or categories.
      return uncategorized;
    });
  };
  for (const record of Object.values(parsed.monthlyData ?? {}))
    record.rawInput = clearMissingSources(record.rawInput);
  if (parsed.fixCosts) parsed.fixCosts = clearMissingSources(parsed.fixCosts);
  return parsed;
}
function entryDto(row) {
  if (!row) return null;
  const item = {
    id: row.id,
    type: row.type,
    target: row.name,
    value: row.amount,
  };
  if (row.envelopeId) item.envelopeId = row.envelopeId;
  if (row.categoryId) item.source = row.categoryId;
  else if (row.parent) item.source = row.parent.name;
  for (const [field, column] of [
    ["isFixCost", "isFixedCost"],
    ["demo", "demo"],
    ["lastEditedAt", "lastEditedAt"],
  ])
    if (row[column] !== null)
      item[field] =
        typeof row[column] === "bigint" ? Number(row[column]) : row[column];
  return item;
}
function entryColumns(item, template = false) {
  return {
    id: item.id,
    ...(!template ? {envelopeId: item.envelopeId ?? null} : {}),
    type: item.type,
    name: item.target,
    normalizedName: item.target.trim().toLowerCase(),
    amount: item.value,
    isFixedCost: item.isFixCost ?? null,
    demo: item.demo ?? null,
    lastEditedAt: item.lastEditedAt == null ? null : BigInt(item.lastEditedAt),
  };
}
function categoryDto(row) {
  return {
    value: row.id,
    label: row.label,
    classification: row.classification,
    ...Object.fromEntries(
      [
        ["icon", row.icon],
        ["colorLight", row.colorLight],
        ["colorDark", row.colorDark],
      ].filter(([, value]) => value !== null),
    ),
  };
}
function historyDto(row) {
  return {
    timestamp: row.timestampText,
    value: row.valueText ?? row.valueNumber,
  };
}
const preferenceColumns = {
  selectedCurrency: "selectedCurrency",
  entryView: "entryView",
  fixCostSort: "fixedCostSort",
  appVersion: "appVersion",
};
module.exports = {canonical, entries, envelopes, keys, textKeys, object,
  sourceData,
  legacyData,
  entryDto,
  entryColumns,
  categoryDto,
  historyDto,
  preferenceColumns,
};
