import {FixedCostService} from '../../services/fixed-cost.service';
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { InputListComponent } from '../input-list/input-list.component';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CategorySelectComponent } from '../category-select/category-select.component';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { UserDefinedLink } from '../models';
import { debounceTime, takeUntil, tap } from 'rxjs';
import { ErrorCardComponent } from "../error-card/error-card.component";
import { MatTooltipModule } from '@angular/material/tooltip';
import { AmountSortComponent } from '../amount-sort/amount-sort.component';
import { AmountSort, resolveAmountSort, sortByAmount } from '../../utils/amount-sort';


@Component({
    selector: 'app-fix-cost-input',
    imports: [MatButtonModule,
        ReactiveFormsModule,
        CommonModule,
        MatInputModule,
        MatFormFieldModule,
        MatSelectModule,
        MatIconModule,
        CategorySelectComponent,
        ErrorCardComponent,
        MatTooltipModule,
        MatDividerModule,
        MatMenuModule,
        CdkDrag,
        CdkDragHandle,
        CdkDropList,
        AmountSortComponent
    ],
    templateUrl: './fix-cost-input.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './fix-cost-input.component.scss'
})
export class FixCostInputComponent extends InputListComponent {
  private fixedCosts=inject(FixedCostService);
  protected readonly saveStatus = signal<'Saving…' | 'Saved' | ''>('');
  private saveVersion = 0;
  protected sortOrder = resolveAmountSort(this.preferences.read('fixCostSort'));
  protected editingAmount?: { row: FormGroup; value: number };
  fixCostsInfoTooltip = 'If you change your Fix Costs defined here, you will have to click "Update Fix Costs" in your "Edit Input" dialog to apply the changes.'

  constructor(fb: FormBuilder) {
    super(fb); // Pass FormBuilder to the parent constructor
  }

  override ngOnInit() {
    this.initialFormState = [...this.linkArray.value]; // Store the initial form state


    const fixedCosts = this.dataService.isDemo()
      ? this.dataService.demoLinks.filter(item => item.isFixCost)
      : this.dataService.retrieveFixCostsLinks();

    for (const link of fixedCosts) {
      this.linkArray.push(this._createLinkGroup({ ...link, isFixCost: true }), { emitEvent: false });
    }

    this.linkForm.valueChanges.pipe(
      tap(() => {
        this.saveVersion++;
        this.saveStatus.set('');
      }),
      takeUntil(this.componentDestroyed$),
      debounceTime(250),
    ).subscribe(async () => {
     
      if (this.linkForm.valid) {
        await this.saveTemplates();
      }
    })    
  }

  override addLink(): void {
    super.addLink();
    this.newEntries.delete(this.linkArray.at(-1));
  }

  protected override async updateSavedFormValuesOnFormChanges(): Promise<void> {
    await this.saveTemplates();
  }

  protected async setSort(order: AmountSort): Promise<void> {
    this.sortOrder = order;
    await this.preferences.write('fixCostSort', order);
  }

  protected override visibleEntries(isFixCost?: boolean): FormGroup[] {
    return sortByAmount(super.visibleEntries(isFixCost), this.sortOrder, row =>
      row === this.editingAmount?.row ? this.editingAmount.value : Number(row.get('value')?.value) || 0
    );
  }

  protected startAmountEdit(row: FormGroup): void {
    this.editingAmount = { row, value: Number(row.get('value')?.value) || 0 };
  }

  protected async finishAmountEdit(): Promise<void> {
    this.editingAmount = undefined;
    await this.updateInput();
  }

  
  override async updateInput() {
    if (!this.linkForm.valid) return;
  
    const formData: UserDefinedLink[] = this.linkForm.value.links;

    /** Do not allow negative values on form */
    const negatives = formData.filter(link => link.value < 0);
    if (negatives.length > 0) { 
      this.uiService.showSnackBar('Negative values are not allowed!', 'Dismiss')
      return;
    }

    if (JSON.stringify(formData) === JSON.stringify(this.initialFormState)) {
      return; // No changes, don't proceed
    }
    
    this.taxNodeExists = this._hasTaxNode(formData);
    await this.saveTemplates();

    // After processing, update the initial form state to the new one
    this.initialFormState = [...formData]; // Update the stored form state
  }


  override async removeLink(index: number): Promise<void> {
    if (index < 0) return;
    this.linkArray.removeAt(index, { emitEvent: false });
    await this.saveTemplates();
  }


  async saveTemplates() {
    const version = ++this.saveVersion;
    this.saveStatus.set('');
    if (!this.linkForm.valid) return;
    const links = this.linkArray.value.map((link: UserDefinedLink) => ({ ...link, isFixCost: true }));
    this.saveStatus.set('Saving…');
    try {
      await this.fixedCosts.save(this.categoryService.clearMissingSources(links));
      if (version === this.saveVersion) this.saveStatus.set('Saved');
    } finally {
      if (version === this.saveVersion && this.saveStatus() === 'Saving…') this.saveStatus.set('');
    }
  }

  override async ngOnDestroy(): Promise<void> {
    this.componentDestroyed$.next();
    this.componentDestroyed$.complete();

    if (JSON.stringify(this.linkArray.value) === JSON.stringify(this.initialFormState)) {
      return; // No changes, don't proceed
    }

    if (this.linkForm.valid) {
      await this.saveTemplates();
    }
  }
}
