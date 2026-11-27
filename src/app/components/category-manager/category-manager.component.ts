import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { afterNextRender, Component, inject, Injector, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoryEditorDialogComponent } from '../dialogs/category-editor-dialog/category-editor-dialog.component';
import { CategoryClassification, ExpenseCategoryDetails } from '../models';
import { CategoryService } from '../../services/category.service';
import { ColorService } from '../../services/color.service';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-category-manager',
  imports: [CdkDrag, CdkDragHandle, CdkDropList, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './category-manager.component.html',
  styleUrl: './category-manager.component.scss',
})
export class CategoryManagerComponent {
  protected readonly CategoryClassification = CategoryClassification;
  readonly showHeading = input(true);

  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly dialog = inject(MatDialog);
  private readonly categoryService = inject(CategoryService);
  private readonly dataService = inject(DataService);
  private readonly uiService = inject(UiService);
  protected readonly colorService = inject(ColorService);
  protected readonly categories = this.categoryService.categories;
  protected openEditor(category: ExpenseCategoryDetails | null = null): void {
    this.dialog.open(CategoryEditorDialogComponent, { data: category, width: '500px' });
  }

  protected async drop(event: CdkDragDrop<ExpenseCategoryDetails[], ExpenseCategoryDetails[], ExpenseCategoryDetails>): Promise<void> {
    if (event.isPointerOverContainer) (await this.moveCategory(event.item.data, event.currentIndex));
  }

  protected async moveWithKeyboard(event: Event, category: ExpenseCategoryDetails, toIndex: number): Promise<void> {
    event.preventDefault();
    const handle = event.currentTarget as HTMLButtonElement;
    if ((await this.moveCategory(category, toIndex))) {
      afterNextRender(() => handle.focus(), { injector: this.injector });
    }
  }

  private async moveCategory(category: ExpenseCategoryDetails, toIndex: number): Promise<boolean> {
    if (!(await this.categoryService.move(category.value, toIndex))) return false;
    void this.announcer.announce(`${category.label} moved to position ${toIndex + 1} of ${this.categories().length}.`);
    return true;
  }

  protected remove(category: ExpenseCategoryDetails): void {
    this.uiService.openConfirmDialog({
      title: `Delete “${category.label}”?`,
      message: 'Entries in this category will become uncategorized. Any budget or tracker for this category will be removed.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete',
      confirmColor: 'warn',
    }, '440px', 'auto').subscribe(async confirmed => {
      if (!confirmed) return;
      await this.dataService.removeCategory(category.value);
    });
  }
}
