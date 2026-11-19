import { AppStorage, SessionStore, PERSISTENT_STORAGE, SESSION_STORAGE } from '../storage/app-storage';
import { MonthRepository } from '../storage/month.repository';
import { Injector } from '@angular/core';
import { EntryType, ExpenseCategory, UserDefinedLink } from '../components/models';
import { BudgetService } from './budget.service';
import { CATEGORY_COLORS, CategoryService } from './category.service';
import { DataService } from './data.service';
import { LogsService } from './logs.service';
import { TrackingService } from './tracking.service';
import { UiService } from './ui.service';
import { exportBackup, exportMonth, readBackup, readMonth, replaceStorageItems } from '../utils/data-transfer';

describe('expense categories', () => {
  let injector: ReturnType<typeof createInjector>;
  let categories: CategoryService;
  let data: DataService;

  function createInjector() {
    return Injector.create({
      providers: [
        AppStorage,
        SessionStore,
        MonthRepository,
        { provide: PERSISTENT_STORAGE, useFactory: () => localStorage },
        { provide: SESSION_STORAGE, useFactory: () => sessionStorage },
        CategoryService,
        DataService,
        BudgetService,
        TrackingService,
        { provide: LogsService, useValue: { sanitiseLogs: () => {}, removeMonthLogs: () => {} } },
        { provide: UiService, useValue: { showSnackBar: () => {}, openConfirmDialog: () => {} } },
      ],
    });
  }

  function seedMonth(month: string, categoryId: string) {
    const links: UserDefinedLink[] = [
      { id: 'income', type: EntryType.Income, target: 'Salary', value: 1000 },
      { id: 'expense', type: EntryType.Expense, target: 'Supplies', value: 80, source: categoryId },
      { id: 'other', type: EntryType.Expense, target: 'Rent', value: 200, source: ExpenseCategory.Housing },
    ];
    data.processInputData(links, month);
    return links;
  }

  beforeEach(() => {
    const storage = new Map<string, string>([['firstTime', 'false'], ['appVersion', '2.0.3']]);
    const session = new Map<string, string>();
    spyOn(Storage.prototype, 'getItem').and.callFake(function (this: Storage, key: string) {
      return (this === localStorage ? storage : session).get(key) ?? null;
    });
    spyOn(Storage.prototype, 'setItem').and.callFake(function (this: Storage, key: string, value: string) {
      (this === localStorage ? storage : session).set(key, value);
    });
    spyOn(Storage.prototype, 'removeItem').and.callFake(function (this: Storage, key: string) {
      (this === localStorage ? storage : session).delete(key);
    });

    injector = createInjector();
    categories = injector.get(CategoryService);
    data = injector.get(DataService);
  });

  it('persists custom categories and edits existing categories using the original reference', () => {
    seedMonth('2025-04', ExpenseCategory.Groceries);

    categories.save('Supplies', 'build', CATEGORY_COLORS[0], ExpenseCategory.Groceries);
    categories.save('Pets', 'pets', CATEGORY_COLORS[1]);

    const reopened = createInjector();
    const savedCategories = reopened.get(CategoryService);
    const savedEntry = reopened.get(DataService).loadSingleMonth('2025-04')?.rawInput[1];
    expect(savedEntry?.source).toBe(ExpenseCategory.Groceries);
    expect(savedCategories.get(savedEntry!.source!)).toEqual(jasmine.objectContaining({
      label: 'Supplies', icon: 'build', colorLight: CATEGORY_COLORS[0].colorLight,
    }));
    expect(savedCategories.categories().some(category => category.label === 'Pets')).toBeTrue();
  });

  it('persists category order without changing which category a saved entry references', () => {
    seedMonth('2025-04', ExpenseCategory.Groceries);
    const originalIds = categories.categories().map(category => category.value);

    expect(categories.move(ExpenseCategory.Groceries, 0)).toBeTrue();
    expect(categories.move(ExpenseCategory.Groceries, -1)).toBeFalse();

    const reopened = createInjector();
    expect(reopened.get(CategoryService).categories().map(category => category.value)).toEqual([
      ExpenseCategory.Groceries,
      ...originalIds.filter(id => id !== ExpenseCategory.Groceries),
    ]);
    expect(reopened.get(DataService).loadSingleMonth('2025-04')?.rawInput[1].source).toBe(ExpenseCategory.Groceries);
  });

  it('clears a deleted category across months, templates and copies while retaining entries and totals', () => {
    categories.save('Tools', 'build', CATEGORY_COLORS[0]);
    const id = categories.categories().find(category => category.label === 'Tools')!.value;
    const april = seedMonth('2025-04', id);
    seedMonth('2025-05', id);
    localStorage.setItem('fixCosts', JSON.stringify([{ ...april[1], isFixCost: true }]));
    data.storeCopiedLinks(april);
    injector.get(BudgetService).saveBudgets([{ category: id, value: 100 }]);

    data.removeCategory(id);

    expect(categories.get(id)).toBeUndefined();
    for (const month of ['2025-04', '2025-05']) {
      const saved = data.loadSingleMonth(month)!;
      expect(saved.rawInput.map(entry => entry.id)).toEqual(['income', 'expense', 'other']);
      expect(saved.rawInput[1].source).toBeUndefined();
      expect(saved.rawInput[2].source).toBe(ExpenseCategory.Housing);
      expect(saved.totalExpenses).toBe(280);
      expect(saved.sankeyData.links).toContain({ source: 'Salary', target: 'Supplies', value: 80 });
      expect(saved.pieData.some(item => item.name === id)).toBeFalse();
    }
    expect(JSON.parse(localStorage.getItem('fixCosts')!)[0].source).toBeUndefined();
    expect(data.retrieveCopiedLinks()?.[1].source).toBeUndefined();
    expect(injector.get(BudgetService).getBudgets()).toEqual([]);
    expect(createInjector().get(CategoryService).get(id)).toBeUndefined();

    // A copy taken before deletion can still be pasted without reviving the reference.
    expect(data.processInputData(april, '2025-06')?.rawInput[1].source).toBeUndefined();
  });

  it('imports a copied month into a separate data set, keeping its category and replacing only the selected month', () => {
    const custom = categories.save('Tools', 'build', CATEGORY_COLORS[0]);
    const april = seedMonth('2025-04', custom.value);
    const copied = readMonth(exportMonth(april, categories.categories()));
    localStorage.removeItem('expenseCategories');
    localStorage.removeItem('monthlyData');
    injector = createInjector();
    categories = injector.get(CategoryService);
    data = injector.get(DataService);
    seedMonth('2025-06', ExpenseCategory.Groceries);
    const july = seedMonth('2025-07', ExpenseCategory.Housing);

    data.importMonth('2025-06', copied);

    const june = data.loadSingleMonth('2025-06')!;
    expect(june.totalExpenses).toBe(280);
    expect(june.rawInput[1].source).toBe(custom.value);
    expect(june.rawInput.map(link => link.id)).not.toEqual(april.map(link => link.id));
    expect(categories.get(custom.value)).toEqual(custom);
    expect(data.loadSingleMonth('2025-07')?.rawInput).toEqual(july);
    expect(data.loadSingleMonth('2025-04')).toBeNull();
  });

  it('leaves the destination untouched when a copied month has an expense cycle', () => {
    seedMonth('2025-06', ExpenseCategory.Groceries);
    const before = localStorage.getItem('monthlyData');
    const entries = [
      { id: 'a', type: EntryType.Expense, target: 'A', value: 1, source: 'B' },
      { id: 'b', type: EntryType.Expense, target: 'B', value: 1, source: 'A' },
    ];

    expect(() => data.importMonth('2025-06', { entries, categories: [] })).toThrowError(/cycle/);
    expect(localStorage.getItem('monthlyData')).toBe(before);
  });

  it('deletes a month from persistence and published views while retaining other months', () => {
    seedMonth('2025-04', ExpenseCategory.Groceries);
    const may = seedMonth('2025-05', ExpenseCategory.Housing);
    let published: Record<string, unknown> = {};
    const subscription = data.getAllMonthsData().subscribe(value => { published = value; });

    data.removeMonth('2025-04');

    expect(data.loadSingleMonth('2025-04')).toBeNull();
    expect(data.loadSingleMonth('2025-05')?.rawInput).toEqual(may);
    expect(Object.keys(published)).toEqual(['2025-05']);
    expect(data.monthlyData['2025-04'].rawInput).toEqual([]);
    subscription.unsubscribe();
  });

  it('restores a full backup and removes app data absent from the backup', () => {
    const custom = categories.save('Tools', 'build', CATEGORY_COLORS[0]);
    const april = seedMonth('2025-04', custom.value);
    localStorage.setItem('selectedCurrency', 'USD');
    const backup = readBackup(exportBackup(localStorage));
    seedMonth('2025-05', ExpenseCategory.Groceries);
    localStorage.setItem('budgets', JSON.stringify([{ category: custom.value, value: 100 }]));
    localStorage.setItem('selectedCurrency', 'EUR');

    replaceStorageItems(localStorage, backup);

    const restored = createInjector();
    expect(restored.get(DataService).loadSingleMonth('2025-04')?.rawInput).toEqual(april);
    expect(restored.get(DataService).loadSingleMonth('2025-05')).toBeNull();
    expect(restored.get(CategoryService).get(custom.value)).toEqual(custom);
    expect(restored.get(BudgetService).getBudgets()).toEqual([]);
    expect(localStorage.getItem('selectedCurrency')).toBe('USD');
  });

  it('rejects invalid backups before replacing storage and restores the original values if a write fails', () => {
    const april = seedMonth('2025-04', ExpenseCategory.Groceries);
    const before = localStorage.getItem('monthlyData');
    const invalid = JSON.parse(exportBackup(localStorage));
    invalid.data.monthlyData['2025-04'].rawInput = null;
    expect(() => readBackup(JSON.stringify(invalid))).toThrow();
    expect(() => readBackup(exportMonth(april, categories.categories()))).toThrow();

    const write = jasmine.createSpy('write').and.callFake((key: string, value: string) => {
      if (key === 'budgets') throw new DOMException('Quota reached', 'QuotaExceededError');
      saved.set(key, value);
    });
    const saved = new Map([['monthlyData', before!]]);
    const storage: Storage = {
      get length() { return saved.size; },
      clear: () => saved.clear(),
      key: index => [...saved.keys()][index] ?? null,
      getItem: key => saved.get(key) ?? null,
      setItem: write,
      removeItem: key => { saved.delete(key); },
    };
    const tooLarge = new Map([['monthlyData', '{}'], ['budgets', '[]']]);
    expect(() => replaceStorageItems(storage, tooLarge)).toThrow();
    expect(storage.getItem('monthlyData')).toBe(before);
    expect(storage.getItem('budgets')).toBeNull();
  });
});
