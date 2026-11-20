import { calculateMonth } from '../../utils/month-calculation';
import { NgZone, provideZonelessChangeDetection } from '@angular/core';
import { defer, of, Subject } from 'rxjs';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { testDatabase, provideTestDatabase } from '../../testing/database';
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
  edit() { this.toggleEditMode(); }
  isEditing() { return this.editMode(); }
  isBusy() { return this.bulkBusy(); }
  createEnvelope() { return this.createEnvelopeForSelection(); }
  manage() { return this.manageEnvelopes(); }
  select(id: string) { this.toggleEntrySelection(id, true); }
  selectFiltered() { this.selectAll(true); }
  selectedIds() { return [...this.selectedEntryIds]; }
  expenseCount() { return this.selectedExpenseCount; }
  assign(id: string | null) { return this.assignSelectedEnvelope(id); }
  assignEntry(id: string, index: number) { return this.assignSelectedEnvelope(id, this.linkArray.at(index)); }
  createEntryEnvelope(index: number) { return this.createEnvelopeForSelection(this.linkArray.at(index)); }
  deleteSelected() { return this.deleteSelectedEntries(); }
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
    TestBed.configureTestingModule({ providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase(),
      { provide: DataService, useValue: { demoLinks: [], nonAllowedNames: [], isDemo: () => false,
        hasDataCycle: { set: () => {} }, saveMonthDraft: save,
        selectMonth: jasmine.createSpy('selectMonth').and.resolveTo() } },
      { provide: UiService, useValue: { showSnackBar: jasmine.createSpy('showSnackBar'),
        openConfirmDialog: jasmine.createSpy('openConfirmDialog').and.returnValue(of(true)) } },
      { provide: ColorService, useValue: {} },
      { provide: LogsService, useValue: {} },
      { provide: Router, useValue: {navigate:jasmine.createSpy('navigate').and.resolveTo(true)} },
      { provide: CategoryService, useValue: {} },
      { provide: MatDialog, useValue: {open: jasmine.createSpy('open'),closeAll:jasmine.createSpy('closeAll')} },
      { provide: Clipboard, useValue: {} },
      { provide: LiveAnnouncer, useValue: { announce: jasmine.createSpy('announce') } }
    ] });
    component = TestBed.runInInjectionContext(() => new EntryListHarness(new FormBuilder()));
    component.dataMonth = '2026-11';
  });

  afterEach(async () => (await component.ngOnDestroy()));

  it('saves edits to the displayed month and lets the latest selection win during a slow save', async () => {
    component.populateInputFields({rawInput: [entry('edited')]} as SingleMonthData);
    component.hasChanges = true;
    let finishSave!: () => void;
    const saving = new Promise<void>(resolve => finishSave = resolve);
    const persist = spyOn(component, 'processMonthBeforeMonthChanges').and.returnValue(saving);
    const first = component.onMonthChanges({
      previousMonth: new Date(2026, 9, 1), currentMonth: new Date(2026, 11, 1),
    });
    await Promise.resolve();
    const latest = component.onMonthChanges({
      previousMonth: new Date(2026, 11, 1), currentMonth: new Date(2027, 0, 1),
    });
    finishSave();
    await Promise.all([first, latest]);
    expect(persist.calls.count()).toBe(1);
    expect(persist.calls.first().args[0]).toBe('2026-11');
    expect(component.dataService.selectMonth).toHaveBeenCalledOnceWith('2027-01');
  });

  it('keeps the displayed month and draft when validation blocks navigation', async () => {
    component.populateInputFields({rawInput: [entry('')]} as SingleMonthData);
    component.hasChanges = true;
    await component.onMonthChanges({
      previousMonth: new Date(2026, 10, 1), currentMonth: new Date(2026, 11, 1),
    });
    expect(component.dataService.selectMonth).not.toHaveBeenCalled();
    expect(component.dataService.selectedActiveDate).toEqual(new Date(2026, 10, 1));
    expect(component.hasChanges).toBeTrue();
    component.hasChanges = false;
  });

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
  it('assigns selected expenses in one save while retaining categories and excluding income', async () => {
    const entries = [
      {...entry('dinner'), source:'Restaurants@__system/category__'},
      {...entry('lunch'), source:'Restaurants@__system/category__'},
      {...entry('salary'), type:EntryType.Income},
    ];
    component.populateInputFields({rawInput:entries} as SingleMonthData);
    component.singleMonthData.set({envelopes:[{id:'global',name:'Revolut',budget:500,isGlobal:true}]} as SingleMonthData);
    component.edit();component.select('dinner');component.select('salary');
    expect(component.expenseCount()).toBe(1);
    await component.assign('global');
    const saved = save.calls.mostRecent().args[0] as UserDefinedLink[];
    expect(saved[0].envelopeId).toBe('global');
    expect(saved[0].source).toBe(entries[0].source);
    expect(saved[1].envelopeId).toBeNull();
    expect(saved[2].envelopeId).toBeNull();
    expect(component.selectedIds()).toEqual([]);
    expect(component.isEditing()).toBeFalse();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('limits select-all to the current search and clears selection when leaving edit mode', () => {
    component.populateInputFields({rawInput:[entry('match'),entry('hidden')]} as SingleMonthData);
    component.edit();component.filterLinks('match');component.selectFiltered();
    expect(component.selectedIds()).toEqual(['match']);
    component.edit();expect(component.selectedIds()).toEqual([]);
  });

  it('assigns only the menu entry while preserving the bulk selection and excluding income', async () => {
    component.populateInputFields({rawInput:[entry('dinner'), entry('lunch'), {...entry('salary'),type:EntryType.Income}]} as SingleMonthData);
    component.singleMonthData.set({envelopes:[{id:'global',name:'Personal',budget:500,isGlobal:true}]} as SingleMonthData);
    component.edit();component.select('lunch');
    await component.assignEntry('global', 0);
    const saved = save.calls.mostRecent().args[0] as UserDefinedLink[];
    expect(saved.map(row => row.envelopeId)).toEqual(['global', null, null]);
    expect(component.selectedIds()).toEqual(['lunch']);
    expect(component.isEditing()).toBeTrue();
    await component.assignEntry('global', 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('creates an envelope from a row menu and assigns only that entry', async () => {
    component.populateInputFields({rawInput:[entry('dinner'), entry('lunch')]} as SingleMonthData);
    const data={month:'2026-11',envelopes:[]} as unknown as SingleMonthData;
    component.singleMonthData.set(data);
    (TestBed.inject(MatDialog).open as jasmine.Spy).and.returnValue({afterClosed:()=>defer(()=>{
      component.singleMonthData.set({...data,envelopes:[{id:'created',name:'Personal',budget:500,isGlobal:true}]});
      return of({envelopeId:'created'});
    })});
    await component.createEntryEnvelope(0);
    const saved = save.calls.mostRecent().args[0] as UserDefinedLink[];
    expect(saved.map(row => row.envelopeId)).toEqual(['created', null]);
    expect(component.selectedIds()).toEqual([]);
    expect(component.isBusy()).toBeFalse();
  });

  it('bulk-deletes a parent while retaining and reparenting its unselected children', async () => {
    component.populateInputFields({rawInput:[
      {...entry('parent'),source:'Restaurants@__system/category__'},
      {...entry('child'),source:'parent'},entry('unrelated'),
    ]} as SingleMonthData);
    component.edit();component.select('parent');await component.deleteSelected();
    const saved = save.calls.mostRecent().args[0] as UserDefinedLink[];
    expect(saved.map(item=>item.id)).toEqual(['child','unrelated']);
    expect(saved[0].source).toBe('Restaurants@__system/category__');
    expect(saved[0].value).toBe(10);
    expect(component.isEditing()).toBeFalse();
  });

  for (const result of [false, undefined]) {
    it(`keeps the selected entries when bulk deletion is ${result === false ? 'cancelled' : 'dismissed'}`, async () => {
      component.populateInputFields({rawInput: [entry('dinner'), entry('lunch')]} as SingleMonthData);
      component.edit();
      component.select('dinner');
      component.select('lunch');
      const confirm = TestBed.inject(UiService).openConfirmDialog as jasmine.Spy;
      confirm.and.returnValue(of(result));

      await component.deleteSelected();

      expect(confirm.calls.mostRecent().args[0].title).toBe('Delete 2 entries?');
      expect(save).not.toHaveBeenCalled();
      expect(ids()).toEqual(['dinner', 'lunch']);
      expect(component.selectedIds()).toEqual(['dinner', 'lunch']);
      expect(component.isEditing()).toBeTrue();
      expect(component.isBusy()).toBeFalse();
    });
  }

  it('creates the first envelope and assigns selected expenses before leaving edit mode', async () => {
    component.populateInputFields({rawInput:[entry('dinner')]} as SingleMonthData);
    const data={month:'2026-11',envelopes:[]} as unknown as SingleMonthData;
    component.singleMonthData.set(data);
    (TestBed.inject(MatDialog).open as jasmine.Spy).and.returnValue({afterClosed:()=>defer(()=>{
      component.singleMonthData.set({...data,envelopes:[{id:'created',name:'Personal',budget:500,isGlobal:true}]});
      return of({envelopeId:'created'});
    })});
    component.edit();component.select('dinner');
    await component.createEnvelope();
    expect(save.calls.mostRecent().args[0][0].envelopeId).toBe('created');
    expect(component.isEditing()).toBeFalse();
    expect(component.selectedIds()).toEqual([]);
  });

  it('exits edit mode when managing envelopes or cancelling creation', async () => {
    component.populateInputFields({rawInput:[entry('dinner')]} as SingleMonthData);
    component.singleMonthData.set({month:'2026-11',envelopes:[]} as unknown as SingleMonthData);
    (TestBed.inject(MatDialog).open as jasmine.Spy).and.returnValue({afterClosed:()=>of(undefined)});
    component.edit();component.select('dinner');await component.createEnvelope();
    expect(component.isEditing()).toBeFalse();
    expect(save).not.toHaveBeenCalled();
    expect(component.isBusy()).toBeFalse();
    component.edit();component.select('dinner');await component.manage();
    expect(component.isEditing()).toBeFalse();
    expect(component.selectedIds()).toEqual([]);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/storage'],{queryParams:{tab:3}});
  });

  it('exits edit mode after removing an assignment and retains selection if saving fails', async () => {
    component.populateInputFields({rawInput:[{...entry('dinner'),envelopeId:'old'}]} as SingleMonthData);
    component.edit();component.select('dinner');await component.assign(null);
    expect(save.calls.mostRecent().args[0][0].envelopeId).toBeNull();
    expect(component.isEditing()).toBeFalse();
    component.edit();component.select('dinner');save.and.rejectWith(new Error('Save failed'));
    await component.assign(null);
    expect(component.isEditing()).toBeTrue();
    expect(component.selectedIds()).toEqual(['dinner']);
  });

});


describe('envelope dialog cancellation rendering', () => {
  it('unlocks and redraws the editor when cancellation completes outside Angular', async () => {
    const fake=testDatabase();
    fake.months.set('2026-11',{month:'2026-11',lastUpdated:'-',revision:0,entries:[
      {id:'salary',type:EntryType.Income,target:'Salary',value:1000},
      {id:'dinner',type:EntryType.Expense,target:'Dinner',value:40},
    ]});
    const closed=new Subject<undefined>();
    const open=jasmine.createSpy('open').and.returnValue({afterClosed:()=>closed});
    await TestBed.configureTestingModule({imports:[InputListComponent],providers:[
      ...fake.providers,DatePipe,provideRouter([]),provideNoopAnimations(),provideZonelessChangeDetection(),
      {provide:MatDialog,useValue:{open}},
    ]}).overrideProvider(MatDialog,{useValue:{open}}).compileComponents();
    const service=TestBed.inject(DataService);await service.ready;
    service.selectedActiveDate=new Date(2026,10,1);
    await service.selectMonth('2026-11');
    spyOn(service, 'selectMonth').and.resolveTo();
    const fixture=TestBed.createComponent(InputListComponent);
    fixture.autoDetectChanges();await fixture.whenStable();
    const month=calculateMonth(fake.months.get('2026-11')!.entries, '2026-11', '-', ()=>false);
    fixture.componentInstance.dataMonth=month.month;
    fixture.componentInstance.populateInputFields(month);
    fixture.componentInstance.singleMonthData.set(month);
    spyOn(fixture.componentInstance, 'flushPendingEdits').and.resolveTo(true);
    await fixture.whenStable();
    const editor=fixture.nativeElement as HTMLElement;
    const component=fixture.componentInstance as unknown as {createEnvelopeForSelection(row:FormGroup):Promise<void>};
    const dinner=fixture.componentInstance.linkArray.controls.find(row=>row.get('id')?.value==='dinner')!;
    const actions=()=>editor.querySelector<HTMLButtonElement>('[aria-label="Actions for Dinner"]')!;
    const creation=component.createEnvelopeForSelection(dinner);
    await fixture.whenStable();
    expect(open).toHaveBeenCalled();
    expect(actions().disabled).toBeTrue();
    TestBed.inject(NgZone).runOutsideAngular(()=>{closed.next(undefined);closed.complete();});
    await creation;
    await fixture.whenStable();
    expect(actions().disabled).toBeFalse();
    expect(dinner.get('envelopeId')?.value).toBeNull();
  });
});
