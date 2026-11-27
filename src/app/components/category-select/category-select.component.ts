import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { CategoryService } from '../../services/category.service';
import { ColorService } from '../../services/color.service';
import { CategoryEditorDialogComponent } from '../dialogs/category-editor-dialog/category-editor-dialog.component';
import { ManageCategoriesDialogComponent } from '../dialogs/manage-categories-dialog/manage-categories-dialog.component';
import { ExpenseCategoryDetails } from '../models';

@Component({
  selector: 'app-category-select',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatIconModule, MatSelectModule, NgxMatSelectSearchModule],
  templateUrl: './category-select.component.html',
  styleUrl: './category-select.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CategorySelectComponent {
  readonly control = input.required<FormControl<string>>();
  readonly categoryChange = output<void>();

  private readonly categories = inject(CategoryService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly errorMatcher = inject(ErrorStateMatcher);
  protected readonly entryErrorMatcher: ErrorStateMatcher = {
    isErrorState: (_, form) => this.errorMatcher.isErrorState(this.control(), form),
  };
  protected readonly addAction = Symbol('add category');
  protected readonly manageAction = Symbol('manage categories');
  protected readonly theme = inject(ColorService);
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges, { initialValue: '' });
  protected readonly options = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.categories.categories().filter(category => category.label.toLowerCase().includes(query));
  });

  protected selectedCategory(): ExpenseCategoryDetails | undefined {
    return this.categories.get(this.control().value);
  }

  protected selectOption({ source, value }: MatSelectChange): void {
    const control = this.control();
    this.search.reset();

    if (value === this.addAction || value === this.manageAction) {
      // Action rows use the select's keyboard navigation without replacing the category.
      source.value = this.selectedCategory()?.value ?? '';
      if (!source.panelOpen) return;
      source.close();
      source.focus();

      if (value === this.addAction) {
        this.addCategory(control);
      } else {
        this.dialog.open(ManageCategoriesDialogComponent, { width: '540px' });
      }
      return;
    }

    control.markAsDirty();
    control.setValue(value);
    this.categoryChange.emit();
  }

  private addCategory(control: FormControl<string>): void {
    this.dialog.open<CategoryEditorDialogComponent, null, ExpenseCategoryDetails>(
      CategoryEditorDialogComponent, { data: null, width: '500px' },
    ).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(saved => {
      if (saved && control === this.control() && control.enabled) {
        control.markAsDirty();
        control.setValue(saved.value);
        this.categoryChange.emit();
      }
    });
  }
}
