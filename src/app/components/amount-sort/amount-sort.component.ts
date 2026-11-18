import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AmountSort } from '../../utils/amount-sort';

@Component({
  selector: 'app-amount-sort',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    <button mat-button type="button" [matMenuTriggerFor]="menu">
      <mat-icon fontSet="material-symbols-outlined">sort</mat-icon>
      Sort by: {{ labels[value()] }}
    </button>
    <mat-menu #menu="matMenu" xPosition="before">
      @for (option of options; track option) {
        <button mat-menu-item type="button" role="menuitemradio"
          [attr.aria-checked]="value() === option" (click)="valueChange.emit(option)">
          {{ labels[option] }}
        </button>
      }
    </mat-menu>
  `,
})
export class AmountSortComponent {
  readonly value = input.required<AmountSort>();
  readonly valueChange = output<AmountSort>();
  protected readonly options: AmountSort[] = ['manual', 'highest', 'lowest'];
  protected readonly labels: Record<AmountSort, string> = {
    manual: 'Manual',
    highest: 'Highest first',
    lowest: 'Lowest first',
  };
}
