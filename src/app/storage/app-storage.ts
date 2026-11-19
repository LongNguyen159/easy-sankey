import { getSqliteClient } from './sqlite-client';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Budget, ExpenseCategoryDetails, MonthlyData, TrackingMetaData, UserDefinedLink } from '../components/models';
import { AmountSort } from '../utils/amount-sort';
import { exportBackup, readBackup, replaceStorageItems } from '../utils/data-transfer';

/** Optional in-memory/browser adapter for isolated tests; production uses SQLite. */
export const PERSISTENT_STORAGE = new InjectionToken<Storage | null>('Test storage adapter', {
  providedIn: 'root', factory: () => null,
});
export const SESSION_STORAGE = new InjectionToken<Storage>('Session storage adapter', {
  providedIn: 'root', factory: () => sessionStorage,
});

export interface StorageSchema {
  monthlyData: MonthlyData;
  expenseCategories: ExpenseCategoryDetails[];
  fixCosts: UserDefinedLink[];
  budgets: Budget[];
  trackedCategories: TrackingMetaData;
  essentialCategories: string[];
  logs: Record<string, Record<string, { timestamp: string; value: string | number }[]>>;
  themeSettings: { isDarkMode: boolean; isManualThemeSet: boolean; selectedTheme: string };
  selectedCurrency: string;
  entryView: string;
  budgetView: string;
  budgetSort: AmountSort;
  fixCostSort: AmountSort;
  budgetManualOrder: string[];
  firstTime: string;
  appVersion: string;
}

const textKeys = new Set<keyof StorageSchema>([
  'selectedCurrency', 'entryView', 'budgetView', 'budgetSort', 'fixCostSort', 'firstTime', 'appVersion',
]);

/** Runtime snapshot reads and awaited SQLite writes. Test adapters are explicitly injected. */
@Injectable({ providedIn: 'root' })
export class AppStorage {
  private readonly adapter = inject(PERSISTENT_STORAGE);

  read<K extends keyof StorageSchema>(key: K): StorageSchema[K] | null {
    if (!this.adapter) return getSqliteClient().read(key);
    const value = this.adapter.getItem(key);
    if (value === null) return null;
    return (textKeys.has(key) ? value : JSON.parse(value)) as StorageSchema[K];
  }

  async write<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): Promise<void> {
    if (!this.adapter) return getSqliteClient().mutate({[key]:value});
    this.adapter.setItem(key, textKeys.has(key) ? String(value) : JSON.stringify(value));
  }

  async delete(key: keyof StorageSchema): Promise<void> {
    if (!this.adapter) return getSqliteClient().mutate({[key]:null});
    this.adapter.removeItem(key);
  }

  async clear(): Promise<void> {
    if (!this.adapter) return getSqliteClient().reset();
    this.adapter.clear();
  }

  async exportBackup(): Promise<string> {
    if (!this.adapter) return (await getSqliteClient().exportBackup());
    return exportBackup(this.adapter);
  }

  async restoreBackup(text: string): Promise<void> {
    if (!this.adapter) return getSqliteClient().restore(text);
    await this.replaceLegacyItems(readBackup(text));
  }

  /** Compatibility boundary for validated imports; rolls back on write failure. */
  async replaceLegacyItems(changes: ReadonlyMap<string, string | null>): Promise<void> {
    if (!this.adapter) return getSqliteClient().legacyChanges(changes);
    replaceStorageItems(this.adapter, changes);
  }

  async writeBatch(changes:Partial<{[K in keyof StorageSchema]:StorageSchema[K]|null}>):Promise<void> {
    if(!this.adapter) return getSqliteClient().mutate(changes);
    const encoded=new Map<string,string|null>();
    for(const [key,value] of Object.entries(changes)) {
      if(value===undefined)continue;
      encoded.set(key,value===null?null:textKeys.has(key as keyof StorageSchema)?String(value):JSON.stringify(value));
    }
    replaceStorageItems(this.adapter,encoded);
  }

  async deleteCategory(id:string):Promise<boolean> {
    if(this.adapter) return false;
    await getSqliteClient().deleteCategory(id);
    return true;
  }


}

interface SessionSchema {
  copiedLinks: UserDefinedLink[];
  isFormatBigNumbers: boolean;
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly adapter = inject(SESSION_STORAGE);

  read<K extends keyof SessionSchema>(key: K): SessionSchema[K] | null {
    const value = this.adapter.getItem(key);
    return value === null ? null : JSON.parse(value) as SessionSchema[K];
  }

  write<K extends keyof SessionSchema>(key: K, value: SessionSchema[K]): void {
    this.adapter.setItem(key, JSON.stringify(value));
  }

  delete(key: keyof SessionSchema): void {
    this.adapter.removeItem(key);
  }

  clear(): void {
    this.adapter.clear();
  }
}
