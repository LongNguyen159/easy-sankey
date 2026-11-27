import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { formatDate, NgTemplateOutlet } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { v4 as uuid } from 'uuid';
import { BudgetEnvelope, SingleMonthData } from '../../models';
import { DataService } from '../../../services/data.service';
import { UiService } from '../../../services/ui.service';
import { MatDividerModule } from '@angular/material/divider';

export type EnvelopeDialogData =
  | (Pick<SingleMonthData, 'month' | 'envelopes'> & {createEnvelope?: true | 'draft'})
  | {createEnvelope: 'global-draft'; envelopes: BudgetEnvelope[]};

@Component({
  selector: 'app-envelope-dialog',
  imports: [NgTemplateOutlet, MatSelectModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatDividerModule],
  template: `
    <h2 mat-dialog-title>{{ globalDraft ? 'New monthly budget' : data.createEnvelope ? 'New budget' : 'Budgets' }} @if (!globalDraft && !data.createEnvelope) { <span data-sensitive-data>for {{ monthLabel }}</span> }</h2>
    <mat-dialog-content>
      @if (data.createEnvelope) {
        @for (row of rows.controls; track row) {
          @if (row.controls.id.value === newEnvelopeId) {
            <ng-container *ngTemplateOutlet="budgetFields; context: {$implicit: row}"></ng-container>
          }
        }
      } @else {
        @for (scope of scopes; track scope.global) {
          <section [attr.aria-label]="scope.label" class="py-3">
            <h3 class="mb-2 text-lg font-bold">{{ scope.label }}</h3>
            @for (row of rowsForScope(scope.global); track row) {
              <ng-container *ngTemplateOutlet="budgetFields; context: {$implicit: row}"></ng-container>
            } @empty {
              <p class="envelope-empty">No budgets yet.</p>
            }
          </section>
          <mat-divider></mat-divider>
        }
      }
      <ng-template #budgetFields let-row>
        <div class="envelope-row" [formGroup]="row">
          <div class="envelope-fields">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" [maxLength]="100">
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Amount</mat-label>
              <input matInput data-sensitive-data type="number" formControlName="budget" min="0.01" step="0.01">
            </mat-form-field>
            @if (!data.createEnvelope) {
              <button mat-icon-button type="button" class="app-button-warn" [disabled]="saving" (click)="remove(row)"
                [attr.aria-label]="'Delete ' + row.controls.name.value">
                <mat-icon fontSet="material-symbols-outlined">delete_outline</mat-icon>
              </button>
            }
          </div>
          @if (data.createEnvelope && !globalDraft) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Applies to</mat-label>
              <mat-select formControlName="isGlobal">
                <mat-option [value]="false">This month only</mat-option>
                <mat-option [value]="true">For every month</mat-option>
              </mat-select>
            </mat-form-field>
          }
        </div>
      </ng-template>
      @if (!data.createEnvelope) {
        <button matButton type="button" class="mt-2" [disabled]="saving" (click)="add()">
          <mat-icon fontSet="material-symbols-outlined">add</mat-icon>Add budget
        </button>
      }
      @if (error) { <p role="alert" data-sensitive-data>{{ error }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving">Cancel</button>
      <button mat-flat-button [disabled]="saving || rows.invalid" (click)="save()">
        {{ saving ? 'Saving…' : isDraft ? 'Add budget' : data.createEnvelope ? 'Create budget' : 'Save' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .envelope-row { display:flex; flex-direction:column; gap:.75rem; padding-block:.75rem 1rem; }
    .envelope-fields { display:flex; align-items:center; gap:.75rem; }
    mat-form-field { min-width:0; flex:1 1 0; }
    .envelope-empty { margin-block:.75rem; color:var(--mat-sys-on-surface-variant); }
    @media(max-width:480px) {
      .envelope-fields { flex-wrap:wrap; }
      mat-form-field { flex-basis:calc(50% - 2rem); }
    }
  `,
})
export class EnvelopeDialogComponent {
  readonly data = inject<EnvelopeDialogData>(MAT_DIALOG_DATA);
  protected readonly globalDraft = this.data.createEnvelope === 'global-draft';
  protected readonly isDraft = this.globalDraft || this.data.createEnvelope === 'draft';
  readonly monthLabel = 'month' in this.data ? formatDate(`${this.data.month}-01`, 'MMMM yyyy', 'en-US') : '';
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly service = inject(DataService);
  private readonly uiService = inject(UiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly dialog = inject(MatDialog);
  private readonly ref = inject(MatDialogRef<EnvelopeDialogComponent>);
  private group(envelope: BudgetEnvelope) {
    return this.fb.group({id: envelope.id, isGlobal: envelope.isGlobal ?? false, name: [envelope.name, [Validators.required, Validators.pattern(/\S/)]],
      budget: [envelope.budget, [Validators.required, Validators.min(0.01)]]});
  }
  protected readonly newEnvelopeId = this.data.createEnvelope ? uuid() : undefined;
  private base = this.data.envelopes ?? [];
  readonly rows = new FormArray([
    ...(this.isDraft ? [] : this.base),
    ...(this.newEnvelopeId ? [{id: this.newEnvelopeId, name: '', budget: 500, isGlobal: this.globalDraft}] : []),
  ].map(envelope => this.group(envelope)));
  readonly scopes = [
    {global:false, label:'This month only'},
    {global:true, label:'For every month'},
  ];
  rowsForScope(isGlobal: boolean) { return this.rows.controls.filter(row => row.controls.isGlobal.value === isGlobal); }
  isNew(id: string) { return !this.base.some(row => row.id === id); }
  saving = false;
  error = '';
  add(): void {
    if (this.data.createEnvelope) return;
    this.dialog.open<EnvelopeDialogComponent, typeof this.data, BudgetEnvelope>(EnvelopeDialogComponent, {
      data: {...this.data, envelopes: this.rows.getRawValue(), createEnvelope: 'draft'},
      width: '32rem',
      maxWidth: '95vw',
    }).afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(budget => {
      if (!budget) return;
      this.rows.push(this.group(budget));
      this.error = '';
      this.changeDetector.markForCheck();
    });
  }
  protected remove(row: ReturnType<EnvelopeDialogComponent['group']>): void {
    if (this.saving || this.data.createEnvelope) return;
    const {month} = this.data;
    const id = row.controls.id.value;
    const removeRow = () => {
      const index = this.rows.controls.indexOf(row);
      if (index >= 0) {
        this.rows.removeAt(index);
        this.changeDetector.markForCheck();
      }
    };
    if (this.isNew(id)) {
      removeRow();
      return;
    }

    this.uiService.openConfirmDialog({
      title: `Delete “${row.controls.name.value.trim() || 'Untitled budget'}”?`,
      message: row.controls.isGlobal.value
        ? 'This budget will be deleted from every month.'
        : `This budget will be deleted from ${this.monthLabel}.`,
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete',
      confirmColor: 'warn',
    }, '440px', 'auto').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async confirmed => {
      if (confirmed !== true || this.saving || !this.rows.controls.includes(row)) return;
      this.saving = true;
      this.error = '';
      this.rows.disable();
      this.ref.disableClose = true;
      this.changeDetector.markForCheck();
      try {
        if (row.controls.isGlobal.value) {
          const globals = this.base.filter(item => item.isGlobal);
          await this.service.saveGlobalEnvelopes(globals.filter(item => item.id !== id), globals);
        } else {
          await this.service.deleteLocalEnvelope(month, id);
        }
        this.base = this.base.filter(item => item.id !== id);
        removeRow();
      } catch {
        this.error = 'Could not delete the budget. Try again.';
      } finally {
        this.saving = false;
        this.rows.enable();
        this.ref.disableClose = false;
        this.changeDetector.markForCheck();
      }
    });
  }
  async save() {
    if (this.rows.invalid || this.saving) return;
    const envelopes = this.rows.getRawValue().map(row => ({...row, name: row.name.trim()}));
    if (this.data.createEnvelope === 'draft' || this.data.createEnvelope === 'global-draft') {
      const [budget] = envelopes;
      if (this.base.some(row => !!row.isGlobal === budget.isGlobal
          && row.name.trim().toLowerCase() === budget.name.toLowerCase())) {
        this.error = 'Choose a different name for each budget.';
        return;
      }
      this.ref.close(budget);
      return;
    }
    if (new Set(envelopes.map(row => `${row.isGlobal}:${row.name.toLowerCase()}`)).size !== envelopes.length) {
      this.error = 'Choose a different name for each budget.'; return;
    }
    const created = envelopes.find(row => row.id === this.newEnvelopeId);
    this.saving = true; this.error = ''; this.rows.disable(); this.ref.disableClose = true;
    try { await this.service.saveEnvelopes(this.data.month,
      envelopes.filter(row => !row.isGlobal).map(({isGlobal, ...row}) => row),
      envelopes.filter(row => row.isGlobal),
      this.base.filter(row => row.isGlobal));
      this.ref.close(created ? {envelopeId: created.id} : true); }
    catch { this.error = 'Could not save budgets. Your changes are still here; try again.'; }
    finally {
      this.saving = false;
      this.rows.enable();
      this.ref.disableClose = false;
      this.changeDetector.markForCheck();
    }
  }
}
