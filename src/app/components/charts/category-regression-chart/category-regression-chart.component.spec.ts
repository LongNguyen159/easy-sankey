import { emptyAnalysis } from '../../../testing/fixtures';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoryRegressionChartComponent } from './category-regression-chart.component';

describe('CategoryRegressionChartComponent', () => {
  let component: CategoryRegressionChartComponent;
  let fixture: ComponentFixture<CategoryRegressionChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage }],
      imports: [CategoryRegressionChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CategoryRegressionChartComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('chartData', emptyAnalysis);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
