import {TestBed} from '@angular/core/testing';
import {DatePipe} from '@angular/common';
import {testDatabase} from '../testing/database';
import {CategoryService,CATEGORY_COLORS} from './category.service';
import {DataService} from './data.service';
import {UiService} from './ui.service';
import {EntryType,ExpenseCategory} from '../components/models';

describe('database-backed expense categories',()=>{
 let fake:ReturnType<typeof testDatabase>;let data:DataService;let categories:CategoryService;
 beforeEach(async()=>{fake=testDatabase();TestBed.configureTestingModule({providers:[...fake.providers,DatePipe,{provide:UiService,useValue:{showSnackBar:()=>{},openConfirmDialog:()=>{}}}]});categories=TestBed.inject(CategoryService);data=TestBed.inject(DataService);await data.ready;});
 const entries=()=>[{id:'income',type:EntryType.Income,target:'Salary',value:1000},{id:'expense',type:EntryType.Expense,target:'Supplies',value:80,source:ExpenseCategory.Groceries}];
 it('keeps category identities when editing and reordering',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');
  await categories.save('Supplies','build',CATEGORY_COLORS[0],ExpenseCategory.Groceries);
  await categories.move(ExpenseCategory.Groceries,0);
  expect(categories.categories()[0].value).toBe(ExpenseCategory.Groceries);
  expect((await data.loadSingleMonth('2025-04'))?.rawInput[1].source).toBe(ExpenseCategory.Groceries);
  expect(categories.get(ExpenseCategory.Groceries)?.label).toBe('Supplies');
 });
 it('recalculates active and historical months when a category is reclassified', async () => {
  await data.saveMonthDraft(entries(), '2025-04');
  await data.saveMonthDraft(entries(), '2025-05');
  await data.selectMonth('2025-05');
  let activeSavings = 0;
  const subscription = data.getSingleMonthData().subscribe(month => activeSavings = month.savings?.investments ?? 0);

  await categories.save('Investments', 'trending_up', CATEGORY_COLORS[0], ExpenseCategory.Groceries, 'INVESTMENT');
  TestBed.tick();
  expect(activeSavings).toBe(80);
  expect(data.monthlyData['2025-04'].savings?.totalSavings).toBe(1000);
  expect(data.monthlyData['2025-04'].remainingBalance).toBe('920');

  await data.importMonth('2025-06', { entries: entries(), categories: [categories.get(ExpenseCategory.Groceries)!] });
  expect(data.monthlyData['2025-06'].savings?.investments).toBe(80);
  await categories.save('Supplies', 'build', CATEGORY_COLORS[0], ExpenseCategory.Groceries, 'EXPENSE');
  TestBed.tick();
  expect(activeSavings).toBe(0);
  expect(data.monthlyData['2025-06'].savings?.totalSavings).toBe(920);
  subscription.unsubscribe();
 });
 it('removes category references without deleting entries or changing totals',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');await data.saveMonthDraft(entries(),'2025-05');data.storeCopiedLinks(entries());
  await data.removeCategory(ExpenseCategory.Groceries);
  expect(categories.get(ExpenseCategory.Groceries)).toBeUndefined();
  for(const month of ['2025-04','2025-05']){const record=await data.loadSingleMonth(month);expect(record?.rawInput[1].source).toBeUndefined();expect(record?.totalExpenses).toBe(80);}
  expect(data.retrieveCopiedLinks()?.[1].source).toBeUndefined();
 });
 it('imports only the destination month and referenced new definitions',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');
  const category={value:'tools@__system/category__',label:'Tools'};
  await data.importMonth('2025-05',{entries:[{...entries()[1],source:category.value}],categories:[category]});
  expect((await data.loadSingleMonth('2025-04'))?.rawInput).toEqual(entries());
  expect((await data.loadSingleMonth('2025-05'))?.rawInput[0].id).not.toBe('expense');
  expect(categories.get(category.value)).toEqual(category);
 });
 it('rejects an import cycle without touching saved data',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');
  const before=await data.loadSingleMonth('2025-04');
  await expectAsync(data.importMonth('2025-04',{entries:[{id:'a',target:'A',source:'B',type:EntryType.Expense,value:1},{id:'b',target:'B',source:'A',type:EntryType.Expense,value:1}],categories:[]})).toBeRejectedWithError(/cycle/);
  expect(await data.loadSingleMonth('2025-04')).toEqual(before);
 });
 it('reads and selects a month without writing and ignores stale responses',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');const save=spyOn(fake.api.months,'save').and.callThrough();
  await data.selectMonth('2025-04');await data.selectMonth('2025-05');expect(save).not.toHaveBeenCalled();
 });
 it('preserves the committed view and draft when a save fails',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');const before=structuredClone(data.monthlyData['2025-04']);
  spyOn(fake.api.months,'save').and.rejectWith(new Error('Disk full'));
  const changed=entries();changed[1].value=120;
  await expectAsync(data.saveMonthDraft(changed,'2025-04')).toBeRejectedWithError('Disk full');
  expect(data.monthlyData['2025-04']).toEqual(before!);
  let active:any;const subscription=data.getSingleMonthData().subscribe(value=>active=value);
  await data.selectMonth('2025-04');expect(active.rawInput[1].value).toBe(120);subscription.unsubscribe();
 });
 it('does not persist demo entries or an empty selected month',async()=>{
  const save=spyOn(fake.api.months,'save').and.callThrough();
  await data.saveMonthDraft(data.demoLinks,'2025-04',{demo:true});await data.selectMonth('2025-05');
  expect(save).not.toHaveBeenCalled();expect(fake.months.size).toBe(0);
 });
 it('removes the persisted month when the final form entry is deleted',async()=>{
  await data.saveMonthDraft(entries(),'2025-04');await data.saveMonthDraft([],'2025-04');
  expect(await data.loadSingleMonth('2025-04')).toBeNull();
 });
 it('ignores a slow response for a previously selected month',async()=>{
  let resolveFirst!:(value:any)=>void;
  spyOn(fake.api.months,'get').and.callFake(month=>month==='2025-04'?new Promise(resolve=>resolveFirst=resolve):Promise.resolve(null));
  let active:any;const subscription=data.getSingleMonthData().subscribe(value=>active=value);
  const first=data.selectMonth('2025-04');await data.selectMonth('2025-05');
  resolveFirst({month:'2025-04',lastUpdated:'-',entries:entries(),revision:1});await first;
  expect(active.month).toBe('2025-05');subscription.unsubscribe();
 });
 it('waits for editor saves and blocks navigation after a failed flush',async()=>{
  const remove=data.registerEditor(async()=>false);expect(await data.flushEdits()).toBeFalse();
  remove();expect(await data.flushEdits()).toBeTrue();
 });

});
