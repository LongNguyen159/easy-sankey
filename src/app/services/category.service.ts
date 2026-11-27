import { DATABASE_CLIENT, CONFIGURATION } from '../data/database';
import { computed, Injectable, signal, inject } from '@angular/core';
import { v4 as uuid } from 'uuid';
import { ExpenseCategoryDetails, SYSTEM_PREFIX, UserDefinedLink } from '../components/models';
import { removeSystemPrefix } from '../utils/utils';

// cspell:words audiotrack fastfood giftcard horiz icecream kabaddi motorsports videocam videogame

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
    name: 'Food & drink',
    icons: [
      'grocery', 'shopping_basket', 'restaurant', 'restaurant_menu', 'lunch_dining', 'fastfood',
      'local_pizza', 'ramen_dining', 'dinner_dining', 'takeout_dining', 'bakery_dining',
      'breakfast_dining', 'egg', 'rice_bowl', 'soup_kitchen', 'set_meal', 'kebab_dining',
      'local_cafe', 'emoji_food_beverage', 'icecream', 'cookie', 'nutrition',
      'local_bar', 'wine_bar', 'liquor', 'sports_bar', 'local_drink',
      'delivery_dining', 'flatware',
    ],
  },
  {
    name: 'Home & utilities',
    icons: [
      'home', 'apartment', 'real_estate_agent', 'key', 'chair', 'weekend',
      'bed', 'table_restaurant', 'light', 'electrical_services', 'bolt', 'water_drop',
      'local_fire_department', 'thermostat', 'ac_unit', 'wifi', 'router', 'cleaning_services',
      'local_laundry_service', 'vacuum', 'dry_cleaning', 'build', 'handyman', 'plumbing',
      'format_paint', 'home_repair_service', 'yard', 'grass',
      'garage_home',
    ],
  },
  {
    name: 'Transport',
    icons: [
      'directions_car', 'electric_car', 'car_rental', 'car_repair', 'local_car_wash', 'local_gas_station',
      'ev_station', 'local_parking', 'toll', 'local_taxi', 'directions_bus', 'train',
      'subway', 'tram', 'directions_railway', 'directions_bike', 'pedal_bike', 'electric_scooter',
      'two_wheeler', 'commute', 'directions_boat', 'airport_shuttle', 'confirmation_number',
      'moped', 'tire_repair', 'car_tag',
    ],
  },
  {
    name: 'Travel & places',
    icons: [
      'flight', 'luggage', 'hotel', 'cabin', 'camping',
      'rv_hookup', 'beach_access', 'pool', 'map', 'public', 'attractions',
      'museum', 'park', 'castle', 'festival', 'tour',
      'travel_explore', 'nature_people', 'landscape',
      'flight_takeoff', 'airline_seat_recline_extra', 'church', 'mosque', 'synagogue', 'temple_buddhist',
    ],
  },
  {
    name: 'Shopping',
    icons: [
      'shopping_cart', 'shopping_bag', 'storefront', 'store', 'local_mall', 'checkroom',
      'styler', 'apparel', 'laundry', 'eyeglasses', 'watch',
      'local_shipping', 'package',
      'inventory_2', 'construction', 'hardware',
      'backpack', 'local_convenience_store', 'point_of_sale',
    ],
  },
  {
    name: 'Gifts & special occasions',
    icons: [
      'featured_seasonal_and_gifts', 'redeem', 'cake', 'celebration', 'party_mode', 'local_florist',
      'diamond', 'favorite_border', 'mail', 'event_available', 'award_star',
    ],
  },
  {
    name: 'Health & personal care',
    icons: [
      'medical_services', 'local_hospital', 'medication', 'medication_liquid', 'dentistry', 'visibility',
      'hearing', 'stethoscope', 'vaccines', 'psychology', 'emergency', 'health_and_safety',
      'healing', 'spa', 'self_care', 'content_cut', 'face', 'bathtub',
      'accessibility_new', 'physical_therapy', 'pill', 'cardiology', 'outpatient', 'sauna',
    ],
  },
  {
    name: 'Family & pets',
    icons: [
      'child_care', 'family_restroom', 'stroller', 'crib', 'toys', 'smart_toy',
      'baby_changing_station', 'pets', 'pet_supplies', 'food_bank',
      'cruelty_free', 'groups', 'elderly',
    ],
  },
  {
    name: 'Sports & outdoors',
    icons: [
      'fitness_center', 'exercise', 'self_improvement', 'directions_run', 'hiking', 'forest',
      'kayaking', 'rowing', 'surfing', 'sailing', 'scuba_diving',
      'downhill_skiing', 'snowboarding', 'ice_skating', 'skateboarding', 'sports_soccer', 'sports_basketball',
      'sports_tennis', 'sports_volleyball', 'sports_golf', 'sports_baseball', 'sports_cricket', 'sports_hockey',
      'sports_martial_arts', 'sports_gymnastics', 'sports_motorsports', 'sports',
      'sports_handball', 'sports_rugby', 'sports_kabaddi', 'roller_skating', 'golf_course',
      'sports_football', 'sports_mma', 'nordic_walking', 'directions_walk', 'paragliding',
      'kitesurfing', 'snowshoeing', 'sledding', 'terrain', 'explore',
    ],
  },
  {
    name: 'Arts, crafts & photography',
    icons: [
      'palette', 'brush', 'draw', 'architecture', 'ink_pen', 'stylus',
      'format_color_fill', 'gesture', 'draw_abstract', 'colorize', 'texture',
      'photo_camera', 'camera_alt', 'camera_roll', 'photo_library', 'photo_prints', 'filter_frames',
      'videocam', 'precision_manufacturing',
    ],
  },
  {
    name: 'Music & performing arts',
    icons: [
      'music_note', 'music_note_add', 'piano', 'mic', 'mic_external_on', 'headphones',
      'speaker', 'graphic_eq', 'album', 'queue_music', 'library_music', 'music_video',
      'radio', 'equalizer', 'theater_comedy', 'masks',
    ],
  },
  {
    name: 'Games, books & entertainment',
    icons: [
      'sports_esports', 'videogame_asset', 'casino', 'extension', 'chess', 'chess_pawn',
      'playing_cards', 'crossword', 'strategy', 'joystick', 'stadia_controller', 'emoji_events',
      'comic_bubble', 'menu_book', 'book', 'library_books', 'auto_stories', 'book_2',
      'edit_note', 'collections_bookmark', 'movie', 'theaters', 'live_tv',
    ],
  },
  {
    name: 'Cooking, gardening & science hobbies',
    icons: [
      'skillet', 'kitchen', 'outdoor_grill', 'blender', 'fireplace',
      'potted_plant', 'compost', 'agriculture', 'emoji_nature', 'flutter_dash',
      'robot_2', 'drone', 'rocket_launch', 'planet', 'mountain_flag',
    ],
  },
  {
    name: 'Technology & subscriptions',
    icons: [
      'devices', 'laptop_mac', 'computer', 'desktop_windows', 'monitor', 'tablet_mac',
      'phone_iphone', 'smartphone', 'print', 'keyboard', 'mouse', 'memory',
      'hard_drive', 'cloud', 'dns', 'terminal', 'code', 'podcasts',
      'audiotrack', 'newspaper', 'subscriptions',
    ],
  },
  {
    name: 'Work & education',
    icons: [
      'work', 'business_center', 'badge', 'school', 'history_edu', 'science',
      'calculate', 'edit', 'design_services', 'co_present', 'cast_for_education', 'workspace_premium',
      'business', 'domain',
    ],
  },
  {
    name: 'Money & giving',
    icons: [
      'savings', 'account_balance', 'account_balance_wallet', 'credit_card', 'receipt_long', 'payments',
      'euro', 'currency_exchange', 'trending_up', 'monitoring', 'request_quote', 'price_check',
      'paid', 'percent', 'sell', 'contract', 'security', 'verified_user',
      'gavel', 'volunteer_activism', 'diversity_1',
    ],
  },
  {
    name: 'General',
    icons: [
      'category', 'label', 'star', 'favorite', 'flag', 'more_horiz',
      'calendar_month', 'schedule', 'event', 'repeat', 'bookmark', 'check_circle',
    ],
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
    if (id === 'Surplus') return 'Cash surplus';
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
