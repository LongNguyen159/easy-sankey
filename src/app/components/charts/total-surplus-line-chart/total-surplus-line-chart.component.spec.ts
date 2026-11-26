import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TotalSurplusLineChartComponent } from './total-surplus-line-chart.component';

describe('TotalSurplusLineChartComponent', () => {
  let component: TotalSurplusLineChartComponent;
  let fixture: ComponentFixture<TotalSurplusLineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [TotalSurplusLineChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TotalSurplusLineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('plots savings with gaps for missing data and forecasts', () => {
    const actual = {
      month: '2026-10', isMissing: false, isPrediction: false, surplus: -500, balance: -500,
      totalNetIncome: 2500, totalExpenses: 3000, categories: [],
      savings: { investments: 200, totalSavings: -300, savingsRate: -12 },
    };
    component.chartData = [
      actual,
      { ...actual, month: '2026-11', isMissing: true },
      { ...actual, month: '2026-12', isPrediction: true },
    ];
    component.updateChart();

    const series = component.mergeOptions.series as Array<{ name: string; data: unknown[] }>;
    expect(series.some(item => item.name === 'Savings rate')).toBeFalse();
    expect(series.find(item => item.name === 'Total savings')?.data).toEqual([[0, -300], [1, null], [2, null]]);
  });
});
