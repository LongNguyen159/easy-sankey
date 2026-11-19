import { AppStorage } from '../../storage/app-storage';
import { CategoryService } from '../../services/category.service';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, Component, inject, Injector, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { Budget, ExpenseCategoryDetails } from '../models';
import { MatIconModule } from '@angular/material/icon';
import { ColorService } from '../../services/color.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { BudgetService } from '../../services/budget.service';
import { BudgetDialogComponent } from '../dialogs/budget-dialog/budget-dialog.component';
import { UiService } from '../../services/ui.service';
import { CurrencyService } from '../../services/currency.service';
import { AmountSortComponent } from '../amount-sort/amount-sort.component';
import { AmountSort, resolveAmountSort, sortByAmount } from '../../utils/amount-sort';

@Component({
    selector: 'app-budget-list',
    imports: [
        MatCardModule,
        MatIconModule,
        MatButtonToggleModule,
        MatButtonModule,
        NgTemplateOutlet,
        CdkDrag,
        CdkDragHandle,
        CdkDropList,
        AmountSortComponent
    ],
    templateUrl: './budget-list.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './budget-list.component.scss'
})
export class BudgetListComponent implements OnInit{
  private readonly storage = inject(AppStorage);
  colorService = inject(ColorService)
  budgetService = inject(BudgetService)
  uiService = inject(UiService)
  private readonly categoryService = inject(CategoryService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  currencyService = inject(CurrencyService)

  budgets: Budget[] = [];

  protected view: 'cards' | 'list' = this.storage.read('budgetView') === 'list' ? 'list' : 'cards';
  protected sortOrder = resolveAmountSort(this.storage.read('budgetSort'));
  private manualOrder: string[] = [];

  constructor(private dialog: MatDialog) {}

  ngOnInit(): void {
    this.budgets = this.budgetService.getBudgets();
    try {
      const stored: unknown = this.storage.read('budgetManualOrder') ?? [];
      if (Array.isArray(stored) && stored.every(id => typeof id === 'string')) this.manualOrder = stored;
    } catch {
      // Use the category order if the saved order cannot be read.
    }
  }

  protected async setView(view: 'cards' | 'list'): Promise<void> {
    this.view = view;
    await this.storage.write('budgetView', view);
  }

  protected async setSort(order: AmountSort): Promise<void> {
    this.sortOrder = order;
    await this.storage.write('budgetSort', order);
  }

  protected get orderedCategories(): ExpenseCategoryDetails[] {
    const ranks = new Map(this.manualOrder.map((id, index) => [id, index]));
    const categories = [...this.categoryService.categories()].sort((a, b) =>
      (ranks.get(a.value) ?? ranks.size) - (ranks.get(b.value) ?? ranks.size)
    );
    const amounts = new Map(this.budgets.map(budget => [budget.category, budget.value]));
    return sortByAmount(categories, this.sortOrder, category => amounts.get(category.value) ?? 0);
  }

  protected async dropBudget(event: CdkDragDrop<ExpenseCategoryDetails[]>): Promise<void> {
    if (event.isPointerOverContainer) {
      await this.moveBudget(event.container.data, event.previousIndex, event.currentIndex);
    }
  }

  protected async moveBudgetWithKeyboard(event: Event, from: number, to: number): Promise<void> {
    event.preventDefault();
    const handle = event.currentTarget as HTMLButtonElement;
    if ((await this.moveBudget(this.orderedCategories, from, to))) {
      afterNextRender(() => handle.focus(), { injector: this.injector });
    }
  }

  private async moveBudget(categories: ExpenseCategoryDetails[], from: number, to: number): Promise<boolean> {
    if (this.sortOrder !== 'manual' || from === to || from < 0 || from >= categories.length || to < 0 || to >= categories.length) {
      return false;
    }

    const order = categories.map(category => category.value);
    moveItemInArray(order, from, to);
    this.manualOrder = order;
    await this.storage.write('budgetManualOrder', order);
    void this.announcer.announce(`${categories[from].label} moved to position ${to + 1} of ${order.length}.`);
    return true;
  }

  /** Open Edit values dialog for a category */
  onBudgetClick(category: string) {

    const currentBudget = this.getCurrentBudget(category);

    const dialogRef = this.dialog.open(BudgetDialogComponent, {
      width: '500px',
      height: '300px',
      data: { categoryLabel: this.categoryService.label(category), value: currentBudget }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result !== undefined) {
        await this.updateBudget(category, result);
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
  async updateBudget(category: string, value: number) {
    const budgetIndex = this.budgets.findIndex(budget => budget.category === category);

    if (budgetIndex >= 0) {
      this.budgets[budgetIndex].value = value;
    } else {
      this.budgets.push({ category, value });
    }

    await this.budgetService.saveBudgets(this.budgets);
    if (value === 0 || value == null) {
      this.uiService.showSnackBar(`Removed budget for ${this.categoryService.label(category)}`, 'OK', 3000);
    } else {
      this.uiService.showSnackBar(`Budget for ${this.categoryService.label(category)} set!`, 'OK', 3000);
    }
  }
}
