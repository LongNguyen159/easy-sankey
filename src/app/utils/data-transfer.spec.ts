import { EntryType, ExpenseCategory, expenseCategoryDetails } from '../components/models';
import { exportMonth, readMonth } from './data-transfer';

describe('envelopes in month clipboard transfers', () => {
  it('round trips allowances and independent entry memberships', () => {
    const entries=[{id:'dinner',type:EntryType.Expense,target:'Dinner',value:40,
      source:ExpenseCategory.Restaurants,envelopeId:'personal'}];
    const envelopes=[{id:'personal',name:'Personal',budget:500}];
    const result=readMonth(exportMonth(entries,Object.values(expenseCategoryDetails),envelopes));
    expect(result.entries).toEqual(entries);
    expect(result.envelopes).toEqual(envelopes);
    expect(result.categories[0].value).toBe(ExpenseCategory.Restaurants);
  });
  it('accepts older copied months and rejects dangling envelope membership', () => {
    const entries=[{id:'dinner',type:EntryType.Expense,target:'Dinner',value:40}];
    expect(readMonth(JSON.stringify({app:'easy-sankey',version:1,type:'month',entries,categories:[]})).envelopes).toEqual([]);
    expect(()=>readMonth(exportMonth([{...entries[0],envelopeId:'missing'}],[]))).toThrowError(/Missing envelope/);
  });
});
