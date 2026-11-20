import {TestBed} from '@angular/core/testing';
import {testDatabase} from '../testing/database';
import {SettingsService} from './settings.service';
describe('preference persistence',()=>{
 it('publishes settings only after a successful database write',async()=>{
  const fake=testDatabase();TestBed.configureTestingModule({providers:fake.providers});
  const service=TestBed.inject(SettingsService);await service.write('selectedCurrency','EUR');
  spyOn(fake.api.settings,'set').and.rejectWith(new Error('Disk full'));
  await expectAsync(service.write('selectedCurrency','USD')).toBeRejected();expect(service.read('selectedCurrency')).toBe('EUR');
 });
});
