import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { v4 as uuid } from 'uuid';
import { BudgetEnvelope } from '../models';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-global-envelope-manager',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule],
  template: `
    <section class="global-envelope-manager">
      <h2>Global envelopes</h2>
      <p class="scope-note">Available every month. Spending is tracked separately for each month.</p>
      @if (loading()) { <p>Loading envelopes…</p> }
      @if (!loading() && !rows.length) { <p>No global envelopes yet.</p> }
      @for (row of rows.controls; track row) {
        <div class="envelope-fields" [formGroup]="row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" [maxLength]="100">
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Monthly allowance</mat-label>
            <input matInput formControlName="budget" type="number" min="0.01" step="0.01">
          </mat-form-field>
          <button mat-icon-button type="button" [disabled]="saving()" (click)="rows.removeAt($index)"
            [attr.aria-label]="'Delete ' + row.controls.name.value">
            <mat-icon fontSet="material-symbols-outlined">delete_outline</mat-icon>
          </button>
        </div>
      }
      <div class="envelope-actions">
        <button mat-button [disabled]="loading() || saving()" (click)="add()">
          <mat-icon fontSet="material-symbols-outlined">add</mat-icon>Add envelope
        </button>
        <button mat-flat-button [disabled]="loading() || saving() || rows.invalid" (click)="save()">{{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (saved()) { <p role="status">Global envelopes saved.</p> }
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
  constructor() {
    this.rows.valueChanges.pipe(takeUntilDestroyed()).subscribe(()=>{
      if (!this.saving()) this.saved.set(false);
    });
  }
  async ngOnInit() {
    try {
      await this.service.ready;
      this.base=structuredClone(this.service.globalEnvelopes());
      this.base.forEach(item=>this.rows.push(this.group(item)));
    } catch { this.error.set('Could not load global envelopes.'); }
    finally { this.loading.set(false); }
  }
  add() { this.rows.push(this.group({id:uuid(),name:'',budget:500})); this.saved.set(false); }
  async save() {
    if(this.rows.invalid || this.loading() || this.saving())return;
    const items=this.rows.getRawValue().map(row=>({...row,name:row.name.trim(),isGlobal:true}));
    if(new Set(items.map(item=>item.name.toLowerCase())).size!==items.length) {
      this.error.set('Choose a different name for each envelope.');return;
    }
    this.saving.set(true);this.error.set('');this.saved.set(false);this.rows.disable();
    try {
      await this.service.saveGlobalEnvelopes(items,this.base);
      this.base=structuredClone(this.service.globalEnvelopes());
      this.rows.clear();this.base.forEach(item=>this.rows.push(this.group(item)));
      this.saved.set(true);
    } catch { this.error.set('Could not save global envelopes. Your changes are still here; try again.'); }
    finally { this.rows.enable();this.saving.set(false); }
  }
}
