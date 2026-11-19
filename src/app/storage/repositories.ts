import { InjectionToken, Injectable, inject } from '@angular/core';
import { Budget, ExpenseCategoryDetails, UserDefinedLink } from '../components/models';
import { AmountSort } from '../utils/amount-sort';
import { DatabaseClient, getDatabaseClient } from './sqlite-client';
import { EntityApi, TrackingTarget, TrackingMetadata } from './database-api';
export const DATABASE_CLIENT = new InjectionToken<DatabaseClient>('Desktop database client', { providedIn: 'root', factory: getDatabaseClient });
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
let fixedSeed: UserDefinedLink[] = [];
let trackingSeed: TrackingTarget[] = [];
let metadataSeed: TrackingMetadata = { targetSurplus: 0, avgIncome: 0 };
export const CONFIGURATION = new InjectionToken('Loaded configuration', { providedIn: 'root', factory: () => ({ settings: settingsSeed, categories: categoriesSeed, budgets: budgetsSeed, fixedCosts: fixedSeed, tracking: trackingSeed, metadata: metadataSeed }) });
export async function initializeRepositories(client: DatabaseClient) {
    const [settings, categories, budgets, fixed, tracking, metadata] = await Promise.all([
        client.api.settings.list(), client.api.categories.list(), client.api.budgets.list(), client.api.fixedCosts.list(), client.api.tracking.list(), client.api.trackingMetadata()
    ]);
    settingsSeed = settings.value;
    categoriesSeed = categories.items;
    budgetsSeed = budgets.items;
    fixedSeed = fixed.items;
    trackingSeed = tracking.items;
    metadataSeed = metadata;
}
@Injectable({ providedIn: 'root' })
export class SettingsRepository {
    private client = inject(DATABASE_CLIENT);
    private values: Partial<Settings> = structuredClone(inject(CONFIGURATION).settings);
    read<K extends keyof Settings>(key: K): Settings[K] | null { return structuredClone(this.values[key] ?? null) as Settings[K] | null; }
    async write<K extends keyof Settings>(key: K, value: Settings[K]) { const input = structuredClone(value); await this.client.command(() => this.client.api.settings.set({ key, value: input })); this.values[key] = input; }
    async reload() { this.values = (await this.client.api.settings.list()).value; }
}
/** A loaded configuration collection; it is never a copy of the entire database. */
class LoadedCollection<T> {
    protected client = inject(DATABASE_CLIENT);
    protected items: T[];
    constructor(protected api: EntityApi<T>, seed: T[]) { this.items = structuredClone(seed); }
    list(): T[] { return structuredClone(this.items); }
    async reload() { this.items = (await this.api.list()).items; }
    async save(items: T[], metadata?: TrackingMetadata) { const base = this.list(); const input = structuredClone(items); const result = await this.client.command(() => this.api.replace({ items: input, base, metadata })); this.items = result.value; }
}
@Injectable({ providedIn: 'root' })
export class CategoryRepository extends LoadedCollection<ExpenseCategoryDetails> {
    constructor() { super(inject(DATABASE_CLIENT).api.categories, inject(CONFIGURATION).categories); }
    async create(item: ExpenseCategoryDetails) { await this.client.command(() => this.api.create({ item })); await this.reload(); }
    async update(item: ExpenseCategoryDetails) { await this.client.command(() => this.api.update({ id: item.value, item })); await this.reload(); }
    async reorder(ids: string[]) { await this.client.command(() => this.api.reorder({ ids })); await this.reload(); }
    async remove(id: string) { await this.client.command(() => this.client.api.deleteCategory({ id })); await this.reload(); }
}
@Injectable({ providedIn: 'root' })
export class BudgetRepository extends LoadedCollection<Budget> {
    constructor() { super(inject(DATABASE_CLIENT).api.budgets, inject(CONFIGURATION).budgets); }
    async set(category:string,value:number) {
        await this.client.command(async()=>{
            if(value<=0)await this.api.delete({id:category});
            else if(await this.api.get({id:category}))await this.api.update({id:category,item:{category,value}});
            else await this.api.create({item:{category,value}});
        });
        await this.reload();
    }
}
@Injectable({ providedIn: 'root' })
export class FixedCostRepository extends LoadedCollection<UserDefinedLink> {
    constructor() { super(inject(DATABASE_CLIENT).api.fixedCosts, inject(CONFIGURATION).fixedCosts); }
}
@Injectable({ providedIn: 'root' })
export class TrackingRepository extends LoadedCollection<TrackingTarget> {
    metadata = structuredClone(inject(CONFIGURATION).metadata);
    constructor() { super(inject(DATABASE_CLIENT).api.tracking, inject(CONFIGURATION).tracking); }
    override async reload() { await super.reload(); this.metadata = await this.client.api.trackingMetadata(); }
    async removeTarget(id:string){await this.client.command(()=>this.api.delete({id}));await this.reload();}
    async saveConfiguration(items: TrackingTarget[], metadata: TrackingMetadata) { await this.save(items, metadata); this.metadata = structuredClone(metadata); }
}
@Injectable({ providedIn: 'root' })
export class BackupRepository {
    private client = inject(DATABASE_CLIENT);
    exportBackup() { return this.client.exportBackup(); }
    restoreBackup(text: string) { return this.client.restore(text); }
    clear() { return this.client.reset(); }
}
