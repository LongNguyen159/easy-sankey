import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreemapChartComponent } from './treemap-chart.component';

describe('TreemapChartComponent', () => {
  let component: TreemapChartComponent;
  let fixture: ComponentFixture<TreemapChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [TreemapChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TreemapChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('restores category headers after the treemap transition finishes', async () => {
    component.toggleChartType();
    expect(component.mergeOptions.series).toEqual(jasmine.objectContaining({ type: 'sunburst' }));

    component.toggleChartType();
    expect(component.currentChartType).toBe('treemap');
    expect(component.mergeOptions.series).toEqual(jasmine.objectContaining({
      type: 'treemap',
      upperLabel: jasmine.objectContaining({ show: true, opacity: 0 }),
    }));

    component.onChartFinished();
    await Promise.resolve();
    expect(component.mergeOptions.series).toEqual(jasmine.objectContaining({
      type: 'treemap',
      upperLabel: jasmine.objectContaining({ show: true, opacity: 1 }),
    }));
  });
});
