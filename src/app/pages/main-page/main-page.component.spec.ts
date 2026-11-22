import { calculateMonth } from '../../utils/month-calculation';
import { EntryType, ExpenseCategory } from '../../components/models';
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
  it('shows gauges only for budgets with spending', async () => {
    await component.dataService.ready;
    const envelopes=[{id:'revolut',name:'Revolut spending',budget:500,isGlobal:true},
      {id:'holiday',name:'Holiday',budget:200}];
    component.entriesOfOneMonth=calculateMonth([
      {id:'salary',type:EntryType.Income,target:'Salary',value:1000},
      {id:'dinner',type:EntryType.Expense,target:'Dinner',value:40,envelopeId:'revolut',source:ExpenseCategory.Restaurants},
      {id:'food',type:EntryType.Expense,target:'Supermarket',value:80,source:ExpenseCategory.Groceries},
    ],'2026-11','-',id => id === ExpenseCategory.Restaurants || id === ExpenseCategory.Groceries,envelopes);
    component.pieChartDataNetto=component.entriesOfOneMonth.pieData;
    fixture.detectChanges();
    expect(component.envelopeBudgets.map(item=>item.spent)).toEqual([40]);
    const section=fixture.nativeElement.querySelector('[aria-label="Budgets"]');
    expect(section.querySelectorAll('app-budget-gauge-chart').length).toBe(1);
    expect(section.textContent).toContain('Global budget');
    expect(fixture.nativeElement.textContent).not.toContain('No budgets set yet!');
    // Cover both direct category gauges and envelope gauges with captions.
    const grids=Array.from(fixture.nativeElement.querySelectorAll('.gauge-chart-container')) as HTMLElement[];
    expect(grids.length).toBe(1);
    for (const width of ['900px', '500px']) {
      grids.forEach(grid => grid.style.width = width);
      await new Promise(resolve => setTimeout(resolve, 250));
      const heights=grids.map(grid => grid.getBoundingClientRect().height);
      heights.forEach(height => expect(height).toBeGreaterThan(0));
      await new Promise(resolve => setTimeout(resolve, 400));
      grids.forEach((grid,index) => expect(grid.getBoundingClientRect().height).toBeCloseTo(heights[index], 0));
    }
  });

});
