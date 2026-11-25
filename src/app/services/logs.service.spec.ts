import {TestBed} from '@angular/core/testing';
import {DatePipe} from '@angular/common';
import {testDatabase} from '../testing/database';
import { lastValueFrom, tap } from 'rxjs';
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

describe('entry history reads', () => {
  it('refetches changed history and keeps unrelated results cached', async () => {
    const database = testDatabase();
    const list = spyOn(database.api.history, 'list').and.callThrough();
    TestBed.configureTestingModule({ providers: [...database.providers, DatePipe] });
    const logs = TestBed.inject(LogsService);
    const month = '2025-04';

    await lastValueFrom(logs.getLogs(month, 'a'));
    await lastValueFrom(logs.getLogs(month, 'b'));
    await logs.setLog(month, 'a', '1+1');
    logs.commitPending(month, logs.pendingFor(month));
    list.calls.reset();

    await lastValueFrom(logs.getLogs(month, 'b'));
    await lastValueFrom(logs.getLogs(month, 'a'));
    expect(list.calls.allArgs()).toEqual([[{ month, id: 'a' }]]);
  });

  it('shows loading before an empty result and shares the request across subscribers', async () => {
    const database = testDatabase();
    const list = spyOn(database.api.history, 'list').and.callThrough();
    TestBed.configureTestingModule({ providers: [...database.providers, DatePipe] });
    const logs = TestBed.inject(LogsService);
    const statuses: string[] = [];

    const first = lastValueFrom(logs.getLogs('2025-04', 'a').pipe(
      tap(history => statuses.push(history.status)),
    ));
    const second = lastValueFrom(logs.getLogs('2025-04', 'a'));

    expect(statuses).toEqual(['loading']);
    expect(await first).toEqual({ status: 'loaded', items: [] });
    expect(await second).toEqual({ status: 'loaded', items: [] });
    expect(statuses).toEqual(['loading', 'loaded']);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
