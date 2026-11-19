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
});
