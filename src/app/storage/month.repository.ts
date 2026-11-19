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

  async create(data: SingleMonthData): Promise<void> {
    const months = this.list();
    if (Object.hasOwn(months, data.month)) throw new Error(`Month ${data.month} already exists.`);
    await this.replaceAll({ ...months, [data.month]: data });
  }

  async update(data: SingleMonthData): Promise<void> {
    const months = this.list();
    if (!Object.hasOwn(months, data.month)) throw new Error(`Month ${data.month} does not exist.`);
    await this.replaceAll({ ...months, [data.month]: data });
  }

  async upsert(data: SingleMonthData): Promise<void> {
    await this.replaceAll({ ...this.list(), [data.month]: data });
  }

  async delete(month: string): Promise<boolean> {
    const months = this.list();
    if (!Object.hasOwn(months, month)) return false;
    delete months[month];
    const logs=this.storage.read('logs') ?? {};
    delete logs[month];
    await this.storage.writeBatch({monthlyData:months,logs});
    return true;
  }

  /** Persist a copied month and its new category definitions together. */
  async importMonth(data: SingleMonthData, categories?: ExpenseCategoryDetails[]): Promise<void> {
    const months = { ...this.list(), [data.month]: data };
    this.validate(months);
    const logs=this.storage.read('logs') ?? {};
    delete logs[data.month];
    await this.storage.writeBatch({monthlyData:months,logs,...(categories?{expenseCategories:categories}:{})});
  }

  async replaceAll(months: MonthlyData): Promise<void> {
    this.validate(months);
    await this.storage.write('monthlyData', months);
  }

  private validate(months: MonthlyData): void {
    for (const [month, data] of Object.entries(months)) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || data.month !== month) {
        throw new Error(`Invalid month: ${month}`);
      }
    }
  }
}
