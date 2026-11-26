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
    expect(first.surplusAfterBudgets).toBeUndefined();
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

describe('monthly spending envelopes', () => {
  const category = 'restaurants';
  const envelope = {id: 'personal', name: 'Personal spending', budget: 500};
  const entries: UserDefinedLink[] = [
    {id: 'salary', type: EntryType.Income, target: 'Salary', value: 1000},
    {id: 'dinner', type: EntryType.Expense, target: 'Dinner', value: 40, source: category, envelopeId: 'personal'},
    {id: 'lunch', type: EntryType.Expense, target: 'Lunch', value: 60, source: category},
  ];
  const unusedGlobalBudget = { id: 'unused', name: 'Unused global budget', budget: 250, isGlobal: true };
  const calculate = (budget = 500) => calculateMonth(entries, '2026-11', '-', id => id === category,
    [{...envelope, budget}, unusedGlobalBudget]);

  it('uses only actual spending for surplus and category reports, regardless of the allowance', () => {
    for (const budget of [50, 500, 2000]) {
      const data = calculate(budget);
      expect(data.totalExpenses).toBe(100);
      expect(data.remainingBalance).toBe('900');
      expect(data.surplusAfterBudgets).toBe(940 - budget);
      expect(data.surplusAtBudgetLimits).toBeUndefined();
      expect(data.totalBudgetOverspending).toBeUndefined();
      expect(data.pieData).toContain({name: category, value: 100});
      const node = data.sankeyData.nodes.find(node => node.envelopeId === 'personal')!;
      expect(node.spent).toBe(40);
      expect(node.budget).toBe(budget);
      expect(node.value).toBe(budget);
      expect(data.sankeyData.nodes.some(node => node.name.includes('Budget remaining'))).toBeFalse();
    }
  });

  it('splits a category by envelope while displaying every expense exactly once', () => {
    const data = calculate();
    const nodes = data.sankeyData.nodes;
    const branches = nodes.filter(node => node.categoryId === category);
    expect(branches.map(node => node.value).sort((a,b) => a-b)).toEqual([40,60]);
    const envelopeNode = nodes.find(node => node.envelopeId)!;
    const inside = data.sankeyData.links.find(link => link.source === envelopeNode.name)!;
    expect(nodes.find(node => node.name === inside.target)?.value).toBe(40);
    expect(nodes.filter(node => node.entryName === 'Dinner').length).toBe(1);
    expect(nodes.filter(node => node.entryName === 'Lunch').length).toBe(1);
    expect(data.sankeyData.categoryView?.nodes.filter(node => node.name === category).length).toBe(1);
    expect(entries[1].value).toBe(40);
  });

  it('hides unused envelopes and shows spending above the allowance without adding synthetic expenses', () => {
    const unused = calculateMonth(entries.map(entry => entry.envelopeId === envelope.id
      ? {...entry, value: 0}
      : entry), '2026-11', '-', id => id === category, [envelope, unusedGlobalBudget]);
    expect(unused.sankeyData.nodes.find(node => node.envelopeId)).toBeUndefined();
    const nodeNames = new Set(unused.sankeyData.nodes.map(node => node.name));
    expect(unused.sankeyData.links.every(link => nodeNames.has(link.source) && nodeNames.has(link.target))).toBeTrue();
    expect(unused.remainingBalance).toBe('940');
    expect(unused.surplusAfterBudgets).toBeUndefined();
    expect(unused.surplusAtBudgetLimits).toBeUndefined();
    const overspent = calculate(20);
    expect(overspent.sankeyData.nodes.find(node => node.envelopeId)?.value).toBe(40);
    expect(overspent.sankeyData.nodes.find(node => node.envelopeId)?.budget).toBe(20);
    expect(overspent.remainingBalance).toBe('900');
    expect(overspent.surplusAfterBudgets).toBeUndefined();
    expect(overspent.surplusAtBudgetLimits).toBe(920);
    expect(overspent.totalBudgetOverspending).toBe(20);
    const exactlySpent = calculate(40);
    expect(exactlySpent.surplusAfterBudgets).toBeUndefined();
    expect(exactlySpent.surplusAtBudgetLimits).toBeUndefined();
  });

  it('preserves tax calculations and handles independent memberships within expense hierarchies', () => {
    const data = calculateMonth([
      entries[0], {id:'tax', type:EntryType.Tax, target:'Tax', value:100},
      {id:'parent', type:EntryType.Expense, target:'Meals', value:100, source:category},
      {...entries[1], source:'Meals'},
    ], '2026-11', '-', id => id === category, [envelope]);
    expect(data.totalExpenses).toBe(100);
    expect(data.totalTax).toBe(100);
    expect(data.remainingBalance).toBe('800');
    expect(data.surplusAfterBudgets).toBe(340);
    expect(data.sankeyData.nodes.find(node => node.envelopeId)?.spent).toBe(40);
    expect(data.sankeyData.nodes.filter(node => node.categoryId === category).reduce((sum,node) => sum+node.value,0)).toBe(100);
    expect(data.sankeyData.links.find(link => link.target === data.sankeyData.nodes.find(node => node.envelopeId)?.name)?.source).toBe('Usable Income');
  });
});

