import { CategoryService } from '../../services/category.service';

import { Component, inject, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { EChartsType } from 'echarts';
import { NgxEchartsDirective, provideEcharts } from 'ngx-echarts';
import { ColorService } from '../../services/color.service';

@Component({
    selector: 'app-base-chart',
    imports: [NgxEchartsDirective],
    providers: [
        provideEcharts(),
    ],
    templateUrl: './base-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './base-chart.component.scss'
})
export class BaseChartComponent implements OnDestroy {
  protected colorService = inject(ColorService)
  protected readonly categoryService = inject(CategoryService);
  protected _chartInstance?: EChartsType

  /** On chart init, assign chart instance. */
  onChartInit(chart: EChartsType) {
    this._chartInstance = chart;
  }

  ngOnDestroy(): void {
  }
}
