import { DATABASE_CLIENT, CONFIGURATION } from '../data/database';
import { computed, Injectable, signal, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { ExpenseCategoryDetails, SYSTEM_PREFIX, UserDefinedLink } from '../components/models';
import { removeSystemPrefix } from '../utils/utils';

export const CATEGORY_COLORS = [
  { name: 'Blue', colorLight: '#1976d2', colorDark: '#90caf9' },
  { name: 'Navy', colorLight: '#172554', colorDark: '#2563eb' },
  { name: 'Sky', colorLight: '#0ea5e9', colorDark: '#38bdf8' },
  { name: 'Powder Blue', colorLight: '#93c5fd', colorDark: '#bfdbfe' },
  { name: 'Ice Blue', colorLight: '#bae6fd', colorDark: '#e0f2fe' },
  { name: 'Indigo', colorLight: '#3f51b5', colorDark: '#c5cae9' },
  { name: 'Periwinkle', colorLight: '#818cf8', colorDark: '#818cf8' },
  { name: 'Purple', colorLight: '#9c27b0', colorDark: '#e1bee7' },
  { name: 'Violet', colorLight: '#6d28d9', colorDark: '#8b5cf6' },
  { name: 'Lavender', colorLight: '#c4b5fd', colorDark: '#c4b5fd' },
  { name: 'Plum', colorLight: '#3b0764', colorDark: '#7e22ce' },
  { name: 'Magenta', colorLight: '#c026d3', colorDark: '#d946ef' },
  { name: 'Orchid', colorLight: '#e879f9', colorDark: '#e879f9' },
  { name: 'Pink', colorLight: '#c2185b', colorDark: '#f48fb1' },
  { name: 'Hot Pink', colorLight: '#ec4899', colorDark: '#ec4899' },
  { name: 'Blush', colorLight: '#fbcfe8', colorDark: '#fbcfe8' },
  { name: 'Burgundy', colorLight: '#881337', colorDark: '#be123c' },
  { name: 'Red', colorLight: '#f44336', colorDark: '#ef5350' },
  { name: 'Crimson', colorLight: '#991b1b', colorDark: '#dc2626' },
  { name: 'Coral', colorLight: '#fca5a5', colorDark: '#fca5a5' },
  { name: 'Deep Orange', colorLight: '#ff5722', colorDark: '#ffccbc' },
  { name: 'Brick', colorLight: '#7c2d12', colorDark: '#c2410c' },
  { name: 'Peach', colorLight: '#fed7aa', colorDark: '#fed7aa' },
  { name: 'Amber', colorLight: '#ff9800', colorDark: '#ffcc80' },
  { name: 'Gold', colorLight: '#a68a00', colorDark: '#f3e85c' },
  { name: 'Ochre', colorLight: '#b45309', colorDark: '#d97706' },
  { name: 'Honey', colorLight: '#fbbf24', colorDark: '#fbbf24' },
  { name: 'Brown', colorLight: '#795548', colorDark: '#bc9b80' },
  { name: 'Lime', colorLight: '#65a30d', colorDark: '#a3e635' },
  { name: 'Olive', colorLight: '#365314', colorDark: '#4d7c0f' },
  { name: 'Pale Lime', colorLight: '#bef264', colorDark: '#d9f99d' },
  { name: 'Green', colorLight: '#4caf50', colorDark: '#a5d6a7' },
  { name: 'Forest Green', colorLight: '#14532d', colorDark: '#16a34a' },
  { name: 'Emerald', colorLight: '#047857', colorDark: '#10b981' },
  { name: 'Jade', colorLight: '#064e3b', colorDark: '#047857' },
  { name: 'Mint', colorLight: '#6ee7b7', colorDark: '#6ee7b7' },
  { name: 'Teal', colorLight: '#00796b', colorDark: '#4dd0b9' },
  { name: 'Cyan', colorLight: '#0891b2', colorDark: '#67e8f9' },
  { name: 'Turquoise', colorLight: '#14b8a6', colorDark: '#14b8a6' },
  { name: 'Pale Aqua', colorLight: '#99f6e4', colorDark: '#ccfbf1' },
  { name: 'Deep Cyan', colorLight: '#164e63', colorDark: '#0e7490' },
  { name: 'Slate', colorLight: '#607d8b', colorDark: '#b0bec5' },
  { name: 'Grey', colorLight: '#9e9e9e', colorDark: '#e0e0e0' },
  { name: 'Charcoal', colorLight: '#27272a', colorDark: '#71717a' },
  { name: 'Stone', colorLight: '#78716c', colorDark: '#a8a29e' },
  { name: 'Sand', colorLight: '#d6d3d1', colorDark: '#d6d3d1' },
];

export const CATEGORY_ICON_GROUPS = [
  {
    name: 'General',
    icons: ['category', 'label', 'star', 'favorite', 'flag', 'bolt', 'more_horiz'],
  },
  {
    name: 'Home & bills',
    icons: ['home', 'chair', 'bed', 'apartment', 'build', 'electrical_services', 'water_drop', 'wifi', 'phone_iphone', 'cleaning_services', 'yard'],
  },
  {
    name: 'Food & drink',
    icons: ['grocery', 'restaurant', 'local_cafe', 'fastfood', 'local_pizza', 'bakery_dining', 'icecream', 'wine_bar', 'lunch_dining'],
  },
  {
    name: 'Transport & travel',
    icons: ['directions_car', 'train', 'directions_bus', 'directions_bike', 'local_gas_station', 'local_taxi', 'local_parking', 'flight', 'luggage', 'hotel', 'beach_access'],
  },
  {
    name: 'Health, family & pets',
    icons: ['medical_services', 'medication', 'dentistry', 'visibility', 'fitness_center', 'self_improvement', 'spa', 'child_care', 'family_restroom', 'pets'],
  },
  {
    name: 'Shopping & occasions',
    icons: ['shopping_cart', 'shopping_bag', 'checkroom', 'styler', 'redeem', 'cake', 'celebration', 'local_florist', 'local_shipping', 'volunteer_activism'],
  },
  {
    name: 'Hobbies & entertainment',
    icons: ['palette', 'movie', 'music_note', 'headphones', 'sports_esports', 'sports_soccer', 'menu_book', 'photo_camera', 'forest', 'hiking', 'theater_comedy'],
  },
  {
    name: 'Work, school & money',
    icons: ['work', 'school', 'devices', 'laptop_mac', 'savings', 'account_balance', 'credit_card', 'receipt_long', 'payments', 'trending_up', 'security'],
  },
];

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly database=inject(DATABASE_CLIENT);
  private readonly initial=inject(CONFIGURATION).categories;
  private readonly definitions = signal<ExpenseCategoryDetails[]>(this.initial.map(category=>category.icon==='card_giftcard'?{...category,icon:'redeem'}:category));
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

  async save(label: string, icon: string, color: typeof CATEGORY_COLORS[number], id?: string): Promise<ExpenseCategoryDetails> {
    const category = {
      label: label.trim(),
      value: id ?? `${uuid()}@${SYSTEM_PREFIX}`,
      icon,
      colorLight: color.colorLight,
      colorDark: color.colorDark,
    };
    if(id)await this.database.command(()=>this.database.api.categories.update({id,changes:category}));else await this.database.command(()=>this.database.api.categories.create({item:category}));
    await this.reload();
    return category;
  }

  async move(id: string, toIndex: number): Promise<boolean> {
    const categories = this.categories();
    const fromIndex = categories.findIndex(category => category.value === id);
    if (fromIndex < 0 || fromIndex === toIndex || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= categories.length) {
      return false;
    }

    const reordered = [...categories];
    const [category] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, category);
    await this.database.command(()=>this.database.api.categories.reorder({ids:reordered.map(category=>category.value)}));
    this.definitions.set(reordered);
    return true;
  }

  async remove(id: string): Promise<void> {
    await this.database.command(()=>this.database.api.categories.delete({id}));
    await this.reload();
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

  async reload(): Promise<void> {
    this.definitions.set((await this.database.api.categories.list()).items);
  }

}
