import { calculateMonth } from '../../utils/month-calculation';
import { EntryType } from '../../components/models';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainPageComponent } from './main-page.component';

describe('MainPageComponent', () => {
  let component: MainPageComponent;
  let fixture: ComponentFixture<MainPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [MainPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MainPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('shows bars for spending budgets and adds the radar chart at three', async () => {
    await component.dataService.ready;
    const envelopes = [
      {id: 'revolut', name: 'Revolut spending', budget: 500, isGlobal: true},
      {id: 'holiday', name: 'Holiday', budget: 200},
      {id: 'food', name: 'Food', budget: 0},
      {id: 'unused', name: 'Unused budget', budget: 100},
    ];
    const entries = [
      {id: 'salary', type: EntryType.Income, target: 'Salary', value: 1000},
      {id: 'dinner', type: EntryType.Expense, target: 'Dinner', value: 40, envelopeId: 'revolut'},
      {id: 'tickets', type: EntryType.Expense, target: 'Tickets', value: 210, envelopeId: 'holiday'},
      {id: 'lunch', type: EntryType.Expense, target: 'Lunch', value: 15, envelopeId: 'food'},
    ];

    for (const spendingBudgetCount of [2, 3]) {
      const month = calculateMonth(entries.slice(0, spendingBudgetCount + 1), '2026-11', '-', () => false, envelopes);
      component.entriesOfOneMonth = month;
      component.pieChartDataNetto = month.pieData;
      fixture.detectChanges();

      const section: HTMLElement = fixture.nativeElement.querySelector('[aria-label="Budgets"]');
      const bars = section.querySelectorAll<HTMLProgressElement>('progress');
      expect(bars.length).toBe(spendingBudgetCount);
      expect(bars[0].value).toBeCloseTo(0.08);
      expect(bars[1].value).toBe(1);
      expect(section.textContent).not.toContain('Unused budget');
      expect(section.querySelectorAll('app-budget-radar-chart').length).toBe(spendingBudgetCount === 3 ? 1 : 0);
      if (spendingBudgetCount === 3) {
        expect(bars[2].value).toBe(1);
      }
    }
  });
});
