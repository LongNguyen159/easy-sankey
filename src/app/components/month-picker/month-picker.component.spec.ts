import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonthPickerComponent } from './month-picker.component';

describe('MonthPickerComponent', () => {
  let component: MonthPickerComponent;
  let fixture: ComponentFixture<MonthPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [MonthPickerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MonthPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('reports the immediately preceding month on consecutive selections', () => {
    const emit = spyOn(component.monthSelected, 'emit');
    component.selectedDate.set(new Date(2026, 0, 1));
    component.nextMonth();
    component.nextMonth();
    expect(emit.calls.mostRecent().args[0]).toEqual({
      previousMonth: new Date(2026, 1, 1), currentMonth: new Date(2026, 2, 1),
    });
  });

  it('moves exactly one month from the end of a long month', () => {
    component.selectedDate.set(new Date(2026, 0, 31));
    component.nextMonth();
    expect(component.selectedDate()).toEqual(new Date(2026, 1, 1));
    component.previousMonth();
    expect(component.selectedDate()).toEqual(new Date(2026, 0, 1));
  });
});
