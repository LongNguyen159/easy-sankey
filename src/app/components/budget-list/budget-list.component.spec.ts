import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatButtonToggleGroup } from '@angular/material/button-toggle';
import { provideTestDatabase } from '../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { BudgetListComponent } from './budget-list.component';
import { AmountSortComponent } from '../amount-sort/amount-sort.component';
import { CategoryService } from '../../services/category.service';
import { BudgetDialogComponent } from '../dialogs/budget-dialog/budget-dialog.component';

describe('BudgetListComponent', () => {
  let component: BudgetListComponent;
  let fixture: ComponentFixture<BudgetListComponent>;

  beforeEach(async () => {
    localStorage.removeItem('budgetSort');
    localStorage.removeItem('budgetManualOrder');
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [BudgetListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BudgetListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('budgetSort');
    localStorage.removeItem('budgetManualOrder');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  for (const view of ['list', 'cards']) {
    for (const target of ['.budget-label', '.budget-indicator']) {
      it(`opens the budget dialog by clicking ${target} in ${view} view`, async () => {
        const toggle = fixture.debugElement.query(By.directive(MatButtonToggleGroup));
        toggle.triggerEventHandler('change', { value: view });
        fixture.detectChanges();
        await fixture.whenStable();

        const item: HTMLButtonElement = fixture.nativeElement.querySelector('.budget-item');
        const element = item.querySelector(target)!;
        element.scrollIntoView({ block: 'center' });
        const bounds = element.getBoundingClientRect();
        // Use browser hit testing so an overlapping drag-handle layer fails this test.
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        expect(hit?.closest('.budget-item')).toBe(item);
        (hit as HTMLElement)?.click();
        fixture.detectChanges();

        const dialog = TestBed.inject(MatDialog);
        expect(dialog.openDialogs.length).toBe(1);
        const instance = dialog.openDialogs[0]?.componentInstance as BudgetDialogComponent | undefined;
        expect(instance).toBeInstanceOf(BudgetDialogComponent);
        expect(instance?.data.categoryLabel).toBe(item.querySelector('.budget-label')!.textContent!.trim());
        dialog.closeAll();
        await fixture.whenStable();
      });
    }
  }

  it('sorts by amount, disables reordering, and restores the saved manual order', () => {
    const [first, second] = TestBed.inject(CategoryService).categories();
    component.budgets = [{ category: first.value, value: 10 }, { category: second.value, value: 20 }];

    const handles = (): HTMLButtonElement[] =>
      fixture.debugElement.queryAll(By.css('.budget-reorder-handle')).map(item => item.nativeElement);
    const labels = () => handles().map(handle => handle.getAttribute('aria-label'));
    const sorting: AmountSortComponent = fixture.debugElement.query(By.directive(AmountSortComponent)).componentInstance;

    handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    const manualOrder = labels();
    expect(manualOrder[0]).toBe(`Reorder ${second.label}`);

    sorting.valueChange.emit('highest');
    fixture.detectChanges();
    expect(labels().slice(0, 2)).toEqual([`Reorder ${second.label}`, `Reorder ${first.label}`]);
    expect(handles().every(handle => handle.disabled)).toBeTrue();

    sorting.valueChange.emit('lowest');
    fixture.detectChanges();
    expect(labels().slice(-2)).toEqual([`Reorder ${first.label}`, `Reorder ${second.label}`]);

    sorting.valueChange.emit('manual');
    fixture.detectChanges();
    expect(labels()).toEqual(manualOrder);
    expect(handles().every(handle => !handle.disabled)).toBeTrue();
  });
});
