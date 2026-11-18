import { Injector } from '@angular/core';
import { EntryType, ExpenseCategory, UserDefinedLink } from '../components/models';
import { BudgetService } from './budget.service';
import { CATEGORY_COLORS, CategoryService } from './category.service';
import { DataService } from './data.service';
import { LogsService } from './logs.service';
import { TrackingService } from './tracking.service';
import { UiService } from './ui.service';

describe('expense categories', () => {
  let injector: ReturnType<typeof createInjector>;
  let categories: CategoryService;
  let data: DataService;

  function createInjector() {
    return Injector.create({
      providers: [
        CategoryService,
        DataService,
        BudgetService,
        TrackingService,
        { provide: LogsService, useValue: { sanitiseLogs: () => {} } },
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
});
