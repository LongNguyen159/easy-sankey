import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { v4 as uuid } from 'uuid';
import { BudgetEnvelope } from '../models';
import { DataService } from '../../services/data.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-global-envelope-manager',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <section class="global-envelope-manager">
      <h2>Global budgets</h2>
      <p class="scope-note">Available every month. Spending is tracked separately for each month.</p>
      @if (loading()) { <p>Loading budgets…</p> }
      @if (!loading() && !visibleRows().length) { <p>No global budgets yet.</p> }
      @for (row of visibleRows(); track row) {
        <div class="envelope-fields" [formGroup]="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" [maxLength]="100">
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Monthly amount</mat-label>
            <input matInput formControlName="budget" type="number" min="0.01" step="0.01">
          </mat-form-field>
          <button mat-icon-button type="button" [disabled]="saving()" (click)="remove(row)"
            [attr.aria-label]="'Delete ' + row.controls.name.value">
            <mat-icon fontSet="material-symbols-outlined">delete_outline</mat-icon>
          </button>
        </div>
      }
      <div class="envelope-actions">
        <button mat-button [disabled]="loading() || saving()" (click)="add()">
          <mat-icon fontSet="material-symbols-outlined">add</mat-icon>Add budget
        </button>
        <button mat-flat-button [disabled]="loading() || saving() || rows.invalid" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (saved()) { <p role="status">Global budgets saved.</p> }
    </section>
  `,
  styles: `
    .global-envelope-manager { max-width:46rem; margin-inline:auto; display:flex; flex-direction:column; gap:1rem; }
    h2, p { margin:0; }
    .scope-note { color:var(--mat-sys-on-surface-variant); }
    .envelope-fields { display:flex; align-items:center; gap:.75rem; }
    mat-form-field { min-width:0; flex:1 1 0; }
    .envelope-actions { display:flex; justify-content:space-between; gap:1rem; }
    @media(max-width:480px) { .envelope-fields { flex-wrap:wrap; } mat-form-field { flex-basis:calc(50% - 2rem); } }
  `,
})
export class GlobalEnvelopeManagerComponent implements OnInit {
  private readonly service = inject(DataService);
  private readonly uiService = inject(UiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private base: BudgetEnvelope[] = [];
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly saved = signal(false);
  private group(item: BudgetEnvelope) {
    return this.fb.group({id:item.id, name:[item.name,[Validators.required,Validators.pattern(/\S/)]],
      budget:[item.budget,[Validators.required,Validators.min(0.01)]]});
  }
  readonly rows = new FormArray<ReturnType<GlobalEnvelopeManagerComponent['group']>>([]);
  protected readonly visibleRows = signal([...this.rows.controls]);
  constructor() {
    effect(() => {
      const globals = this.service.globalEnvelopes();
      if (this.loading() || this.saving()) return;

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
      if (!this.saving()) this.saved.set(false);
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
  add() { this.rows.push(this.group({id:uuid(),name:'',budget:500})); this.saved.set(false); }
  protected remove(row: ReturnType<GlobalEnvelopeManagerComponent['group']>): void {
    if (this.saving()) return;
    const id = row.controls.id.value;
    const removeRow = () => {
      const index = this.rows.controls.indexOf(row);
      if (index >= 0) this.rows.removeAt(index);
    };
    if (!this.base.some(item => item.id === id)) {
      removeRow();
      return;
    }

    this.uiService.openConfirmDialog({
      title: `Delete “${row.controls.name.value.trim() || 'Untitled budget'}”?`,
      message: 'This budget will be deleted from every month.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete',
      confirmColor: 'warn',
    }, '440px', 'auto').pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async confirmed => {
      if (confirmed !== true || this.saving() || !this.rows.controls.includes(row)) return;
      this.saving.set(true);
      this.error.set('');
      this.saved.set(false);
      this.rows.disable();
      try {
        await this.service.saveGlobalEnvelopes(this.base.filter(item => item.id !== id), this.base);
        this.base = structuredClone(this.service.globalEnvelopes());
        removeRow();
      } catch {
        this.error.set('Could not delete the budget. Try again.');
      } finally {
        this.rows.enable();
        this.saving.set(false);
      }
    });
  }
  async save() {
    if(this.rows.invalid || this.loading() || this.saving())return;
    const items=this.rows.getRawValue().map(row=>({...row,name:row.name.trim(),isGlobal:true}));
    if(new Set(items.map(item=>item.name.toLowerCase())).size!==items.length) {
      this.error.set('Choose a different name for each budget.');return;
    }
    this.saving.set(true);this.error.set('');this.saved.set(false);this.rows.disable();
    try {
      await this.service.saveGlobalEnvelopes(items,this.base);
      this.base=structuredClone(this.service.globalEnvelopes());
      this.rows.clear();this.base.forEach(item=>this.rows.push(this.group(item)));
      this.saved.set(true);
    } catch { this.error.set('Could not save global budgets. Your changes are still here; try again.'); }
    finally { this.rows.enable();this.saving.set(false); }
  }
}
