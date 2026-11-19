import { emptyMonth } from '../../testing/fixtures';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainPageSingleMonthComponent } from './main-page-single-month.component';

describe('MainPageSingleMonthComponent', () => {
  let component: MainPageSingleMonthComponent;
  let fixture: ComponentFixture<MainPageSingleMonthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage }],
      imports: [MainPageSingleMonthComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MainPageSingleMonthComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('chartData', emptyMonth);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
