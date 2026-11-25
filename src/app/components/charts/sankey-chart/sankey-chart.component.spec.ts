import { emptyMonth } from '../../../testing/fixtures';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SankeyChartComponent } from './sankey-chart.component';

describe('SankeyChartComponent', () => {
  let component: SankeyChartComponent;
  let fixture: ComponentFixture<SankeyChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [SankeyChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SankeyChartComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sankeyData', emptyMonth.sankeyData);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sizes the horizontal canvas from the busiest column in the displayed view', () => {
    fixture.componentRef.setInput('chartHeight', '300px');
    const root = { name: 'Income', value: 40 };
    const expenses = Array.from({ length: 40 }, (_, index) => ({
      name: `Expense ${index}`,
      value: 1,
    }));
    fixture.componentRef.setInput('sankeyData', {
      nodes: [root, ...expenses],
      links: expenses.map(expense => ({ source: root.name, target: expense.name, value: expense.value })),
      categoryView: {
        nodes: [root, { name: 'Total Expenses', value: 40 }],
        links: [{ source: root.name, target: 'Total Expenses', value: 40 }],
      },
    });
    fixture.detectChanges();

    const resizeContainer = fixture.nativeElement.querySelector('.sankey-resize') as HTMLElement;
    expect(getComputedStyle(resizeContainer).height).toBe('1925px');

    component.toggleEnvelopes();
    fixture.detectChanges();
    expect(getComputedStyle(resizeContainer).height).toBe('300px');

    fixture.componentRef.setInput('orientation', 'vertical');
    fixture.detectChanges();
    expect(getComputedStyle(resizeContainer).height).toBe('300px');

    const handle = fixture.nativeElement.querySelector('.sankey-resize-handle') as HTMLButtonElement;
    for (let step = 0; step < 2; step++) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      fixture.detectChanges();
    }
    expect(getComputedStyle(resizeContainer).height).toBe('240px');
  });
});
