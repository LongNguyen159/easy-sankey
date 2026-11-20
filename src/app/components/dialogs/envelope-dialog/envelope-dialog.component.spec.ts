import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../../testing/database';
import { emptyMonth } from '../../../testing/fixtures';
import { DataService } from '../../../services/data.service';
import { EnvelopeDialogComponent } from './envelope-dialog.component';

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
    expect(fixture.nativeElement.textContent).toContain('Monthly allowance');
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
    expect(save.calls.mostRecent().args[2][0].id).toBe(id);
    expect(close).toHaveBeenCalledWith({envelopeId:id});
  });

  it('keeps shared definitions out of month-only editing', async () => {
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
    const editor=TestBed.createComponent(EnvelopeDialogComponent).componentInstance;
    expect(editor.rows.length).toBe(1);
    expect(editor.rows.at(0).controls.id.value).toBe('local');
    await editor.save();
    expect(save.calls.mostRecent().args[2]).toBeUndefined();
  });

});
