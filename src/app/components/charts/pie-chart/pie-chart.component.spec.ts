import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PieChartComponent } from './pie-chart.component';

describe('PieChartComponent', () => {
  let component: PieChartComponent;
  let fixture: ComponentFixture<PieChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [PieChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PieChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses regular expenses as the denominator in pie and stacked bar views', () => {
    component.pieChartData = [
      { name: 'Rent', value: 600 }, { name: 'Groceries', value: 400 },
      { name: 'ETF', value: 300 }, { name: 'Surplus', value: 700 },
    ];
    component.regularExpenseTree = [
      { name: 'Groceries', value: 400, children: [{ name: 'Food shop', value: 400, children: [] }] },
      { name: 'Rent', value: 600, children: [] },
    ];

    component.setExpenseDistribution(true);
    expect(component.regularExpenses).toBe(1000);
    expect(component.barLegend.map(item => item.name)).toEqual(['Rent', 'Groceries']);
    component.setChartView('stacked');
    component.toggleBar('Rent');
    expect(component.visibleBarCount).toBe(1);
    component.setExpenseDistribution(false);
    expect(component.barLegend.map(item => item.name)).toContain('ETF');
  });
});
