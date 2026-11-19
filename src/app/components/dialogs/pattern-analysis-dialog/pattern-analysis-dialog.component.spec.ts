import { emptyAnalysis } from '../../../testing/fixtures';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PatternAnalysisDialogComponent } from './pattern-analysis-dialog.component';

describe('PatternAnalysisDialogComponent', () => {
  let component: PatternAnalysisDialogComponent;
  let fixture: ComponentFixture<PatternAnalysisDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: emptyAnalysis }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage }],
      imports: [PatternAnalysisDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PatternAnalysisDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
