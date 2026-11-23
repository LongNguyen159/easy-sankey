import { Component, Inject, ChangeDetectionStrategy, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MainPageSingleMonthComponent } from "../../../pages/main-page-single-month/main-page-single-month.component";
import { SingleMonthData } from '../../models';
import { CategoryService } from '../../../services/category.service';
import { CurrencyService } from '../../../services/currency.service';

export interface MainPageDialogData {
  monthData: SingleMonthData;
  categoryId?: string;
}

@Component({
    selector: 'app-main-page-dialog',
    imports: [MatDialogModule, MatButtonModule, MainPageSingleMonthComponent, CurrencyPipe],
    templateUrl: './main-page-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './main-page-dialog.component.scss'
})
export class MainPageDialogComponent {
  protected readonly categoryService = inject(CategoryService);
  protected readonly currencyService = inject(CurrencyService);

  constructor(
    public dialogRef: MatDialogRef<MainPageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public dialogData: MainPageDialogData
  ) {}

  protected get categorySpending(): number {
    return this.dialogData.monthData.pieData.find(item => item.name === this.dialogData.categoryId)?.value ?? 0;
  }
}
