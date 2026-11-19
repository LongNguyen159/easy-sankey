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
});
