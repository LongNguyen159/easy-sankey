import { calculateMonth } from '../../utils/month-calculation';
import { EntryType } from '../models';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StorageManagerComponent } from './storage-manager.component';

describe('StorageManagerComponent', () => {
  let component: StorageManagerComponent;
  let fixture: ComponentFixture<StorageManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [StorageManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StorageManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('excludes investments from expenses while retaining them in cash surplus and weighted savings', async () => {
    const project = (month: string, income: number, expense: number, investment = 0) => calculateMonth([
      { id: 'salary', target: 'Salary', type: EntryType.Income, value: income },
      { id: 'rent', target: 'Rent', type: EntryType.Expense, value: expense },
      { id: 'etf', target: 'ETF purchase', type: EntryType.Investment, value: investment, source: 'investments' },
    ], month, '-', id => id === 'investments');
    component.showPredictions.set(false);
    component.allMonthsData = {
      '2026-09': project('2026-09', 1000, 1000),
      '2026-10': project('2026-10', 3000, 1000, 300),
      '2026-11': project('2026-11', 4000, 1000),
    };
    await component.populateChartData(['2026-09', '2026-10']);
    expect(component.totalExpenses).toBe(2000);
    const october = component.trendsLineChartData().find(month => month.month === '2026-10');
    expect(october?.totalExpenses).toBe(1000);
    expect(october?.balance).toBe(1700);
    expect(october?.categories).toEqual(jasmine.arrayWithExactContents([
      { name: 'Rent', value: 1000 },
      { name: 'investments', value: 300 },
    ]));
    expect(component.periodSavings()).toEqual({
      income: 4000, investments: 300, totalSavings: 2000, savingsRate: 50,
    });
  });
});
