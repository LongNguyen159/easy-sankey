import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { v4 as uuid } from 'uuid';
import { BudgetEnvelope, SingleMonthData } from '../../models';
import { DataService } from '../../../services/data.service';
import { CurrencyService } from '../../../services/currency.service';

@Component({
  selector: 'app-envelope-dialog',
  imports: [MatSlideToggleModule, CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.createEnvelope ? 'New envelope' : 'Month-only envelopes' }}</h2>
    <mat-dialog-content>
      @if (!rows.length) { <p class="envelope-empty">No envelopes yet.</p> }
      @for (row of rows.controls; track row) {
        @if (!data.createEnvelope || row.controls.id.value === newEnvelopeId) {
          <div class="envelope-row" [formGroup]="row">
            <div class="envelope-fields">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Name</mat-label>
                <input matInput formControlName="name" [maxLength]="100">
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Monthly allowance</mat-label>
                <input matInput type="number" formControlName="budget" min="0.01" step="0.01">
              </mat-form-field>
              @if (!data.createEnvelope) {
                <button mat-icon-button type="button" [disabled]="saving" (click)="rows.removeAt($index)"
                  [attr.aria-label]="'Delete ' + row.controls.name.value">
                  <mat-icon fontSet="material-symbols-outlined">delete_outline</mat-icon>
                </button>
              }
            </div>
            @if (data.createEnvelope) {
              <mat-slide-toggle formControlName="isGlobal" hideIcon>Every month</mat-slide-toggle>
            } @else {
              <div class="envelope-meta">
                <span>{{ row.controls.isGlobal.value ? 'Every month' : data.month }}</span>
                <span>{{ spent(row.controls.id.value) | currency:currency.getSelectedCurrency() }} spent this month</span>
              </div>
            }
          </div>
        }
      }
      @if (!data.createEnvelope) {
        <button mat-button type="button" [disabled]="saving" (click)="add()">
          <mat-icon fontSet="material-symbols-outlined">add</mat-icon>Add envelope
        </button>
      }
      @if (error) { <p role="alert">{{ error }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving">Cancel</button>
      <button mat-flat-button [disabled]="saving || rows.invalid" (click)="save()">{{ saving ? 'Saving…' : data.createEnvelope ? 'Create envelope' : 'Save' }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .envelope-row { display:flex; flex-direction:column; gap:.75rem; padding-block:.75rem 1rem; }
    .envelope-fields { display:flex; align-items:center; gap:.75rem; }
    mat-form-field { min-width:0; flex:1 1 0; }
    .envelope-meta { display:flex; justify-content:space-between; flex-wrap:wrap; gap:.25rem 1rem; color:var(--mat-sys-on-surface-variant); font-size:.875rem; }
    .envelope-empty { margin-block:.75rem; color:var(--mat-sys-on-surface-variant); }
    @media(max-width:480px) {
      .envelope-fields { flex-wrap:wrap; }
      mat-form-field { flex-basis:calc(50% - 2rem); }
    }
  `,
})
export class EnvelopeDialogComponent {
  readonly data = inject<SingleMonthData & {createEnvelope?: boolean}>(MAT_DIALOG_DATA);
  readonly currency = inject(CurrencyService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly service = inject(DataService);
  private readonly ref = inject(MatDialogRef<EnvelopeDialogComponent>);
  private group(envelope: BudgetEnvelope) {
    return this.fb.group({id: envelope.id, isGlobal: envelope.isGlobal ?? false, name: [envelope.name, [Validators.required, Validators.pattern(/\S/)]],
      budget: [envelope.budget, [Validators.required, Validators.min(0.01)]]});
  }
  protected readonly newEnvelopeId = this.data.createEnvelope ? uuid() : undefined;
  readonly rows = new FormArray([
    ...(this.data.envelopes ?? []).filter(row => this.data.createEnvelope || !row.isGlobal),
    ...(this.newEnvelopeId ? [{id: this.newEnvelopeId, name: '', budget: 500, isGlobal: true}] : []),
  ].map(envelope => this.group(envelope)));
  saving = false;
  error = '';
  add(isGlobal = false) { this.rows.push(this.group({id: uuid(), name: '', budget: 500, isGlobal})); }
  spent(id: string) { return this.data.sankeyData.nodes.find(node => node.envelopeId === id)?.spent ?? 0; }
  async save() {
    if (this.rows.invalid || this.saving) return;
    const envelopes = this.rows.getRawValue().map(row => ({...row, name: row.name.trim()}));
    if (new Set(envelopes.map(row => `${row.isGlobal}:${row.name.toLowerCase()}`)).size !== envelopes.length) {
      this.error = 'Choose a different name for each envelope.'; return;
    }
    this.saving = true; this.error = ''; this.rows.disable(); this.ref.disableClose = true;
    try { await this.service.saveEnvelopes(this.data.month,
      envelopes.filter(row => !row.isGlobal).map(({isGlobal, ...row}) => row),
      this.data.createEnvelope ? envelopes.filter(row => row.isGlobal) : undefined,
      this.data.createEnvelope ? (this.data.envelopes ?? []).filter(row => row.isGlobal) : undefined);
      const created = this.data.createEnvelope
        ? envelopes.find(row => row.id === this.newEnvelopeId)
          ?? envelopes.find(row => !(this.data.envelopes ?? []).some(previous => previous.id === row.id))
        : undefined;
      this.ref.close(created ? {envelopeId: created.id} : true); }
    catch { this.error = 'Could not save envelopes. Your changes are still here; try again.'; }
    finally { this.saving = false; this.rows.enable(); this.ref.disableClose = false; }
  }
}
