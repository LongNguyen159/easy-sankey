const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textKeys = new Set(['selectedCurrency','entryView','budgetView','budgetSort','fixCostSort','firstTime','appVersion']);
const collections = { expenseCategories: 'value', fixCosts: 'id', budgets: 'category' };
const keys = new Set(['monthlyData', ...Object.keys(collections), ...textKeys,
  'trackedCategories','essentialCategories','logs','themeSettings','budgetManualOrder']);
function fail(message) { throw new Error(message); }
function entry(value) {
  if (!object(value) || typeof value.id !== 'string' || !value.id || !['income','expense','tax'].includes(value.type)
    || typeof value.target !== 'string' || !value.target.trim() || !Number.isFinite(value.value) || value.value < 0
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
    }
  } else if (textKeys.has(key)) {
    if (typeof value !== 'string') fail('Invalid preference.');
    if (['budgetSort','fixCostSort'].includes(key) && !['manual','highest','lowest'].includes(value)) fail('Invalid sort preference.');
    if (key === 'firstTime' && !['true','false'].includes(value)) fail('Invalid onboarding flag.');
  } else if (key === 'fixCosts') entries(value);
  else if (key === 'expenseCategories') {
    if (!Array.isArray(value)) fail('Invalid categories.');
    const ids = new Set();
    for (const category of value) {
      if (!object(category) || typeof category.value !== 'string' || !category.value.endsWith('@__system/category__')
        || ids.has(category.value) || typeof category.label !== 'string' || !category.label.trim()
        || ['icon','colorLight','colorDark'].some(k => category[k] != null && typeof category[k] !== 'string')) fail('Invalid category.');
      ids.add(category.value);
    }
  } else if (key === 'budgets') {
    if (!Array.isArray(value) || value.some(v => !object(v) || typeof v.category !== 'string' || !Number.isFinite(v.value) || v.value < 0)
      || new Set(value.map(v => v.category)).size !== value.length) fail('Invalid budgets.');
  } else if (['essentialCategories','budgetManualOrder'].includes(key)) {
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
  if (key === 'monthlyData' && value) return Object.fromEntries(Object.entries(value).map(([month, record]) =>
    [month, { month, lastUpdated: record.lastUpdated, rawInput: record.rawInput }]));
  if (key === 'trackedCategories' && value) return { targetSurplus: value.targetSurplus, avgIncome:value.avgIncome??0,
    trackingCategories: value.trackingCategories.map(v => ({ name:v.name, targetSpending:v.targetSpending })) };
  return value;
}

// Legacy file/IPC DTOs are mapped here. Database rows contain columns, never JSON.
/** @returns {Record<string, unknown>} */
function sourceData(data) {
  if (!object(data)) throw new Error("Invalid source data.");
  const result = {};
  for (const [key, value] of Object.entries(data))
    result[key] = canonical(key, value);
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
  return sourceData(data);
}
function entryDto(row) {
  if (!row) return null;
  const item = {
    id: row.id,
    type: row.type,
    target: row.name,
    value: row.amount,
  };
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
function entryColumns(item) {
  return {
    id: item.id,
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
  budgetView: "budgetView",
  budgetSort: "budgetSort",
  fixCostSort: "fixedCostSort",
  appVersion: "appVersion",
};
module.exports = {canonical, entries, keys, textKeys, object,
  sourceData,
  legacyData,
  entryDto,
  entryColumns,
  categoryDto,
  historyDto,
  preferenceColumns,
};
