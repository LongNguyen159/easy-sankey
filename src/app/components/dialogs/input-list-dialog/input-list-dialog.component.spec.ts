import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { testDatabase } from '../../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { DataService } from '../../../services/data.service';
import { EntryType } from '../../models';

import { InputListDialogComponent } from './input-list-dialog.component';

describe('InputListDialogComponent', () => {
  let component: InputListDialogComponent;
  let fixture: ComponentFixture<InputListDialogComponent>;
  let fake: ReturnType<typeof testDatabase>;

  beforeEach(async () => {
    fake = testDatabase();
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...fake.providers],
      imports: [InputListDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputListDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the title and entry rows after asynchronous data arrives without another click', async () => {
    const data = TestBed.inject(DataService);
    await data.ready;
    fixture.autoDetectChanges();
    await fixture.whenStable();
    for (const [month, name, amount] of [
      ['2026-03', 'March salary', 1000],
      ['2026-04', 'April salary', 2000],
    ] as const) {
      fake.months.set(month, {
        month, lastUpdated: `${month}-01T00:00:00.000Z`, revision: 1,
        entries: [{id: month, type: EntryType.Income, target: name, value: amount}],
      });
    }
    for (const [month, title, name, amount] of [
      ['2026-03', 'Mar 2026', 'March salary', '1000'],
      ['2026-04', 'Apr 2026', 'April salary', '2000'],
    ]) {
      // Match an Electron response outside Angular; do not click or force detection.
      await TestBed.inject(NgZone).runOutsideAngular(async () => {
        await Promise.resolve();
        await data.selectMonth(month);
      });
      await fixture.whenStable();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('[mat-dialog-title]')?.textContent).toContain(title);
      const names = Array.from(element.querySelectorAll<HTMLInputElement>('input[formControlName="target"]'));
      const amounts = Array.from(element.querySelectorAll<HTMLInputElement>('input[formControlName="value"]'));
      expect(names.map(input => input.value)).toEqual([name]);
      expect(amounts.map(input => input.value)).toEqual([amount]);
    }
  });
});