describe('investment and savings projections', () => {
  const investment = 'investments';
  const secondInvestment = 'stocks';
  const regular = 'regular';
  const budget = { id: 'invest', name: 'Investment target', budget: 200 };
  const isInvestment = (id: string) => [investment, secondInvestment].includes(id);
  const project = (income: number | null, expenses: number, invested: number) => {
    const entries: UserDefinedLink[] = [
      { id: 'salary', type: EntryType.Income, target: 'Salary', value: income ?? 0, source: investment },
      { id: 'rent', type: EntryType.Expense, target: 'Rent', value: expenses, source: regular },
      { id: 'etf', type: EntryType.Expense, target: 'ETF', value: invested / 2, source: investment, envelopeId: budget.id },
      { id: 'stock', type: EntryType.Expense, target: 'Stock', value: invested / 2, source: secondInvestment },
    ];
    return calculateMonth(entries.filter(entry => entry.value !== 0), '2026-11', '-',
      id => [investment, secondInvestment, regular].includes(id), [budget], isInvestment);
  };

  it('preserves cash flows and budget usage while excluding investment categories from consumption', () => {
    const month = project(2500, 1800, 300);
    expect(month.remainingBalance).toBe('400');
    expect(month.totalExpenses).toBe(2100);
    expect(month.savings).toEqual({ investments: 300, totalSavings: 700, savingsRate: 28 });
    expect(month.regularExpenseTree?.map(node => node.name)).toEqual([regular]);
    expect(month.pieData.map(node => node.name)).toContain(investment);
    expect(month.sankeyData.nodes.find(node => node.envelopeId === budget.id)?.spent).toBe(150);
    expect(month.surplusAfterBudgets).toBe(350);
  });

  const scenarios = [
    { income: 2500, expenses: 1800, invested: 0, surplus: '700', savings: 700, rate: 28 },
    { income: 2500, expenses: 1800, invested: 700, surplus: '0', savings: 700, rate: 28 },
    { income: 2500, expenses: 1800, invested: 900, surplus: '-200', savings: 700, rate: 28 },
    { income: 2500, expenses: 2800, invested: 200, surplus: '-500', savings: -300, rate: -12 },
    { income: null, expenses: 0, invested: 200, surplus: '-200', savings: 0, rate: null },
    { income: null, expenses: 0, invested: 0, surplus: '0', savings: 0, rate: null },
    { income: -100, expenses: 50, invested: 50, surplus: '-200', savings: -150, rate: null },
  ];

  for (const { income, expenses, invested, surplus, savings, rate } of scenarios) {
    it(`calculates savings for income ${income}, expenses ${expenses} and investments ${invested}`, () => {
      const month = project(income, expenses, invested);
      expect(month.remainingBalance).toBe(surplus);
      expect(month.savings).toEqual({ investments: invested, totalSavings: savings, savingsRate: rate });
    });
  }
});
