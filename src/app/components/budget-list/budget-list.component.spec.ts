import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { BudgetListComponent } from './budget-list.component';
import { AmountSortComponent } from '../amount-sort/amount-sort.component';
import { CategoryService } from '../../services/category.service';

describe('BudgetListComponent', () => {
  let component: BudgetListComponent;
  let fixture: ComponentFixture<BudgetListComponent>;

  beforeEach(async () => {
    localStorage.removeItem('budgetSort');
    localStorage.removeItem('budgetManualOrder');
    await TestBed.configureTestingModule({
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
