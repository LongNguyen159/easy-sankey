import { provideZonelessChangeDetection } from '@angular/core';
import { Subject } from 'rxjs';
import { UiService } from '../../../services/ui.service';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { emptyMonth } from '../../../testing/fixtures';
import { DataService } from '../../../services/data.service';
import { EnvelopeDialogComponent } from './envelope-dialog.component';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';

describe('monthly envelope editor', () => {
  it('saves allowances, rejects duplicate names, and retains a failed draft for retry', async () => {
    const save = jasmine.createSpy('saveEnvelopes').and.rejectWith(new Error('Save failed'));
    const close = jasmine.createSpy('close');
    await TestBed.configureTestingModule({imports:[EnvelopeDialogComponent], providers:[
      provideNoopAnimations(), ...provideTestDatabase(),
      {provide:DataService,useValue:{saveEnvelopes:save}},
      {provide:MAT_DIALOG_DATA,useValue:{...emptyMonth,month:'2026-11',envelopes:[]}},
      {provide:MatDialogRef,useValue:{close,disableClose:false}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(EnvelopeDialogComponent);
    const editor=fixture.componentInstance;
    editor.add(); editor.rows.at(0).patchValue({name:'Personal',budget:500});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Budgets for November 2026');
    expect(fixture.nativeElement.querySelector('mat-slide-toggle')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Amount');
    await editor.save();
    expect(editor.error).toContain('Could not save');
    expect(editor.rows.getRawValue()[0].budget).toBe(500);
    expect(close).not.toHaveBeenCalled();
    editor.add(); editor.rows.at(1).patchValue({name:' personal ',budget:100});
    await editor.save();
    expect(editor.error).toContain('different name');
    expect(save).toHaveBeenCalledTimes(1);
    editor.rows.removeAt(1); save.and.resolveTo();
    await editor.save();
    expect(close).toHaveBeenCalledWith(true);
  });
  it('opens first-envelope creation with a draft and returns its saved ID for assignment', async () => {
    const save=jasmine.createSpy('saveEnvelopes').and.resolveTo();
    const close=jasmine.createSpy('close');
    await TestBed.configureTestingModule({imports:[EnvelopeDialogComponent],providers:[
      provideNoopAnimations(),...provideTestDatabase(),
      {provide:DataService,useValue:{saveEnvelopes:save}},
      {provide:MAT_DIALOG_DATA,useValue:{...emptyMonth,month:'2026-11',envelopes:[],createEnvelope:true}},
      {provide:MatDialogRef,useValue:{close,disableClose:false}},
    ]}).compileComponents();
    const editor=TestBed.createComponent(EnvelopeDialogComponent).componentInstance;
    expect(editor.rows.length).toBe(1);
    editor.rows.at(0).patchValue({name:'Revolut spending',budget:500});
    const id=editor.rows.at(0).controls.id.value;
    await editor.save();
    expect(save.calls.mostRecent().args[1][0].id).toBe(id);
    expect(save.calls.mostRecent().args.length).toBe(4);
    expect(save.calls.mostRecent().args[1][0].isGlobal).toBeUndefined();
    expect(close).toHaveBeenCalledWith({envelopeId:id});
  });

  it('shows local and global sections and saves both scopes together', async () => {
    const save=jasmine.createSpy('saveEnvelopes').and.resolveTo();
    await TestBed.configureTestingModule({imports:[EnvelopeDialogComponent],providers:[
      provideNoopAnimations(),...provideTestDatabase(),
      {provide:DataService,useValue:{saveEnvelopes:save}},
      {provide:MAT_DIALOG_DATA,useValue:{...emptyMonth,month:'2026-11',envelopes:[
        {id:'global',name:'Revolut',budget:500,isGlobal:true},
        {id:'local',name:'Holiday',budget:100},
      ]}},
      {provide:MatDialogRef,useValue:{close:()=>{}}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(EnvelopeDialogComponent);
    const editor=fixture.componentInstance;
    fixture.detectChanges();
    expect(editor.rows.length).toBe(2);
    const local=fixture.nativeElement.querySelector('[aria-label="This month only (Local)"]');
    const global=fixture.nativeElement.querySelector('[aria-label="For every month (Global)"]');
    expect(local.querySelector('input[formControlName="name"]').value).toBe('Holiday');
    expect(global.querySelector('input[formControlName="name"]').value).toBe('Revolut');
    editor.rows.at(0).patchValue({budget:600});
    editor.rows.at(1).patchValue({budget:120});
    await editor.save();
    expect(save.calls.mostRecent().args[1]).toEqual([{id:'local',name:'Holiday',budget:120}]);
    expect(save.calls.mostRecent().args[2]).toEqual([{id:'global',name:'Revolut',budget:600,isGlobal:true}]);
    expect(save.calls.mostRecent().args[3]).toEqual([{id:'global',name:'Revolut',budget:500,isGlobal:true}]);
  });

  it('refreshes the budget rows when the confirmation closes asynchronously', async () => {
    const confirmation = new Subject<boolean>();
    const deleteLocalEnvelope = jasmine.createSpy('deleteLocalEnvelope').and.resolveTo();
    await TestBed.configureTestingModule({imports: [EnvelopeDialogComponent], providers: [
      provideNoopAnimations(), provideZonelessChangeDetection(),
      {provide: DataService, useValue: {deleteLocalEnvelope}},
      {provide: UiService, useValue: {openConfirmDialog: () => confirmation}},
      {provide: MAT_DIALOG_DATA, useValue: {...emptyMonth, month: '2026-11', envelopes: [
        {id: 'local', name: 'Holiday', budget: 100},
      ]}},
      {provide: MatDialogRef, useValue: {}},
    ]}).compileComponents();

    const fixture = TestBed.createComponent(EnvelopeDialogComponent);
    fixture.autoDetectChanges();
    const deleteButton = () => fixture.nativeElement.querySelector('button[aria-label="Delete Holiday"]');
    deleteButton().click();
    await fixture.whenStable();
    expect(deleteButton()).not.toBeNull();

    confirmation.next(true);
    confirmation.complete();
    await fixture.whenStable();
    expect(deleteLocalEnvelope).toHaveBeenCalledOnceWith('2026-11', 'local');
    expect(deleteButton()).toBeNull();
  });

  it('creates a global budget from the month dialog while retaining existing budgets', async () => {
    const save=jasmine.createSpy('saveEnvelopes').and.resolveTo();
    const close=jasmine.createSpy('close');
    const globals=[{id:'global',name:'Food',budget:500,isGlobal:true}];
    const locals=[{id:'local',name:'Holiday',budget:100}];
    await TestBed.configureTestingModule({imports:[EnvelopeDialogComponent],providers:[
      provideNoopAnimations(),...provideTestDatabase(),
      {provide:DataService,useValue:{saveEnvelopes:save}},
      {provide:MAT_DIALOG_DATA,useValue:{...emptyMonth,month:'2026-11',envelopes:[...globals,...locals],createEnvelope:true}},
      {provide:MatDialogRef,useValue:{close,disableClose:false}},
    ]}).compileComponents();
    const fixture=TestBed.createComponent(EnvelopeDialogComponent);
    const editor=fixture.componentInstance;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('mat-select').length).toBe(1);
    const scope=await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    expect(await scope.getValueText()).toBe('This month only');
    await scope.open();
    const choices=await scope.getOptions({text:'For every month'});
    await choices[0].click();
    const draft=editor.rows.at(2);
    expect(draft.controls.isGlobal.value).toBeTrue();
    draft.patchValue({name:'Travel',budget:200});
    await editor.save();
    expect(save.calls.mostRecent().args[1]).toEqual(locals);
    expect(save.calls.mostRecent().args[2]).toEqual([...globals,{id:draft.controls.id.value,name:'Travel',budget:200,isGlobal:true}]);
    expect(save.calls.mostRecent().args[3]).toEqual(globals);
    expect(close).toHaveBeenCalledWith({envelopeId:draft.controls.id.value});
  });

});
