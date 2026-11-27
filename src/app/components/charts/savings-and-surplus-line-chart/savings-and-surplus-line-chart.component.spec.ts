import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SavingsAndSurplusLineChartComponent } from './savings-and-surplus-line-chart.component';

describe('SavingsAndSurplusLineChartComponent', () => {
  let component: SavingsAndSurplusLineChartComponent;
  let fixture: ComponentFixture<SavingsAndSurplusLineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [SavingsAndSurplusLineChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SavingsAndSurplusLineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('plots a separate savings forecast under the same legend item as actual savings', () => {
    const actual = {
      month: '2026-10', isMissing: false, isPrediction: false, surplus: -500, balance: -500,
      totalNetIncome: 2500, totalExpenses: 3000, categories: [],
      savings: { investments: 200, totalSavings: -300, savingsRate: -12 },
    };
    component.chartData = [
      actual,
      { ...actual, month: '2026-11', isMissing: true },
      {
        ...actual, month: '2026-12', isPrediction: true,
        savings: { investments: 200, totalSavings: 400, savingsRate: 16 },
      },
    ];
    component.updateChart();

    const series = component.mergeOptions.series as Array<{ id: string; name: string; data: unknown[] }>;
    expect(series.some(item => item.name === 'Savings rate')).toBeFalse();
    expect(series.find(item => item.id === 'monthly-savings')?.data).toEqual([[0, -300], [1, null], [2, null]]);
    expect(series.find(item => item.id === 'forecast-monthly-savings')).toEqual(jasmine.objectContaining({
      name: 'Monthly savings',
      data: [[0, -300], [2, 400]],
      lineStyle: jasmine.objectContaining({ type: 'dashed' }),
    }));
  });
});
