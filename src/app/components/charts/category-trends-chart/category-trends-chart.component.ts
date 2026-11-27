import { Component, effect, inject, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, output } from '@angular/core';
import { BarSeriesOption, CustomSeriesOption, EChartsOption, EChartsType, format, LineSeriesOption, SeriesOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
import { MonthlyTrendChartData } from '../../models';
import { CurrencyPipe } from '@angular/common';
import { CurrencyService } from '../../../services/currency.service';

export type CategoryTrendsView = 'stacked-bars' | 'span-bars' | 'stacked-area';

@Component({
    selector: 'app-category-trends-chart',
    imports: [NgxEchartsDirective],
    providers: [
        provideAppEcharts(),
        CurrencyPipe
    ],
    templateUrl: './category-trends-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager
})
export class CategoryTrendsChartComponent extends BaseChartComponent implements OnChanges {
  @Input() chartData: Pick<MonthlyTrendChartData, 'month' | 'isPrediction' | 'isMissing' | 'categories'>[] = [];
  readonly monthSelected = output<string>();

  @Input() categoryView: CategoryTrendsView = 'stacked-bars';

  chartOptions: EChartsOption = this.getBaseOptions()
  mergeOptions: EChartsOption
  currencyPipe = inject(CurrencyPipe)
  currencyService = inject(CurrencyService)


  xAxisData: string[] = []

  constructor() {
    super()
    effect(() => {
      this.updateChart();
    })
  }

  override onChartInit(chart: EChartsType): void {
    super.onChartInit(chart);
    chart.on('legendselectchanged', event => {
      const { selected } = event as { selected: Record<string, boolean> };
      const categories = this.getSortedCategories();
      const activeCategory = categories.find(name => selected[name] !== false);
      chart.setOption({
        series: categories.map(name => ({
          name,
          markArea: (name === activeCategory ? this.getCategoryForecastArea() : undefined) ?? { data: [] },
        })),
      });
    });
    this.bindMonthSelection(chart, index => {
      const entry = this.chartData[index];
      return entry && !entry.isPrediction && !entry.isMissing ? entry.month : undefined;
    }, month => this.monthSelected.emit(month));
  }

  getBaseOptions(): EChartsOption {
    return {
      series: [],
    };
  }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes) {
      this.updateChart();
    }
  }


  updateChart() {
    const months = this.chartData.map(data => data.month);
    const categories = this.getSortedCategories();
    this.xAxisData = months;
    this.clearSeries();

    const finalOptions: EChartsOption = {
      color: this.colorService.isDarkMode() ? this.colorService.chartColorPaletteDark : this.colorService.chartColorPaletteLight,
      tooltip: {
        ...this.getTooltipStyle(),
        trigger: 'axis',
        axisPointer: {
          type: this.categoryView !== 'stacked-area' ? 'shadow' : 'line',
        },
        formatter: (params: any) => {
          if (!params.length) return "";
          const items = params.filter((item: { seriesType: string }) => item.seriesType !== 'custom');
          return items.length ? this.getCustomTooltip(items) : '';
        },
      },
      legend: {
        type: 'scroll',
        itemGap: 22, // Space between legend items
        width: '80%',
        padding: 12,
        lineStyle: {
          width: 10,
          inactiveWidth: 8,
          cap: 'round',
        },
        textStyle: {
          padding: 8,
          color: this.colorService.isDarkMode()
            ? this.colorService.darkTextPrimary
            : this.colorService.lightTextPrimary,
        },
        pageIconColor: this.colorService.isDarkMode() ? '#ffffff' : '#000000', // Arrows color
        pageIconInactiveColor: this.colorService.isDarkMode() ? '#555555' : '#cccccc', // Inactive arrow color
        pageTextStyle: {
          color: this.colorService.isDarkMode()
            ? this.colorService.darkTextPrimary
            : this.colorService.lightTextSecondary,
          fontSize: 12,
        },
        formatter: (name: string) => this.categoryService.label(name),
        data: categories,
      },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: {
          lineStyle: {
            color: this.colorService.isDarkMode() ? '#B0B0B0' : this.colorService.lightTextSecondary,
          },
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          show: true,
          lineStyle: {
            color: this.colorService.isDarkMode() ? '#484753' : '#E0E6F1',
          }
        },
        axisLine: {
          lineStyle: {
            color: this.colorService.isDarkMode() ? '#B0B0B0' : this.colorService.lightTextPrimary,
          },
        },
      },
      dataZoom: [
        {
          type: 'inside',
        }
      ],
      series: this.getCategorySeries(categories),
    };

    this.mergeOptions = finalOptions;
  }

  getCustomTooltip(params: any): string {
    const visibleParams = params.filter((item: { value: number }) => item.value !== 0);
    let tooltip = `${params[0].axisValueLabel}<br>`;

    const total = this.categoryView !== 'span-bars'
      ? visibleParams.reduce((sum: number, item: any) => sum + item.value, 0)
      : this.chartData[params[0].dataIndex].categories.reduce((sum, category) => sum + category.value, 0);

    // Show the largest category amounts first.
    visibleParams.sort((a: { value: number }, b: { value: number }) => b.value - a.value);
    tooltip += visibleParams.map((item: any) => `
      <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
        <div style="flex: 1; display: flex; align-items: center;">
          ${item.marker} ${format.encodeHTML(this.categoryService.label(item.seriesName))}:
        </div>
        <div style="width: 16px;"></div>
        <div style="flex: 1; text-align: right;">
          <strong>${Math.round(item.value * 100) / 100}</strong>
        </div>
      </div>`).join('');

    // Add a divider before the total
    tooltip += `<hr style="margin: 8px 0; border: 0; border-top: 1px solid #ccc;">`;

    // Add total at the bottom
    tooltip += `
      <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
        <div style="flex: 1; display: flex; align-items: center;">
          <strong>Total:</strong>
        </div>
        <div style="width: 16px;"></div>
        <div style="flex: 1; text-align: right;">
          <strong>${this.currencyPipe.transform(total, this.currencyService.getSelectedCurrency())}</strong>
        </div>
      </div>`;

    return tooltip;
  }

  /** Clear Chart series and data zoom */
  private clearSeries(): void {
    const options = this._chartInstance?.getOption();
    if (options) {
      this._chartInstance?.setOption({ ...options, series: [], dataZoom: [] }, true);
    }
  }



  /** Get Category Expenses data */
  private getSortedCategories(): string[] {
    const totals = new Map<string, number>();
    for (const month of this.chartData) {
      for (const { name, value } of month.categories) {
        totals.set(name, (totals.get(name) ?? 0) + (month.isPrediction ? 0 : value));
      }
    }
    return [...totals.entries()]
      .sort(([nameA, totalA], [nameB, totalB]) => totalB - totalA || nameA.localeCompare(nameB))
      .map(([name]) => name);
  }

  private getCategorySeries(allCategories: string[]): SeriesOption[] {
    const isSpan = this.categoryView === 'span-bars';
    const categorySeries = allCategories.map((category): BarSeriesOption | LineSeriesOption => {
      const color = this.categoryService.color(category, this.colorService.isDarkMode());
      const data = this.chartData.map(month => {
        const value = month.categories.find(item => item.name === category)?.value ?? 0;
        return Math.round(value * 100) / 100;
      });

      if (this.categoryView === 'stacked-area') {
        return {
          name: category,
          type: 'line',
          stack: 'categories',
          showSymbol: false,
          itemStyle: { color },
          lineStyle: { color, width: 1 },
          areaStyle: { color, opacity: 0.75 },
          data,
        };
      }

      return {
        name: category,
        type: 'bar',
        itemStyle: { color, opacity: 0.9 },
        stack: isSpan ? '' : 'categories',
        barCategoryGap: isSpan ? '24%' : undefined,
        data,
      };
    });

    const selected = this._chartInstance?.getOption()?.['legend'] as { selected?: Record<string, boolean> }[] | undefined;
    const firstVisibleSeries = categorySeries.find(series => selected?.[0]?.selected?.[series.name as string] !== false);
    if (firstVisibleSeries) firstVisibleSeries.markArea = this.getCategoryForecastArea();
    if (!isSpan || !categorySeries.length) return categorySeries;

    const totalSeries: CustomSeriesOption = {
      name: 'Monthly total',
      type: 'custom',
      z: 0,
      silent: true,
      clip: true,
      tooltip: { show: false },
      encode: { x: 0, y: 1 },
      data: this.chartData.map((month, index) => [
        index, month.categories.reduce((sum, category) => sum + category.value, 0),
      ]),
      renderItem: (_params, api) => {
        const [center, top] = api.coord([api.value(0), api.value(1)]);
        const [, baseline] = api.coord([api.value(0), 0]);
        const band = api.size?.([1, 0], [api.value(0), 0]);
        const width = (Array.isArray(band) ? band[0] : 0) * 0.76;
        return {
          type: 'rect',
          shape: { x: center - width / 2, y: Math.min(top, baseline), width, height: Math.abs(baseline - top) },
          style: { fill: this.colorService.isDarkMode() ? '#45454f' : '#dedee4' },
        };
      },
    };
    return [totalSeries, ...categorySeries];
  }

  private getCategoryForecastArea(): BarSeriesOption['markArea'] {
    const firstForecastMonth = this.chartData.find(month => month.isPrediction);
    if (!firstForecastMonth) return undefined;
    return {
      silent: true,
      itemStyle: {
        color: this.colorService.isDarkMode() ? 'rgba(225, 225, 225, 0.1)' : 'rgba(100, 100, 100, 0.1)',
      },
      label: {
        show: true,
        position: 'insideTop',
        color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
      },
      data: [[
        { name: 'Forecast', xAxis: firstForecastMonth.month },
        { xAxis: this.xAxisData.at(-1) },
      ]],
    };
  }
}
