import { TestBed } from '@angular/core/testing';
import { SingleMonthData } from '../components/models';
import { AppStorage, PERSISTENT_STORAGE, SESSION_STORAGE, SessionStore } from './app-storage';
import { MonthRepository } from './month.repository';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
  };
}

function month(key = '2025-04'): SingleMonthData {
  return {
    month: key, lastUpdated: '2025-04-01T00:00:00.000Z', rawInput: [],
    sankeyData: { nodes: [], links: [] }, pieData: [], treeMapData: [],
    totalGrossIncome: 100, totalUsableIncome: 100, totalTax: 0,
    totalExpenses: 20, remainingBalance: '80',
  };
}

describe('storage boundary', () => {
  let adapter: Storage;
  let session: Storage;
  let storage: AppStorage;
  let months: MonthRepository;

  beforeEach(() => {
    adapter = memoryStorage();
    session = memoryStorage();
    TestBed.configureTestingModule({ providers: [
      { provide: PERSISTENT_STORAGE, useValue: adapter },
      { provide: SESSION_STORAGE, useValue: session },
    ] });
    storage = TestBed.inject(AppStorage);
    months = TestBed.inject(MonthRepository);
  });

  it('reads existing text and JSON keys without migrating or rewriting them', () => {
    adapter.setItem('selectedCurrency', 'EUR');
    adapter.setItem('budgets', '[{"category":"housing","value":100}]');
    const write = spyOn(adapter, 'setItem').and.callThrough();
    expect(storage.read('selectedCurrency')).toBe('EUR');
    expect(storage.read('budgets')).toEqual([{ category: 'housing', value: 100 }]);
    expect(storage.read('logs')).toBeNull();
    expect(months.get('constructor')).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('returns detached snapshots and persists only explicit writes', () => {
    storage.write('budgets', [{ category: 'housing', value: 100 }]);
    storage.read('budgets')![0].value = 200;
    expect(storage.read('budgets')![0].value).toBe(100);
    storage.delete('budgets');
    expect(storage.read('budgets')).toBeNull();
  });

  it('creates, reads, updates and deletes a month without losing another month', () => {
    months.create(month());
    months.create(month('2025-05'));
    expect(months.get('2025-04')).toEqual(month());
    months.update({ ...month(), totalExpenses: 40 });
    expect(months.get('2025-04')?.totalExpenses).toBe(40);
    expect(months.delete('2025-04')).toBeTrue();
    expect(months.delete('2025-04')).toBeFalse();
    expect(months.get('2025-04')).toBeNull();
    expect(Object.keys(months.list())).toEqual(['2025-05']);
  });

  it('rejects duplicate creation, missing updates and invalid month identifiers before writing', () => {
    months.create(month());
    const before = adapter.getItem('monthlyData');
    expect(() => months.create(month())).toThrowError(/already exists/);
    expect(() => months.update(month('2025-05'))).toThrowError(/does not exist/);
    expect(() => months.upsert(month('2025-13'))).toThrowError(/Invalid month/);
    expect(() => months.replaceAll({ '2025-05': month() })).toThrowError(/Invalid month/);
    expect(adapter.getItem('monthlyData')).toBe(before);
  });

  it('supports upsert and explicit replacement of all months', () => {
    months.upsert(month());
    months.upsert({ ...month(), totalExpenses: 30 });
    expect(months.get('2025-04')?.totalExpenses).toBe(30);
    months.replaceAll({ '2025-05': month('2025-05') });
    expect(Object.keys(months.list())).toEqual(['2025-05']);
  });

  it('propagates failed writes without changing the saved month', () => {
    months.create(month());
    spyOn(adapter, 'setItem').and.throwError('Disk full');
    expect(() => months.update({ ...month(), totalExpenses: 50 })).toThrowError('Disk full');
    expect(months.get('2025-04')?.totalExpenses).toBe(20);
  });

  it('rolls back a copied month when its category definitions cannot be saved', () => {
    months.create(month());
    const original = adapter.setItem.bind(adapter);
    spyOn(adapter, 'setItem').and.callFake((key, value) => {
      if (key === 'expenseCategories') throw new Error('Disk full');
      original(key, value);
    });
    expect(() => months.importMonth(month('2025-05'), [])).toThrowError('Disk full');
    expect(Object.keys(months.list())).toEqual(['2025-04']);
    expect(storage.read('expenseCategories')).toBeNull();
  });

  it('restores legacy backups and rejects malformed backups without changing data', () => {
    months.create(month());
    storage.write('selectedCurrency', 'USD');
    const backup = storage.exportBackup();
    months.create(month('2025-05'));
    storage.write('selectedCurrency', 'EUR');
    storage.restoreBackup(backup);
    expect(Object.keys(months.list())).toEqual(['2025-04']);
    expect(storage.read('selectedCurrency')).toBe('USD');
    expect(() => storage.restoreBackup('{"app":"other"}')).toThrow();
    expect(Object.keys(months.list())).toEqual(['2025-04']);
  });

  it('keeps session state separate and preserves the existing boolean format', () => {
    const sessions = TestBed.inject(SessionStore);
    session.setItem('isFormatBigNumbers', 'false');
    expect(sessions.read('isFormatBigNumbers')).toBeFalse();
    sessions.write('isFormatBigNumbers', true);
    expect(session.getItem('isFormatBigNumbers')).toBe('true');
    storage.write('selectedCurrency', 'EUR');
    sessions.clear();
    expect(sessions.read('isFormatBigNumbers')).toBeNull();
    expect(storage.read('selectedCurrency')).toBe('EUR');
  });
});
