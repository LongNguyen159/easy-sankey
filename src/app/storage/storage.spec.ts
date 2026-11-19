import {TestBed} from '@angular/core/testing';
import {testDatabase} from '../testing/database';
import {SettingsRepository} from './repositories';
import {MonthRepository} from './month.repository';
import {SessionStore,SESSION_STORAGE} from './session-store';

describe('asynchronous database repositories',()=>{
 let fake:ReturnType<typeof testDatabase>;
 beforeEach(()=>{fake=testDatabase();TestBed.configureTestingModule({providers:fake.providers});});
 it('queries and saves only the requested month',async()=>{
  const repository=TestBed.inject(MonthRepository);
  const first={month:'2025-04',lastUpdated:'-',entries:[]};
  await repository.save(first);await repository.save({...first,month:'2025-05'});
  await repository.delete('2025-04');
  expect(await repository.get('2025-04')).toBeNull();
  expect((await repository.list()).map(item=>item.month)).toEqual(['2025-05']);
 });
 it('publishes settings only after persistence succeeds',async()=>{
  const settings=TestBed.inject(SettingsRepository);
  await settings.write('selectedCurrency','EUR');
  spyOn(fake.api.settings,'set').and.rejectWith(new Error('Disk full'));
  await expectAsync(settings.write('selectedCurrency','USD')).toBeRejectedWithError('Disk full');
  expect(settings.read('selectedCurrency')).toBe('EUR');
 });
 it('does not advance a committed month after a failed save',async()=>{
  const repository=TestBed.inject(MonthRepository);
  await repository.save({month:'2025-04',lastUpdated:'-',entries:[]});
  spyOn(fake.api.months,'save').and.rejectWith(new Error('Disk full'));
  await expectAsync(repository.save({month:'2025-04',lastUpdated:'2025-04-02',entries:[]})).toBeRejected();
  expect((await repository.get('2025-04'))?.lastUpdated).toBe('-');
 });
 it('keeps session state separate',()=>{
  TestBed.overrideProvider(SESSION_STORAGE,{useValue:sessionStorage});
  const session=TestBed.inject(SessionStore);session.write('isFormatBigNumbers',false);
  expect(session.read('isFormatBigNumbers')).toBeFalse();session.clear();
  expect(fake.configuration.settings.firstTime).toBe('false');
 });
});
