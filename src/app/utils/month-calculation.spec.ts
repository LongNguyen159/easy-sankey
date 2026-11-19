import { EntryType, UserDefinedLink } from '../components/models';
import { calculateMonth } from './month-calculation';

describe('month source projections', () => {
  it('derives charts without changing entries or their edit timestamps', () => {
    const entries: UserDefinedLink[] = [
      { id: 'salary', type: EntryType.Income, target: 'Salary', value: 1000 },
      { id: 'parent', type: EntryType.Expense, target: 'Home', value: 20, lastEditedAt: 123 },
      { id: 'child', type: EntryType.Expense, target: 'Rent', source: 'Home', value: 200 },
    ];
    entries.forEach(Object.freeze);
    Object.freeze(entries);
    const first = calculateMonth(entries, '2025-04', 'original timestamp', () => false);
    const second = calculateMonth(entries, '2025-04', 'original timestamp', () => false);
    expect(first).toEqual(second);
    expect(first.totalExpenses).toBe(200);
    expect(first.remainingBalance).toBe('800');
    expect(first.lastUpdated).toBe('original timestamp');
    expect(entries[1].value).toBe(20);
    expect(entries[1].lastEditedAt).toBe(123);
    expect(first.rawInput[1].value).toBe(200);
  });

  it('derives category and tax projections solely from explicit context', () => {
    const entries: UserDefinedLink[] = [
      { id: 'salary', type: EntryType.Income, target: 'Salary', value: 1000 },
      { id: 'tax', type: EntryType.Tax, target: 'Tax', value: 100 },
      { id: 'food', type: EntryType.Expense, target: 'Food', source: 'category', value: 50 },
    ];
    const result = calculateMonth(entries, '2025-04', '-', id => id === 'category');
    expect(result.totalUsableIncome).toBe(900);
    expect(result.totalExpenses).toBe(50);
    expect(result.pieData).toContain({ name: 'category', value: 50 });
    expect(result.remainingBalance).toBe('850');
  });
});
