import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrendsLineChartComponent } from './trends-line-chart.component';

describe('TrendsLineChartComponent', () => {
  let component: TrendsLineChartComponent;
  let fixture: ComponentFixture<TrendsLineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [TrendsLineChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TrendsLineChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('stacks category areas and keeps forecast shading when switching views', () => {
    const actual = {
      month: '2026-10',
      isMissing: false,
      isPrediction: false,
      surplus: 0,
      balance: 0,
      totalNetIncome: 0,
      totalExpenses: 50,
      categories: [{ name: 'Food', value: 20 }, { name: 'Rent', value: 30 }],
    };
    fixture.componentRef.setInput('chartData', [
      actual,
      { ...actual, month: '2026-11', isPrediction: true, categories: [{ name: 'Rent', value: 35 }] },
      { ...actual, month: '2026-12', isPrediction: true },
    ]);
    fixture.componentRef.setInput('showCategories', true);
    fixture.componentRef.setInput('categoryView', 'stacked-area');
    fixture.detectChanges();

    expect(component.mergeOptions.series).toEqual([
      jasmine.objectContaining({
        name: 'Rent', type: 'line', stack: 'categories', data: [30, 35, 30],
        areaStyle: jasmine.any(Object),
        markArea: jasmine.objectContaining({
          data: [[{ name: 'Forecast', xAxis: '2026-11' }, { xAxis: '2026-12' }]],
        }),
      }),
      jasmine.objectContaining({ name: 'Food', type: 'line', stack: 'categories', data: [20, 0, 20] }),
    ]);

    fixture.componentRef.setInput('categoryView', 'span-bars');
    fixture.detectChanges();

    expect(component.mergeOptions.series).toEqual([
      jasmine.objectContaining({ name: 'Monthly total', type: 'custom' }),
      jasmine.objectContaining({ name: 'Rent', type: 'bar', stack: '', markArea: jasmine.any(Object) }),
      jasmine.objectContaining({ name: 'Food', type: 'bar', stack: '' }),
    ]);
  });
});
