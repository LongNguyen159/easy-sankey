import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { FixCostInputComponent } from './fix-cost-input.component';
import { AmountSortComponent } from '../amount-sort/amount-sort.component';
import { DataService } from '../../services/data.service';
import { EntryType } from '../models';

describe('FixCostInputComponent', () => {
  let component: FixCostInputComponent;
  let fixture: ComponentFixture<FixCostInputComponent>;

  beforeEach(async () => {
    localStorage.removeItem('fixCostSort');
    await TestBed.configureTestingModule({
      imports: [FixCostInputComponent],
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage },
        DatePipe,
        provideRouter([]),
        {
          provide: DataService,
          useValue: {
            demoLinks: [],
            isDemo: () => false,
            nonAllowedNames: [],
            retrieveFixCostsLinks: () => [
              { id: 'rent', target: 'Rent', type: EntryType.Expense, value: 900 },
              { id: 'internet', target: 'Internet', type: EntryType.Expense, value: 40 },
            ],
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(FixCostInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    localStorage.removeItem('fixCostSort');
    localStorage.removeItem('fixCosts');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sorts the displayed costs while keeping the manual order available', () => {
    const handles = (): HTMLButtonElement[] =>
      fixture.debugElement.queryAll(By.css('.entry-reorder-handle')).map(item => item.nativeElement);
    const labels = () => handles().map(handle => handle.getAttribute('aria-label'));
    const sorting: AmountSortComponent = fixture.debugElement.query(By.directive(AmountSortComponent)).componentInstance;

    sorting.valueChange.emit('lowest');
    fixture.detectChanges();
    expect(labels()).toEqual(['Reorder Internet', 'Reorder Rent']);
    expect(handles().every(handle => handle.disabled)).toBeTrue();

    sorting.valueChange.emit('manual');
    fixture.detectChanges();
    expect(labels()).toEqual(['Reorder Rent', 'Reorder Internet']);
    expect(handles().every(handle => !handle.disabled)).toBeTrue();
  });
});
