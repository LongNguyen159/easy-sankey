import { CategoryService } from '../../services/category.service';

import { Component, inject, NgZone, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
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
  private readonly zone = inject(NgZone);
  protected _chartInstance?: EChartsType

  /** On chart init, assign chart instance. */
  onChartInit(chart: EChartsType) {
    this._chartInstance = chart;
  }

  protected bindMonthSelection(
    chart: EChartsType,
    monthAt: (index: number) => string | undefined,
    selectMonth: (month: string) => void
  ): void {
    const renderer = chart.getZr();
    const monthAtPoint = (x: number, y: number) => {
      if (!chart.containPixel({gridIndex: 0}, [x, y])) {
        return undefined;
      }
      const index = chart.convertFromPixel({xAxisIndex: 0}, x);
      return typeof index === 'number' ? monthAt(index) : undefined;
    };

    renderer.on('mousemove', ({offsetX, offsetY}) => {
      if (monthAtPoint(offsetX, offsetY)) {
        renderer.setCursorStyle('pointer');
      }
    });
    renderer.on('click', ({offsetX, offsetY}) => {
      const month = monthAtPoint(offsetX, offsetY);
      if (month) {
        this.zone.run(() => selectMonth(month));
      }
    });
  }

  ngOnDestroy(): void {
  }
}
