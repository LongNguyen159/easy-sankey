import { EntryType, ExpenseCategoryDetails, SYSTEM_PREFIX, UserDefinedLink } from '../components/models';
import { isAmountSort } from './amount-sort';

const app = 'easy-sankey';
const version = 1;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export const categoryStorageKey = 'expenseCategories';

type JsonObject = Record<string, unknown>;
type Validator = (value: unknown) => boolean;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function arrayOf(value: unknown, validate: Validator): boolean {
  return Array.isArray(value) && value.every(validate);
}

function isEntry(value: unknown): value is UserDefinedLink {
  return isObject(value)
    && isString(value['id']) && !!value['id']
    && Object.values(EntryType).some(type => type === value['type'])
    && isString(value['target']) && !!value['target'].trim()
    && isNumber(value['value']) && value['value'] >= 0
    && (value['source'] == null || isString(value['source']))
    && (value['isFixCost'] == null || isBoolean(value['isFixCost']))
    && (value['lastEditedAt'] == null || (isNumber(value['lastEditedAt']) && value['lastEditedAt'] >= 0))
    && (value['demo'] == null || isBoolean(value['demo']));
}

function isCategory(value: unknown): value is ExpenseCategoryDetails {
  return isObject(value)
    && isString(value['value']) && value['value'].endsWith(`@${SYSTEM_PREFIX}`)
    && isString(value['label']) && !!value['label'].trim()
    && ['icon', 'colorLight', 'colorDark'].every(key => value[key] === undefined || isString(value[key]));
}

function isChartNode(value: unknown): boolean {
  return isObject(value) && isString(value['name']) && isNumber(value['value']);
}

function isTreeNode(value: unknown): boolean {
  return isObject(value) && isChartNode(value) && arrayOf(value['children'], isTreeNode);
}

function isSavedMonth(value: unknown, month: string): boolean {
  if (!isObject(value)) return false;
  const updated = value['lastUpdated'];
  return value['month'] === month
    && isString(updated) && (updated === '-' || Number.isFinite(Date.parse(updated)))
    && arrayOf(value['rawInput'], isEntry);
}

const storageValidators: Record<string, Validator> = {
  monthlyData: value => isObject(value) && Object.entries(value)
    .every(([month, data]) => monthPattern.test(month) && isSavedMonth(data, month)),
  [categoryStorageKey]: value => arrayOf(value, isCategory),
  fixCosts: value => arrayOf(value, isEntry),
  budgets: value => arrayOf(value, budget => isObject(budget)
    && isString(budget['category']) && isNumber(budget['value'])),
  budgetManualOrder: value => arrayOf(value, isString),
  trackedCategories: value => isObject(value)
    && isNumber(value['targetSurplus']) && (value['avgIncome'] == null || isNumber(value['avgIncome']))
    && arrayOf(value['trackingCategories'], tracker => isObject(tracker) && isString(tracker['name'])
      && isNumber(tracker['targetSpending'])),
  essentialCategories: value => arrayOf(value, isString),
  logs: value => isObject(value) && Object.entries(value).every(([month, entries]) =>
    monthPattern.test(month) && isObject(entries) && Object.values(entries).every(history =>
      arrayOf(history, log => isObject(log) && isString(log['timestamp'])
        && (isString(log['value']) || isNumber(log['value']))))),
  themeSettings: value => isObject(value) && isBoolean(value['isDarkMode'])
    && isBoolean(value['isManualThemeSet']) && isString(value['selectedTheme']),
  selectedCurrency: isString,
  entryView: isString,
  budgetView: isString,
  budgetSort: isAmountSort,
  fixCostSort: isAmountSort,
  firstTime: value => value === 'true' || value === 'false',
  appVersion: isString,
};

const textKeys = new Set(['selectedCurrency', 'entryView', 'budgetView', 'budgetSort', 'fixCostSort', 'firstTime', 'appVersion']);

export function exportBackup(storage: Storage): string {
  const data: JsonObject = {};
  for (const key of Object.keys(storageValidators)) {
    const value = storage.getItem(key);
    if (value !== null) data[key] = textKeys.has(key) ? value : JSON.parse(value);
  }
  return JSON.stringify({ app, version, type: 'full', data }, null, 2);
}

function readTransfer(text: string, type: 'full' | 'month'): JsonObject {
  const payload: unknown = JSON.parse(text);
  if (!isObject(payload) || payload['app'] !== app || ![1, 2].includes(payload['version'] as number) || payload['type'] !== type) {
    throw new Error('Unsupported data transfer format.');
  }
  return payload;
}

export function readBackup(text: string): Map<string, string | null> {
  const data = readTransfer(text, 'full')['data'];
  if (!isObject(data) || Object.keys(data).some(key =>
    !Object.hasOwn(storageValidators, key) || !storageValidators[key](data[key]))) {
    throw new Error('Invalid backup data.');
  }
  return new Map(Object.keys(storageValidators).map(key => [
    key, !Object.hasOwn(data, key) ? null : textKeys.has(key) ? data[key] as string : JSON.stringify(data[key])
  ]));
}

/** Free space for replacement values and restore the original values if a write fails. */
export function replaceStorageItems(storage: Storage, changes: ReadonlyMap<string, string | null>): void {
  const previous = new Map(Array.from(changes.keys(), key => [key, storage.getItem(key)]));
  const write = (items: ReadonlyMap<string, string | null>) => {
    for (const key of items.keys()) storage.removeItem(key);
    for (const [key, value] of items) {
      if (value !== null) storage.setItem(key, value);
    }
  };

  try {
    write(changes);
  } catch (error) {
    write(previous);
    throw error;
  }
}

export interface MonthTransfer {
  entries: UserDefinedLink[];
  categories: ExpenseCategoryDetails[];
}

export function exportMonth(entries: UserDefinedLink[], categories: readonly ExpenseCategoryDetails[]): string {
  const sources = new Set(entries.map(entry => entry.source));
  return JSON.stringify({ app, version, type: 'month', entries, categories: categories.filter(category => sources.has(category.value)) });
}

export function readMonth(text: string): MonthTransfer {
  const payload = readTransfer(text, 'month');
  const entries = payload['entries'];
  const categories = payload['categories'];
  if (!Array.isArray(entries) || !entries.length || !entries.every(isEntry)
    || !Array.isArray(categories) || !categories.every(isCategory)) {
    throw new Error('Invalid month data.');
  }
  return { entries, categories };
}
