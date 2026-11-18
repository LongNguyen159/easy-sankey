export type AmountSort = 'manual' | 'highest' | 'lowest';

export function isAmountSort(value: unknown): value is AmountSort {
  return value === 'manual' || value === 'highest' || value === 'lowest';
}

export function readAmountSort(key: string): AmountSort {
  const value = localStorage.getItem(key);
  return isAmountSort(value) ? value : 'manual';
}

export function sortByAmount<T>(items: T[], order: AmountSort, amount: (item: T) => number): T[] {
  if (order === 'manual') return items;

  const direction = order === 'highest' ? -1 : 1;
  return [...items].sort((a, b) => direction * (amount(a) - amount(b)));
}
