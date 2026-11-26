import { CategoryService } from '../../services/category.service';

import { Component, inject, NgZone, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { EChartsType, format } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from './echarts.provider';
import { ColorService } from '../../services/color.service';

@Component({
    selector: 'app-base-chart',
    imports: [NgxEchartsDirective],
    providers: [
        provideAppEcharts(),
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

  protected formatDistributionTooltip(
    name: string,
    formattedValue: string | null,
    value: number,
    total: number,
    parent?: { name: string; value: number }
  ): string {
    const share = (denominator: number) =>
      denominator ? `${(value / denominator * 100).toFixed(2)}%` : '—';
    const row = (label: string, content: string) =>
      `<div style="display: flex; justify-content: space-between; gap: 8px;">
        <span>${label}</span><strong>${content}</strong>
      </div>`;

    return `<div style="text-align: left; font-size: 14px; line-height: 1.5;">
      <strong>${format.encodeHTML(this.categoryService.label(name) || 'Total')}</strong>
      ${row('Value:', format.encodeHTML(formattedValue ?? ''))}
      ${row('Share of Total:', share(total))}
      ${parent ? row(`Share of ${format.encodeHTML(this.categoryService.label(parent.name))}:`, share(parent.value)) : ''}
    </div>`;
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
