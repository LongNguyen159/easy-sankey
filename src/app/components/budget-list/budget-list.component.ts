import { CategoryService } from '../../services/category.service';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { Budget } from '../models';
import { MatIconModule } from '@angular/material/icon';
import { ColorService } from '../../services/color.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { BudgetService } from '../../services/budget.service';
import { BudgetDialogComponent } from '../dialogs/budget-dialog/budget-dialog.component';
import { UiService } from '../../services/ui.service';
import { CurrencyService } from '../../services/currency.service';

@Component({
    selector: 'app-budget-list',
    imports: [
        MatCardModule,
        MatIconModule,
        MatButtonToggleModule,
        NgTemplateOutlet
    ],
    templateUrl: './budget-list.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './budget-list.component.scss'
})
export class BudgetListComponent implements OnInit{
  colorService = inject(ColorService)
  budgetService = inject(BudgetService)
  uiService = inject(UiService)
  private readonly categoryService = inject(CategoryService);
  protected readonly categories = this.categoryService.categories;
  currencyService = inject(CurrencyService)

  budgets: Budget[] = [];

  protected view: 'cards' | 'list' = localStorage.getItem('budgetView') === 'list' ? 'list' : 'cards';

  constructor(private dialog: MatDialog) {}

  ngOnInit(): void {
    this.budgets = this.budgetService.getBudgets()
  }

  protected setView(view: 'cards' | 'list'): void {
    this.view = view;
    localStorage.setItem('budgetView', view);
  }


  /** Open Edit values dialog for a category */
  onBudgetClick(category: string) {

    const currentBudget = this.getCurrentBudget(category);

    const dialogRef = this.dialog.open(BudgetDialogComponent, {
      width: '500px',
      height: '300px',
      data: { categoryLabel: this.categoryService.label(category), value: currentBudget }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result !== undefined) {
        this.updateBudget(category, result);
      }
    });
  }

  /** Display budget value in the template.
   * @returns Budget value with currency symbol
   */
  getBudgetValue(category: string): string {
    const budgetValue = this.budgets.find(budget => budget.category === category)?.value;
    return budgetValue ? this.currencyService.getCurrencySymbol(this.currencyService.getSelectedCurrency()) + budgetValue.toLocaleString('en-US') : '—';
  }
  

  /** Get budget value of a Category.
   * @param category Category to get budget value for
   * 
   * @returns Budget value for the category
   */
  getCurrentBudget(category: string): number {
    const budgets = this.budgetService.getBudgets();
    return budgets.find(budget => budget.category === category)?.value || 0;
  }

  /** Update budget value for a category.
   * @param category Category to update budget for
   * @param value New budget value
   */
  updateBudget(category: string, value: number) {
    const budgetIndex = this.budgets.findIndex(budget => budget.category === category);

    if (budgetIndex >= 0) {
      this.budgets[budgetIndex].value = value;
    } else {
      this.budgets.push({ category, value });
    }

    this.budgetService.saveBudgets(this.budgets);
    if (value === 0 || value == null) {
      this.uiService.showSnackBar(`Removed budget for ${this.categoryService.label(category)}`, 'OK', 3000);
    } else {
      this.uiService.showSnackBar(`Budget for ${this.categoryService.label(category)} set!`, 'OK', 3000);
    }
  }
}
