import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpenseCategory } from '../models';
import { BudgetSliderComponent } from './budget-slider.component';

describe('BudgetSliderComponent', () => {
  let component: BudgetSliderComponent;
  let fixture: ComponentFixture<BudgetSliderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [BudgetSliderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BudgetSliderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('saves planned amounts as global budgets without duplicate definitions', async () => {
    await component.dataService.ready;
    component.visibleSliders=[{name:ExpenseCategory.Groceries,value:250,locked:false,weight:1}];
    await component.saveToBudgets();
    const budget=component.dataService.globalEnvelopes()[0];
    expect(budget.name).toBe('Groceries & Essentials');
    expect(budget.isGlobal).toBeTrue();
    expect(budget.budget).toBe(250);
    component.visibleSliders[0].value=300;
    await component.saveToBudgets();
    expect(component.dataService.globalEnvelopes()).toEqual([{...budget,budget:300}]);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
