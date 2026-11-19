import { inject, Injectable } from '@angular/core';
import { ExpenseCategoryDetails, MonthlyData, SingleMonthData } from '../components/models';
import { AppStorage } from './app-storage';

/** Month persistence only. Calculations and UI notifications belong to DataService. */
@Injectable({ providedIn: 'root' })
export class MonthRepository {
  private readonly storage = inject(AppStorage);

  list(): MonthlyData {
    return this.storage.read('monthlyData') ?? {};
  }

  get(month: string): SingleMonthData | null {
    const months = this.list();
    return Object.hasOwn(months, month) ? months[month] : null;
  }

  create(data: SingleMonthData): void {
    const months = this.list();
    if (Object.hasOwn(months, data.month)) throw new Error(`Month ${data.month} already exists.`);
    this.replaceAll({ ...months, [data.month]: data });
  }

  update(data: SingleMonthData): void {
    const months = this.list();
    if (!Object.hasOwn(months, data.month)) throw new Error(`Month ${data.month} does not exist.`);
    this.replaceAll({ ...months, [data.month]: data });
  }

  upsert(data: SingleMonthData): void {
    this.replaceAll({ ...this.list(), [data.month]: data });
  }

  delete(month: string): boolean {
    const months = this.list();
    if (!Object.hasOwn(months, month)) return false;
    delete months[month];
    this.replaceAll(months);
    return true;
  }

  /** Persist a copied month and its new category definitions together. */
  importMonth(data: SingleMonthData, categories?: ExpenseCategoryDetails[]): void {
    const months = { ...this.list(), [data.month]: data };
    this.validate(months);
    const changes = new Map([['monthlyData', JSON.stringify(months)]]);
    if (categories) changes.set('expenseCategories', JSON.stringify(categories));
    this.storage.replaceLegacyItems(changes);
  }

  replaceAll(months: MonthlyData): void {
    this.validate(months);
    this.storage.write('monthlyData', months);
  }

  private validate(months: MonthlyData): void {
    for (const [month, data] of Object.entries(months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || data.month !== month) {
        throw new Error(`Invalid month: ${month}`);
      }
    }
  }
}
