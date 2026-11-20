import { TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { testDatabase } from '../../testing/database';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';
import { GlobalEnvelopeManagerComponent } from './global-envelope-manager.component';

describe('central global envelope editor', () => {
  it('saves shared allowances without creating a month and retains a failed draft', async () => {
    const fake=testDatabase();
    fake.configuration.globalEnvelopes=[{id:'shared',name:'Revolut',budget:500,isGlobal:true}];
    TestBed.configureTestingModule({providers:[...fake.providers,DatePipe,
      {provide:UiService,useValue:{showSnackBar:()=>{}}}]});
    const editor=TestBed.runInInjectionContext(()=>new GlobalEnvelopeManagerComponent());
    await editor.ngOnInit();
    editor.rows.at(0).patchValue({name:'Revolut spending',budget:600});
    await editor.save();
    expect(fake.configuration.globalEnvelopes[0].budget).toBe(600);
    expect(fake.months.size).toBe(0);
    expect(editor.saved()).toBeTrue();
    editor.rows.at(0).patchValue({budget:700});
    spyOn(TestBed.inject(DataService),'saveGlobalEnvelopes').and.rejectWith(new Error('Save failed'));
    await editor.save();
    expect(editor.error()).toContain('Could not save');
    expect(editor.rows.at(0).controls.budget.value).toBe(700);
    expect(editor.saving()).toBeFalse();
    expect(editor.rows.enabled).toBeTrue();
  });
});
