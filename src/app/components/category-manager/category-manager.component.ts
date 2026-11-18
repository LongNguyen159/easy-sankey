import { afterNextRender, Component, ElementRef, inject, Injector, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ExpenseCategoryDetails } from '../models';
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryService } from '../../services/category.service';
import { ColorService } from '../../services/color.service';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-category-manager',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './category-manager.component.html',
  styleUrl: './category-manager.component.scss',
})
export class CategoryManagerComponent {
  private readonly injector = inject(Injector);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('categoryName');
  private readonly categoryService = inject(CategoryService);
  private readonly dataService = inject(DataService);
  private readonly uiService = inject(UiService);
  protected readonly colorService = inject(ColorService);
  protected readonly categories = this.categoryService.categories;
  protected readonly colors = CATEGORY_COLORS;
  protected readonly icons = CATEGORY_ICONS;

  protected editorOpen = false;
  protected editingId?: string;
  protected label = '';
  protected icon = CATEGORY_ICONS[0];
  protected color = CATEGORY_COLORS[0];
  protected error = '';

  protected openEditor(category?: ExpenseCategoryDetails): void {
    this.editingId = category?.value;
    this.label = category?.label ?? '';
    this.icon = category?.icon ?? CATEGORY_ICONS[0];
    this.color = CATEGORY_COLORS.find(color => color.colorLight === category?.colorLight) ?? CATEGORY_COLORS[0];
    this.error = '';
    this.editorOpen = true;
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected save(): void {
    const label = this.label.trim();
    if (!label) return;
    if (this.categories().some(category =>
      category.value !== this.editingId && category.label.toLowerCase() === label.toLowerCase()
    )) {
      this.error = 'A category with this name already exists.';
      return;
    }

    this.categoryService.save(label, this.icon, this.color, this.editingId);
    this.editorOpen = false;
  }

  protected remove(category: ExpenseCategoryDetails): void {
    this.uiService.openConfirmDialog({
      title: `Delete “${category.label}”?`,
      message: 'Entries in this category will become uncategorized. Any budget or tracker for this category will be removed.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete',
    }, '440px', 'auto').subscribe(confirmed => {
      if (!confirmed) return;
      this.dataService.removeCategory(category.value);
      if (this.editingId === category.value) this.editorOpen = false;
    });
  }
}
