import {TestBed} from '@angular/core/testing';
import {testDatabase} from '../testing/database';
import {TrackingService} from './tracking.service';

describe('tracking source configuration',()=>{
 it('keeps income configuration and derives spending without saving',async()=>{
  const fake=testDatabase();TestBed.configureTestingModule({providers:fake.providers});
  const tracking=TestBed.inject(TrackingService);
  await tracking.saveTrackingData([{name:'Food',targetSpending:200,currentSpending:0,percentageSpent:0}],300,1500);
  const save=spyOn(fake.api.tracking,'replace').and.callThrough();
  await tracking.updateMultipleCurrentSpendings([{name:'Food',totalValue:50}]);
  expect(tracking.getTrackingData()[0].currentSpending).toBe(50);expect(tracking.getTrackingData()[0].percentageSpent).toBe(25);
  expect(tracking.getAdditionalData().avgIncome).toBe(1500);expect(save).not.toHaveBeenCalled();
 });
});
