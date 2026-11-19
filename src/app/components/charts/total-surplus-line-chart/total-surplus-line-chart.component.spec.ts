import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TotalSurplusLineChartComponent } from './total-surplus-line-chart.component';

describe('TotalSurplusLineChartComponent', () => {
  let component: TotalSurplusLineChartComponent;
  let fixture: ComponentFixture<TotalSurplusLineChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage }],
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
});
