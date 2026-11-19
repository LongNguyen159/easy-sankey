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

const iconLabels: Record<string, string> = {
  checkroom: 'Clothing',
  directions_car: 'Car',
  electrical_services: 'Electricity',
  local_cafe: 'Coffee',
  local_gas_station: 'Fuel',
  local_shipping: 'Delivery',
  menu_book: 'Books',
  more_horiz: 'Other',
  phone_iphone: 'Mobile phone',
  redeem: 'Gift card',
  self_improvement: 'Meditation',
  sports_esports: 'Gaming',
  water_drop: 'Water',
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
        this.iconLabel(icon).toLowerCase().includes(query) || icon.replaceAll('_', ' ').includes(query)
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
