import { InjectionToken } from '@angular/core';
import { AmountSort } from '../utils/amount-sort';
import { BudgetEnvelope, Budget, ExpenseCategoryDetails, UserDefinedLink } from '../components/models';
export interface MonthSource {
    month: string;
    lastUpdated: string;
    rawInput: UserDefinedLink[];
    envelopes?: BudgetEnvelope[];
}
export interface StoredMonth {
    month: string;
    lastUpdated: string;
    entries: UserDefinedLink[];
    envelopes?: BudgetEnvelope[];
    revision: number;
}
export interface DatabaseSnapshot {
    revision: number;
    initialized?: boolean;
    recoveryRequired?: boolean;
    data: Record<string, unknown> & {
        monthlyData?: Record<string, MonthSource>;
    };
}
export interface CommandResult<T> {
    revision: number;
    value: T;
    affected: string[];
}
export interface HistoryItem {
    timestamp: string;
    value: string | number;
}
export interface TrackingTarget {
    name: string;
    targetSpending: number;
}
export interface TrackingMetadata {
    targetSurplus: number;
    avgIncome: number;
}
export interface MonthSave {
    globalEnvelopes?: BudgetEnvelope[];
    expectedGlobalEnvelopes?: BudgetEnvelope[];
    envelopes?: BudgetEnvelope[];
    month: string;
    lastUpdated: string;
    entries: UserDefinedLink[];
    expectedRevision?: number | null;
    revision?: number;
    mode?: 'create' | 'update';
    categories?: ExpenseCategoryDetails[];
    clearHistory?: boolean;
    history?: Record<string, HistoryItem>;
}

import type {ClientOf} from '../../../electron/api';
import type {operations} from '../../../electron/api';
export type DatabaseApi=ClientOf<typeof operations>;
declare global {
    interface Window {
        electronAPI?: {
            database: DatabaseApi;
            readMonthClipboard?: () => Promise<string>;
            writeMonthClipboard?: (text: string) => Promise<void>;
            [key: string]: any;
        };
    }
}

let client: DatabaseClient | undefined;
export function getDatabaseClient(): DatabaseClient {
    if (!client)
        throw new Error('Desktop database is not initialized.');
    return client;
}
/** Coordinates commands, without retaining financial data or silently retrying conflicts. */
export class DatabaseClient {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(readonly api: DatabaseApi) { }
    command<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.tail.then(operation);
        this.tail = result.catch(() => { });
        return result;
    }
    async exportBackup() { await this.tail; return this.api.state.exportBackup(); }
    restore(text: string) { return this.command(async () => this.api.state.restore({ text, revision: (await this.api.status()).revision })); }
    reset() { return this.command(async () => this.api.state.reset((await this.api.status()).revision)); }
}
/** Connect to the database created by the desktop process. */
export async function initializeSqlite(): Promise<void> {
    const api = window.electronAPI?.database;
    if (!api)
        throw new Error('Open Easy Sankey in the desktop application to use its local database.');
    const status=await api.status();
    if(!status.initialized&&!status.recoveryRequired) {
        const legacy:Record<string,string>={};
        for(let index=0;index<localStorage.length;index++) {
            const key=localStorage.key(index)!;legacy[key]=localStorage.getItem(key)!;
        }
        await api.state.initialize(legacy);
    }
    if((await api.status()).recoveryRequired)throw new Error('Database is missing. Restore a full backup to recover your data.');
    client = new DatabaseClient(api);
    await loadConfiguration(client);
    await api.history.cleanup({});
}

export const DATABASE_CLIENT = new InjectionToken<DatabaseClient>('Desktop database',{providedIn:'root',factory:getDatabaseClient});
export interface Settings {
  essentialCategories: string[];
  themeSettings: {
    isDarkMode: boolean;
    isManualThemeSet: boolean;
    selectedTheme: string;
  };
  selectedCurrency: string;
  entryView: string;
  budgetView: string;
  budgetSort: AmountSort;
  fixCostSort: AmountSort;
  budgetManualOrder: string[];
  firstTime: string;
  appVersion: string;
}
// Only small configuration scopes are loaded before rendering; months and history are queried on demand.
let settingsSeed: Partial<Settings> = {};
let categoriesSeed: ExpenseCategoryDetails[] = [];
let budgetsSeed: Budget[] = [];
let globalEnvelopesSeed: BudgetEnvelope[] = [];
let fixedSeed: UserDefinedLink[] = [];
let trackingSeed: TrackingTarget[] = [];
let metadataSeed: TrackingMetadata = { targetSurplus: 0, avgIncome: 0 };
export const CONFIGURATION = new InjectionToken('Loaded configuration', {
  providedIn: 'root',
  factory: () => ({
    settings: settingsSeed,
    categories: categoriesSeed,
    budgets: budgetsSeed,
    globalEnvelopes: globalEnvelopesSeed,
    fixedCosts: fixedSeed,
    tracking: trackingSeed,
    metadata: metadataSeed,
  }),
});
async function loadConfiguration(client: DatabaseClient) {
  const [settings, categories, budgets, fixed, tracking, metadata, globalEnvelopes] =
    await Promise.all([
      client.api.settings.list(),
      client.api.categories.list(),
      client.api.budgets.list(),
      client.api.fixedCosts.list(),
      client.api.tracking.list(),
      client.api.trackingMetadata(),
      client.api.envelopes.listGlobal(),
    ]);
  settingsSeed = settings.value;
  categoriesSeed = categories.items;
  budgetsSeed = budgets.items;
  globalEnvelopesSeed = globalEnvelopes;
  fixedSeed = fixed.items;
  trackingSeed = tracking.items;
  metadataSeed = metadata;
}
