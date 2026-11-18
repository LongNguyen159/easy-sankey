import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CategoryEditorDialogComponent } from '../dialogs/category-editor-dialog/category-editor-dialog.component';
import { ExpenseCategoryDetails } from '../models';
import { CategoryService } from '../../services/category.service';
import { ColorService } from '../../services/color.service';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-category-manager',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './category-manager.component.html',
  styleUrl: './category-manager.component.scss',
})
export class CategoryManagerComponent {
  readonly showHeading = input(true);

  private readonly dialog = inject(MatDialog);
  private readonly categoryService = inject(CategoryService);
  private readonly dataService = inject(DataService);
  private readonly uiService = inject(UiService);
  protected readonly colorService = inject(ColorService);
  protected readonly categories = this.categoryService.categories;
  protected openEditor(category: ExpenseCategoryDetails | null = null): void {
    this.dialog.open(CategoryEditorDialogComponent, { data: category, width: '500px' });
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
    });
  }
}
