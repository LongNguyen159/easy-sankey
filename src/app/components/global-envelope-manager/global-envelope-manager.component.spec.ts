import { TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { testDatabase } from '../../testing/database';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';
import { GlobalEnvelopeManagerComponent } from './global-envelope-manager.component';
import { EnvelopeDialogComponent } from '../dialogs/envelope-dialog/envelope-dialog.component';

describe('central global envelope editor', () => {
  it('saves shared allowances without creating a month and retains a failed draft', async () => {
    const fake=testDatabase();
    fake.configuration.globalEnvelopes=[{id:'shared',name:'Revolut',budget:500,isGlobal:true}];
    const open = jasmine.createSpy('open').and.returnValue({
      afterClosed: () => of({id: 'travel', name: 'Travel', budget: 200, isGlobal: true}),
    });
    TestBed.configureTestingModule({providers:[...fake.providers,DatePipe,
      {provide:MatDialog,useValue:{open}},
      {provide:UiService,useValue:{showSnackBar:()=>{}}}]});
    const editor=TestBed.runInInjectionContext(()=>new GlobalEnvelopeManagerComponent());
    await editor.ngOnInit();
    editor.rows.at(0).patchValue({name:'Revolut spending',budget:600});
    await editor.saveRow(editor.rows.at(0));
    expect(fake.configuration.globalEnvelopes[0].budget).toBe(600);
    expect(fake.months.size).toBe(0);
    expect(editor.saved()).toBeTrue();
    await editor.add();
    expect(open).toHaveBeenCalledWith(EnvelopeDialogComponent, jasmine.objectContaining({
      data: {createEnvelope: 'global-draft', envelopes: [
        {id: 'shared', name: 'Revolut spending', budget: 600, isGlobal: true},
      ]},
    }));
    expect(fake.configuration.globalEnvelopes[1]).toEqual({
      id: 'travel', name: 'Travel', budget: 200, isGlobal: true,
    });
    expect(fake.months.size).toBe(0);
    editor.rows.at(0).patchValue({budget:700});
    const globals = TestBed.inject(DataService).globalEnvelopes();
    await TestBed.inject(DataService).saveGlobalEnvelopes(globals.slice(0, 1), globals);
    TestBed.tick();
    expect(editor.rows.length).toBe(1);
    expect(editor.rows.at(0).controls.budget.value).toBe(700);

    spyOn(TestBed.inject(DataService),'saveGlobalEnvelopes').and.rejectWith(new Error('Save failed'));
    await editor.saveRow(editor.rows.at(0));
    expect(editor.error()).toContain('Could not save');
    expect(editor.rows.at(0).controls.budget.value).toBe(700);
    expect(editor.saving()).toBeFalse();
    expect(editor.rows.enabled).toBeTrue();
  });
});
