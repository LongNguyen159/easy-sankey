import {TestBed} from '@angular/core/testing';
import {AppStorage,PERSISTENT_STORAGE} from '../storage/app-storage';
import {TrackingService} from './tracking.service';

describe('tracking source configuration',()=>{
 it('keeps user income configuration while updating current spending only in memory',async()=>{
  const values=new Map<string,string>();
  const adapter:Storage={get length(){return values.size;},getItem:key=>values.get(key)??null,
   setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},
   clear:()=>values.clear(),key:index=>[...values.keys()][index]??null};
  TestBed.configureTestingModule({providers:[{provide:PERSISTENT_STORAGE,useValue:adapter}]});
  const storage=TestBed.inject(AppStorage);
  await storage.write('trackedCategories',{avgIncome:1500,targetSurplus:300,
   trackingCategories:[{name:'Food',targetSpending:200,currentSpending:0,percentageSpent:0}]});
  const tracking=TestBed.inject(TrackingService);
  const write=spyOn(storage,'write').and.callThrough();
  await tracking.updateMultipleCurrentSpendings([{name:'Food',totalValue:50}]);
  expect(tracking.getTrackingData()[0].currentSpending).toBe(50);
  expect(tracking.getTrackingData()[0].percentageSpent).toBe(25);
  expect(tracking.getAdditionalData().avgIncome).toBe(1500);
  expect(write).not.toHaveBeenCalled();
 });
});
