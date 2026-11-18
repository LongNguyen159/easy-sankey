import { computed, Injectable, signal } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { ExpenseCategoryDetails, expenseCategoryDetails, SYSTEM_PREFIX, UserDefinedLink } from '../components/models';
import { removeSystemPrefix } from '../utils/utils';

export const CATEGORY_COLORS = [
  { name: 'Blue', colorLight: '#1976d2', colorDark: '#90caf9' },
  { name: 'Green', colorLight: '#4caf50', colorDark: '#a5d6a7' },
  { name: 'Amber', colorLight: '#ff9800', colorDark: '#ffcc80' },
  { name: 'Purple', colorLight: '#9c27b0', colorDark: '#e1bee7' },
  { name: 'Indigo', colorLight: '#3f51b5', colorDark: '#c5cae9' },
  { name: 'Red', colorLight: '#f44336', colorDark: '#ef5350' },
  { name: 'Orange', colorLight: '#ff5722', colorDark: '#ffccbc' },
  { name: 'Slate', colorLight: '#607d8b', colorDark: '#b0bec5' },
  { name: 'Grey', colorLight: '#9e9e9e', colorDark: '#e0e0e0' },
  { name: 'Teal', colorLight: '#00796b', colorDark: '#80cbc4' },
  { name: 'Pink', colorLight: '#c2185b', colorDark: '#f48fb1' },
];

export const CATEGORY_ICONS = [
  'category', 'home', 'grocery', 'restaurant', 'shopping_cart', 'movie', 'directions_car',
  'palette', 'school', 'fitness_center', 'savings', 'flight', 'cake', 'build', 'more_horiz',
  'pets', 'medical_services', 'local_cafe', 'train', 'card_giftcard', 'devices',
];

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly storageKey = 'expenseCategories';
  private readonly definitions = signal<ExpenseCategoryDetails[]>(this.load());
  readonly categories = this.definitions.asReadonly();

  private readonly byId = computed(() =>
    new Map(this.categories().map(category => [category.value, category]))
  );

  get(id: string): ExpenseCategoryDetails | undefined {
    return this.byId().get(id);
  }

  label(id: string): string {
    return this.get(id)?.label ?? removeSystemPrefix(id);
  }

  color(id: string, darkMode: boolean): string | undefined {
    const category = this.get(id);
    return darkMode ? category?.colorDark : category?.colorLight;
  }

  save(label: string, icon: string, color: typeof CATEGORY_COLORS[number], id?: string): void {
    const category = {
      label: label.trim(),
      value: id ?? `${uuid()}@${SYSTEM_PREFIX}`,
      icon,
      colorLight: color.colorLight,
      colorDark: color.colorDark,
    };
    const categories = this.categories();
    this.persist(id
      ? categories.map(existing => existing.value === id ? category : existing)
      : [...categories, category]);
  }

  remove(id: string): void {
    this.persist(this.categories().filter(category => category.value !== id));
  }

  /** Clear references from old copies or forms that were opened before a deletion. */
  clearMissingSources(links: UserDefinedLink[]): UserDefinedLink[] {
    return links.map(link => {
      if (link.source?.endsWith(`@${SYSTEM_PREFIX}`) && !this.get(link.source)) {
        const { source, ...uncategorized } = link;
        return uncategorized;
      }
      return link;
    });
  }

  private load(): ExpenseCategoryDetails[] {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      try {
        const categories: unknown = JSON.parse(stored);
        if (Array.isArray(categories)) return categories;
      } catch (error) {
        console.error('Could not load expense categories', error);
      }
    }
    return Object.values(expenseCategoryDetails);
  }

  private persist(categories: ExpenseCategoryDetails[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(categories));
    this.definitions.set(categories);
  }
}
