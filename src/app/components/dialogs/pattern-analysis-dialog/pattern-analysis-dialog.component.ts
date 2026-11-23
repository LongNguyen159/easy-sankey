
import { Component, Inject, ChangeDetectionStrategy, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AbnormalityChartData } from '../../models';
import { CategoryRegressionChartComponent } from "../../charts/category-regression-chart/category-regression-chart.component";

@Component({
    selector: 'app-pattern-analysis-dialog',
    imports: [MatDialogModule, MatButtonModule, CategoryRegressionChartComponent],
    templateUrl: './pattern-analysis-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './pattern-analysis-dialog.component.scss'
})
export class PatternAnalysisDialogComponent {
  readonly monthSelected = output<string>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AbnormalityChartData
  ) {}
}
