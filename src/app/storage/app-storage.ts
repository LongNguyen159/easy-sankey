import { inject, Injectable, InjectionToken } from '@angular/core';
import { Budget, ExpenseCategoryDetails, MonthlyData, TrackingMetaData, UserDefinedLink } from '../components/models';
import { AmountSort } from '../utils/amount-sort';
import { exportBackup, readBackup, replaceStorageItems } from '../utils/data-transfer';

/** The legacy adapter is the only production code allowed to access browser storage. */
export const PERSISTENT_STORAGE = new InjectionToken<Storage>('Persistent storage adapter', {
  providedIn: 'root', factory: () => localStorage,
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

/**
 * Typed persistence boundary. Values are detached snapshots; failed writes throw.
 * This first adapter deliberately preserves existing keys and backup formats.
 * Its synchronous contract must be replaced with an async repository contract before
 * introducing IndexedDB or Electron database calls; it is not a database abstraction.
 */
@Injectable({ providedIn: 'root' })
export class AppStorage {
  private readonly adapter = inject(PERSISTENT_STORAGE);

  read<K extends keyof StorageSchema>(key: K): StorageSchema[K] | null {
    const value = this.adapter.getItem(key);
    if (value === null) return null;
    return (textKeys.has(key) ? value : JSON.parse(value)) as StorageSchema[K];
  }

  write<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): void {
    this.adapter.setItem(key, textKeys.has(key) ? String(value) : JSON.stringify(value));
  }

  delete(key: keyof StorageSchema): void {
    this.adapter.removeItem(key);
  }

  clear(): void {
    this.adapter.clear();
  }

  exportBackup(): string {
    return exportBackup(this.adapter);
  }

  restoreBackup(text: string): void {
    this.replaceLegacyItems(readBackup(text));
  }

  /** Compatibility boundary for validated imports; rolls back on write failure. */
  replaceLegacyItems(changes: ReadonlyMap<string, string | null>): void {
    replaceStorageItems(this.adapter, changes);
  }

  removeObsoleteFinancialData(): void {
    this.adapter.removeItem('userFinancialData');
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
