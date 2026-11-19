import { BudgetRepository } from '../storage/repositories';
import { Injectable, signal, inject } from '@angular/core';
import { Budget } from '../components/models';

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private readonly storage = inject(BudgetRepository);
  private readonly storageKey = 'budgets';

  budget = signal<Budget[]>(this.getBudgets());

  

  constructor() { }


  getBudgets(): Budget[] {
    return this.storage.list() ?? [];
  }

  async reload(){await this.storage.reload();this.budget.set(this.getBudgets());}

  async setBudget(category:string,value:number){await this.storage.set(category,value);this.budget.set(this.storage.list());}

  async saveBudgets(budgets: Budget[]) {
    // Filter out budgets with no value or value <= 0
    const validBudgets = budgets.filter((budget: Budget) => budget.value && budget.value > 0);
    await this.storage.save(validBudgets);
    this.budget.set(validBudgets);
  }
}
