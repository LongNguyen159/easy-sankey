import {TestBed} from '@angular/core/testing';
import {DatePipe} from '@angular/common';
import {testDatabase} from '../testing/database';
import {LogsService} from './logs.service';
describe('transactional history drafts',()=>{
 it('retains edits staged after an earlier save was submitted',async()=>{
  TestBed.configureTestingModule({providers:[...testDatabase().providers,DatePipe]});
  const logs=TestBed.inject(LogsService);
  await logs.setLog('2025-04','a','1+1');const submitted=logs.pendingFor('2025-04');
  await logs.setLog('2025-04','a','2+2');await logs.setLog('2025-04','b','3+3');
  logs.commitPending('2025-04',submitted);
  expect(logs.pendingFor('2025-04')?.['a'].value).toBe('2+2');
  expect(logs.pendingFor('2025-04')?.['b'].value).toBe('3+3');
  logs.commitPending('2025-04',logs.pendingFor('2025-04'));expect(logs.pendingFor('2025-04')).toBeUndefined();
 });
});
