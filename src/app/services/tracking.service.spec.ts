import {TestBed} from '@angular/core/testing';
import {testDatabase} from '../testing/database';
import {TrackingService} from './tracking.service';
import {TrackingRepository} from '../storage/repositories';
describe('tracking source configuration',()=>{
 it('keeps income configuration and derives spending without saving',async()=>{
  const fake=testDatabase();TestBed.configureTestingModule({providers:fake.providers});
  const repository=TestBed.inject(TrackingRepository);
  await repository.saveConfiguration([{name:'Food',targetSpending:200}],{avgIncome:1500,targetSurplus:300});
  const tracking=TestBed.inject(TrackingService);const save=spyOn(repository,'saveConfiguration').and.callThrough();
  await tracking.updateMultipleCurrentSpendings([{name:'Food',totalValue:50}]);
  expect(tracking.getTrackingData()[0].currentSpending).toBe(50);expect(tracking.getTrackingData()[0].percentageSpent).toBe(25);
  expect(tracking.getAdditionalData().avgIncome).toBe(1500);expect(save).not.toHaveBeenCalled();
 });
});
