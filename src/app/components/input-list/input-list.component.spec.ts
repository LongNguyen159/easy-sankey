import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../storage/app-storage';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Clipboard } from '@angular/cdk/clipboard';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { ColorService } from '../../services/color.service';
import { DataService } from '../../services/data.service';
import { LogsService } from '../../services/logs.service';
import { UiService } from '../../services/ui.service';
import { EntryType, SingleMonthData, UserDefinedLink } from '../models';
import { InputListComponent } from './input-list.component';

class EntryListHarness extends InputListComponent {
  async sortRecentlyEdited() { (await this.sortEntriesByRecentlyEdited()); }
  async drop(rows: FormGroup[], from: number, to: number) {
    (await this.dropEntries({ isPointerOverContainer: true, container: { data: rows }, previousIndex: from, currentIndex: to } as CdkDragDrop<FormGroup[]>));
  }
  rows(isFixCost?: boolean) { return this.visibleEntries(isFixCost); }
}

describe('InputListComponent manual sorting', () => {
  let component: EntryListHarness;
  let save: jasmine.Spy;
  const entry = (id: string, lastEditedAt?: number): UserDefinedLink => ({
    id, target: id, type: EntryType.Expense, value: 10, source: '', isFixCost: false, lastEditedAt
  });
  const ids = () => component.linkArray.controls.map(row => row.get('id')?.value);

  beforeEach(() => {
    save = jasmine.createSpy('processInputData');
    TestBed.configureTestingModule({ providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage },
      { provide: DataService, useValue: { demoLinks: [], nonAllowedNames: [], isDemo: () => false,
        hasDataCycle: { set: () => {} }, processInputData: save } },
      { provide: UiService, useValue: { showSnackBar: jasmine.createSpy('showSnackBar') } },
      { provide: ColorService, useValue: {} },
      { provide: LogsService, useValue: {} },
      { provide: Router, useValue: {} },
      { provide: CategoryService, useValue: {} },
      { provide: MatDialog, useValue: {} },
      { provide: Clipboard, useValue: {} },
      { provide: LiveAnnouncer, useValue: { announce: jasmine.createSpy('announce') } }
    ] });
    component = TestBed.runInInjectionContext(() => new EntryListHarness(new FormBuilder()));
    component.dataMonth = '2026-11';
  });

  afterEach(async () => (await component.ngOnDestroy()));

  it('writes a stable newest-first manual order and saves it across reopening', async () => {
    component.populateInputFields({ rawInput: [entry('undated'), entry('older', 100), entry('newest', 200), entry('tie', 200), entry('also-undated')] } as SingleMonthData);
    (await component.sortRecentlyEdited());
    expect(ids()).toEqual(['newest', 'tie', 'older', 'undated', 'also-undated']);
    expect(component.savedFormValues.map(row => row.id)).toEqual(ids());
    expect(component.hasChanges).toBeTrue();
    expect(save).toHaveBeenCalledWith(component.savedFormValues, '2026-11', { emitObservable: false });
    (await component.onSubmit());
    expect(save).toHaveBeenCalledWith(component.savedFormValues, '2026-11');
    component.populateInputFields({ rawInput: save.calls.mostRecent().args[0] } as SingleMonthData);
    expect(ids()).toEqual(['newest', 'tie', 'older', 'undated', 'also-undated']);
  });

  it('allows dragging the sorted rows without changing edit dates or sorting again on edits', async () => {
    component.populateInputFields({ rawInput: [entry('older', 100), entry('newest', 200)] } as SingleMonthData);
    (await component.sortRecentlyEdited());
    (await component.drop(component.rows(), 0, 1));
    expect(ids()).toEqual(['older', 'newest']);
    expect(save.calls.mostRecent().args[0].map((row: UserDefinedLink) => row.id)).toEqual(['older', 'newest']);
    expect(component.linkArray.at(0).get('lastEditedAt')?.value).toBe(100);
    spyOn(Date, 'now').and.returnValue(500);
    component.linkArray.at(1).get('value')?.setValue(20);
    expect(component.linkArray.at(1).get('lastEditedAt')?.value).toBe(500);
    expect(ids()).toEqual(['older', 'newest']);
  });

  it('sorts the whole month during search and keeps filtered dragging scoped to visible rows', async () => {
    const fixed = { ...entry('fixed', 250), isFixCost: true };
    component.populateInputFields({ rawInput: [entry('match-old', 100), fixed, entry('hidden', 200), entry('match-new', 300)] } as SingleMonthData);
    component.filterLinks('match');
    (await component.sortRecentlyEdited());
    expect(ids()).toEqual(['match-new', 'fixed', 'hidden', 'match-old']);
    (await component.drop(component.rows(false), 0, 1));
    expect(ids()).toEqual(['match-old', 'fixed', 'hidden', 'match-new']);
  });

  it('preserves dates on loading and tracks content edits without touching other entries', async () => {
    component.populateInputFields({ rawInput: [entry('legacy'), entry('edited', 100)] } as SingleMonthData);
    spyOn(Date, 'now').and.returnValue(500);
    const row = component.linkArray.at(0);
    expect(row.get('lastEditedAt')?.value).toBeNull();
    row.get('value')?.setValue(10);
    expect(row.get('lastEditedAt')?.value).toBeNull();
    row.get('value')?.setValue(20);
    expect(row.get('lastEditedAt')?.value).toBe(500);
    row.get('type')?.setValue(EntryType.Income);
    expect(row.get('lastEditedAt')?.value).toBe(500);
    expect(component.linkArray.at(1).get('lastEditedAt')?.value).toBe(100);
    (await component.sortRecentlyEdited());
    expect(ids()).toEqual(['legacy', 'edited']);
  });
});
