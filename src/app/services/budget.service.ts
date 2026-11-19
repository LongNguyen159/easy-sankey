import { AppStorage } from '../storage/app-storage';
import { Injectable, signal, inject } from '@angular/core';
import { Budget } from '../components/models';

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private readonly storage = inject(AppStorage);
  private readonly storageKey = 'budgets';

  budget = signal<Budget[]>(this.getBudgets());

  

  constructor() { }


  getBudgets(): Budget[] {
    return this.storage.read(this.storageKey) ?? [];
  }

  async saveBudgets(budgets: Budget[]) {
    // Filter out budgets with no value or value <= 0
    const validBudgets = budgets.filter((budget: Budget) => budget.value && budget.value > 0);
    await this.storage.write(this.storageKey, validBudgets);
    this.budget.set(validBudgets);
  }
}
