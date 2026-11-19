import {TestBed} from '@angular/core/testing';
import {testDatabase} from '../testing/database';
import {BudgetService} from './budget.service';
describe('budget row operations',()=>{
 it('edits and deletes one budget without replacing the collection',async()=>{
  const fake=testDatabase();TestBed.configureTestingModule({providers:fake.providers});
  const service=TestBed.inject(BudgetService);
  await service.setBudget('rent',100);await service.setBudget('food',50);
  const replace=spyOn(fake.api.budgets,'replace').and.callThrough();
  await service.setBudget('rent',120);
  expect(service.getBudgets()).toEqual([{category:'rent',value:120},{category:'food',value:50}]);
  await service.setBudget('rent',0);
  expect(service.getBudgets()).toEqual([{category:'food',value:50}]);expect(replace).not.toHaveBeenCalled();
 });
});
