import { DATABASE_CLIENT, CONFIGURATION } from '../data/database';
import { computed, Injectable, signal, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { ExpenseCategoryDetails, SYSTEM_PREFIX, UserDefinedLink } from '../components/models';
import { removeSystemPrefix } from '../utils/utils';

export const CATEGORY_COLORS = [
  { name: 'Blue', colorLight: '#1976d2', colorDark: '#90caf9' },
  { name: 'Navy', colorLight: '#203f83', colorDark: '#819de0' },
  { name: 'Steel Blue', colorLight: '#47759a', colorDark: '#92b7d2' },
  { name: 'Sky Blue', colorLight: '#289dd0', colorDark: '#a9e4fd' },
  { name: 'Cyan', colorLight: '#00869c', colorDark: '#53c9df' },
  { name: 'Teal', colorLight: '#00796b', colorDark: '#80cbc4' },
  { name: 'Sea Glass', colorLight: '#2a9f99', colorDark: '#9cebd8' },
  { name: 'Forest', colorLight: '#246a46', colorDark: '#70b88a' },
  { name: 'Olive', colorLight: '#697721', colorDark: '#b9cb69' },
  { name: 'Sage', colorLight: '#7a9854', colorDark: '#aabd8d' },
  { name: 'Green', colorLight: '#4caf50', colorDark: '#a5d6a7' },
  { name: 'Mint', colorLight: '#389b75', colorDark: '#6ee7b7' },
  { name: 'Lime', colorLight: '#6b8b0f', colorDark: '#bef264' },
  { name: 'Lemon', colorLight: '#d1ad16', colorDark: '#faee82' },
  { name: 'Gold', colorLight: '#967100', colorDark: '#facc15' },
  { name: 'Amber', colorLight: '#ff9800', colorDark: '#ffcc80' },
  { name: 'Orange', colorLight: '#e65616', colorDark: '#ff9f58' },
  { name: 'Terracotta', colorLight: '#aa604a', colorDark: '#dc947f' },
  { name: 'Peach', colorLight: '#d98b59', colorDark: '#ffd2ae' },
  { name: 'Burgundy', colorLight: '#972348', colorDark: '#cd7092' },
  { name: 'Red', colorLight: '#d5273d', colorDark: '#fa6f80' },
  { name: 'Coral', colorLight: '#d45751', colorDark: '#ffaaa3' },
  { name: 'Pink', colorLight: '#c2185b', colorDark: '#f48fb1' },
  { name: 'Dusty Rose', colorLight: '#a75f75', colorDark: '#edafc2' },
  { name: 'Indigo', colorLight: '#3f51b5', colorDark: '#a5abec' },
  { name: 'Plum', colorLight: '#813584', colorDark: '#bf7cc8' },
  { name: 'Purple', colorLight: '#9c27b0', colorDark: '#d88ceb' },
  { name: 'Lavender', colorLight: '#8157cb', colorDark: '#dfc5ff' },
  { name: 'Mauve', colorLight: '#9d78ac', colorDark: '#cda1c8' },
  { name: 'Charcoal', colorLight: '#414752', colorDark: '#78808b' },
  { name: 'Slate', colorLight: '#757b86', colorDark: '#91a2ac' },
  { name: 'Grey', colorLight: '#9e9e9e', colorDark: '#e0e0e0' },
  { name: 'Taupe', colorLight: '#796555', colorDark: '#cdb7a5' },
  { name: 'Sand', colorLight: '#9a805b', colorDark: '#ebd5ac' },
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
