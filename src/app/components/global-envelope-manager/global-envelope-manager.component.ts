import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { EnvelopeDialogComponent, type EnvelopeDialogData } from '../dialogs/envelope-dialog/envelope-dialog.component';
import { BudgetEnvelope } from '../models';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-global-envelope-manager',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <section class="global-envelope-manager">
      <div class="flex flex-wrap items-center gap-2">
        <h2>Global budgets</h2>
        <span class="save-status ml-4" role="status">{{ saving() ? 'Saving…' : saved() ? 'Saved' : '' }}</span>
      </div>
      <p class="scope-note">Available every month. Spending is tracked separately for each month.</p>
      @if (loading()) { <p>Loading budgets…</p> }
      @if (!loading() && !visibleRows().length) { <p>No global budgets yet.</p> }
      @for (row of visibleRows(); track row) {
        <div class="envelope-fields" [formGroup]="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Name</mat-label>
            <input #nameInput matInput formControlName="name" [maxLength]="100"
              (blur)="saveRow(row)" (keydown.enter)="nameInput.blur()">
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Monthly amount</mat-label>
            <input #amountInput matInput formControlName="budget" type="number" min="0.01" step="0.01"
              (blur)="saveRow(row)" (keydown.enter)="amountInput.blur()">
          </mat-form-field>
          <button mat-icon-button type="button" (click)="remove(row)"
            [attr.aria-label]="'Delete ' + row.controls.name.value">
            <mat-icon fontSet="material-symbols-outlined">delete_outline</mat-icon>
          </button>
        </div>
      }
      <div class="envelope-actions">
        <button mat-button [disabled]="loading()" (click)="add()">
          <mat-icon fontSet="material-symbols-outlined">add</mat-icon>Add budget
        </button>
      </div>
      @if (error()) { <p role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: `
    .global-envelope-manager { display:flex; flex-direction:column; gap:1rem; }
    h2, p { margin:0; }
    .scope-note { color:var(--mat-sys-on-surface-variant); }
    .envelope-fields { display:flex; align-items:center; gap:.75rem; }
    mat-form-field { min-width:0; flex:1 1 0; }
    .envelope-actions { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
    .save-status { font-size:.75rem; color:var(--mat-sys-on-surface-variant); }
    @media(max-width:480px) { .envelope-fields { flex-wrap:wrap; } mat-form-field { flex-basis:calc(50% - 2rem); } }
  `,
})
export class GlobalEnvelopeManagerComponent implements OnInit {
  private readonly service = inject(DataService);
  private readonly uiService = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private base: BudgetEnvelope[] = [];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  private readonly hasSaved = signal(false);
  private saveQueue = Promise.resolve();
  private pendingSaves = 0;
  private group(item: BudgetEnvelope) {
    return this.fb.group({id:item.id, name:[item.name,[Validators.required,Validators.pattern(/\S/)]],
      budget:[item.budget,[Validators.required,Validators.min(0.01)]]});
  }
  readonly rows = new FormArray<ReturnType<GlobalEnvelopeManagerComponent['group']>>([]);
  protected readonly visibleRows = signal([...this.rows.controls]);
  readonly saved = computed(() => !this.saving() && this.hasSaved() && !this.error() &&
    this.visibleRows().every(row => {
      const {id, name, budget} = row.getRawValue();
      return this.base.some(item => item.id === id && item.name === name.trim() && item.budget === budget);
    }));
  constructor() {
    effect(() => {
      const globals = this.service.globalEnvelopes();
      if (this.loading()) return;

      // Drop externally deleted rows without discarding drafts for other budgets.
      const currentIds = new Set(globals.map(item => item.id));
      const deletedIds = new Set(this.base.filter(item => !currentIds.has(item.id)).map(item => item.id));
      if (!deletedIds.size) return;

      this.base = this.base.filter(item => !deletedIds.has(item.id));
      for (let index = this.rows.length - 1; index >= 0; index--) {
        if (deletedIds.has(this.rows.at(index).controls.id.value)) this.rows.removeAt(index);
      }
    });
    this.rows.valueChanges.pipe(takeUntilDestroyed()).subscribe(()=>{
      this.visibleRows.set([...this.rows.controls]);
    });
  }
  async ngOnInit() {
    try {
      await this.service.ready;
      this.base=structuredClone(this.service.globalEnvelopes());
      this.base.forEach(item=>this.rows.push(this.group(item)));
    } catch { this.error.set('Could not load global budgets.'); }
    finally { this.loading.set(false); }
  }
  async add(): Promise<void> {
    if (this.loading()) return;
    const ref = this.dialog.open<EnvelopeDialogComponent, EnvelopeDialogData, BudgetEnvelope>(EnvelopeDialogComponent, {
      data: {
        createEnvelope: 'global-draft',
        envelopes: this.rows.getRawValue().map(row => ({...row, isGlobal: true})),
      },
      width: '32rem',
      maxWidth: '95vw',
    });
    const budget = await firstValueFrom(ref.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)), {defaultValue: undefined});
    if (!budget || this.destroyRef.destroyed) return;
    const row = this.group(budget);
    this.rows.push(row);
    await this.saveRow(row);
  }
  protected remove(row: ReturnType<GlobalEnvelopeManagerComponent['group']>): void {
    const id = row.controls.id.value;
    const removeRow = () => {
      const index = this.rows.controls.indexOf(row);
      if (index >= 0) this.rows.removeAt(index);
    };
    this.uiService.openConfirmDialog({
      title: `Delete “${row.controls.name.value.trim() || 'Untitled budget'}”?`,
      message: 'This budget will be deleted from every month.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete',
      confirmColor: 'warn',
    }, '440px', 'auto').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async confirmed => {
      if (confirmed !== true || !this.rows.controls.includes(row)) return;
      await this.persist(
        () => this.base.filter(item => item.id !== id),
        'Could not delete the budget. Try again.',
        removeRow,
      );
    });
  }

  saveRow(row: ReturnType<GlobalEnvelopeManagerComponent['group']>): Promise<void> {
    if (row.invalid || this.loading()) return Promise.resolve();
    const {id, name, budget} = row.getRawValue();
    const item = {id, name: name.trim(), budget, isGlobal: true};
    if (!this.saving() && this.base.some(saved => saved.id === id && saved.name === item.name && saved.budget === budget)) {
      return Promise.resolve();
    }
    return this.persist(() => {
      if (!this.rows.controls.includes(row)) return;
      const existing = this.base.find(budget => budget.id === id);
      if (existing?.name === item.name && existing.budget === item.budget) return;
      return existing
        ? this.base.map(budget => budget.id === id ? item : budget)
        : [...this.base, item];
    }, 'Could not save the budget. Edit the field or leave it again to retry.');
  }

  private persist(
    getItems: () => BudgetEnvelope[] | undefined,
    failureMessage: string,
    onSaved?: () => void,
  ): Promise<void> {
    this.pendingSaves++;
    this.saving.set(true);
    const operation = this.saveQueue.then(async () => {
      const items = getItems();
      if (!items) return;
      if (new Set(items.map(item => item.name.toLowerCase())).size !== items.length) {
        this.error.set('Choose a different name for each budget.');
        return;
      }
      this.error.set('');
      try {
        await this.service.saveGlobalEnvelopes(items, this.base);
        this.base = structuredClone(this.service.globalEnvelopes());
        onSaved?.();
        this.hasSaved.set(true);
      } catch {
        this.error.set(failureMessage);
      }
    }).finally(() => {
      this.pendingSaves--;
      this.saving.set(this.pendingSaves > 0);
    });
    this.saveQueue = operation;
    return operation;
  }
}
