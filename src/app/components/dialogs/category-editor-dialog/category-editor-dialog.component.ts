import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CATEGORY_COLORS, CATEGORY_ICON_GROUPS, CategoryService } from '../../../services/category.service';
import { ColorService } from '../../../services/color.service';
import { ExpenseCategoryDetails } from '../../models';

// cspell:words fastfood horiz icecream

const iconLabels: Record<string, string> = {
  ac_unit: 'Air conditioning',
  account_balance: 'Bank',
  attractions: 'Amusement park',
  beach_access: 'Beach',
  cast_for_education: 'Online classes',
  checkroom: 'Clothing',
  confirmation_number: 'Tickets',
  content_cut: 'Haircut',
  cruelty_free: 'Rabbit',
  delivery_dining: 'Food delivery',
  directions_boat: 'Boat',
  directions_car: 'Car',
  directions_run: 'Running',
  downhill_skiing: 'Skiing',
  electrical_services: 'Electricity',
  fastfood: 'Fast food',
  featured_seasonal_and_gifts: 'Present box',
  fitness_center: 'Gym',
  garage_home: 'Home garage',
  grocery: 'Groceries',
  icecream: 'Ice cream',
  local_cafe: 'Coffee',
  local_car_wash: 'Car wash',
  local_fire_department: 'Gas heating',
  local_florist: 'Flowers',
  local_gas_station: 'Fuel',
  local_laundry_service: 'Laundromat',
  local_mall: 'Shopping centre',
  local_parking: 'Parking',
  local_shipping: 'Delivery',
  local_taxi: 'Taxi',
  mic_external_on: 'Handheld microphone',
  menu_book: 'Books',
  more_horiz: 'Other',
  music_note_add: 'Music lessons',
  outdoor_grill: 'Barbecue',
  phone_iphone: 'Mobile phone',
  receipt_long: 'Receipt',
  redeem: 'Gift card',
  precision_manufacturing: 'Robotic arm',
  self_improvement: 'Meditation',
  sports_esports: 'Gaming',
  styler: 'Shirts',
  theaters: 'Cinema',
  flutter_dash: 'Bird',
  trending_up: 'Investments',
  volunteer_activism: 'Donations',
  water_drop: 'Water',
  weekend: 'Sofa',
};

const iconKeywords: Record<string, string> = {
  airline_seat_recline_extra: 'seat reservation flight upgrade business class',
  brush: 'painting art classes crafts',
  camera_roll: 'film photography',
  child_care: 'daycare nursery babysitting',
  directions_boat: 'ferry cruise',
  diamond: 'wedding engagement ring jewellery',
  drone: 'drone flying aerial photography',
  emoji_nature: 'beekeeping insects wildlife',
  cake: 'birthday cake',
  celebration: 'party confetti graduation new year',
  favorite_border: 'anniversary valentine wedding',
  featured_seasonal_and_gifts: 'gift box wrapped present birthday christmas holiday',
  flutter_dash: 'birdwatching birding',
  health_and_safety: 'health insurance',
  home: 'rent mortgage housing',
  hotel: 'accommodation hostel lodging',
  local_cafe: 'café cafe coffee shop',
  local_gas_station: 'petrol gasoline diesel',
  mail: 'greeting card invitation',
  medication: 'pharmacy prescriptions',
  mic_external_on: 'singing karaoke',
  music_note: 'music lessons instruments',
  outdoor_grill: 'bbq grilling cooking',
  pets: 'vet veterinary animals',
  planet: 'astronomy stargazing',
  playing_cards: 'card games poker bridge',
  potted_plant: 'gardening houseplants',
  receipt_long: 'bills invoices taxes',
  school: 'tuition courses',
  self_improvement: 'yoga mindfulness',
  subscriptions: 'streaming membership',
  thermostat: 'heating',
  visibility: 'optician eye exam',
  wifi: 'internet broadband',
};

@Component({
  selector: 'app-category-editor-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
  templateUrl: './category-editor-dialog.component.html',
  styleUrl: './category-editor-dialog.component.scss',
})
export class CategoryEditorDialogComponent {
  protected readonly category = inject<ExpenseCategoryDetails | null>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<CategoryEditorDialogComponent, ExpenseCategoryDetails>>(MatDialogRef);
  private readonly categories = inject(CategoryService);
  private readonly theme = inject(ColorService);

  protected readonly iconSearch = signal('');
  protected readonly iconGroups = computed(() => {
    const query = this.iconSearch().trim().toLowerCase();
    if (!query) return CATEGORY_ICON_GROUPS;

    return CATEGORY_ICON_GROUPS.map(group => ({
      ...group,
      icons: group.name.toLowerCase().includes(query) ? group.icons : group.icons.filter(icon =>
        this.iconLabel(icon).toLowerCase().includes(query) ||
        icon.replaceAll('_', ' ').includes(query) ||
        iconKeywords[icon]?.includes(query)
      ),
    })).filter(group => group.icons.length);
  });
  protected label = this.category?.label ?? '';
  protected icon = this.category?.icon ?? 'category';
  protected color = this.initialColor();
  protected readonly colors = CATEGORY_COLORS.includes(this.color)
    ? CATEGORY_COLORS
    : [this.color, ...CATEGORY_COLORS];
  protected error = '';

  private initialColor(): typeof CATEGORY_COLORS[number] {
    const colorLight = this.category?.colorLight;
    const colorDark = this.category?.colorDark;
    if (!colorLight || !colorDark) return CATEGORY_COLORS[0];

    return CATEGORY_COLORS.find(color => color.colorLight === colorLight && color.colorDark === colorDark)
      ?? { name: 'Saved colour', colorLight, colorDark };
  }

  protected swatch(color: typeof CATEGORY_COLORS[number]): string {
    return this.theme.isDarkMode() ? color.colorDark : color.colorLight;
  }

  protected readonly previewBackground = computed(() =>
    this.theme.isDarkMode() ? this.theme.darkBackgroundPrimary : this.theme.lightBackgroundPrimary
  );

  protected iconLabel(icon: string): string {
    return iconLabels[icon] ?? icon.replaceAll('_', ' ');
  }

  protected async save(): Promise<void> {
    const label = this.label.trim();
    if (!label) return;

    if (this.categories.categories().some(category =>
      category.value !== this.category?.value && category.label.toLowerCase() === label.toLowerCase()
    )) {
      this.error = 'A category with this name already exists.';
      return;
    }

    this.dialogRef.close((await this.categories.save(label, this.icon, this.color, this.category?.value)));
  }
}
