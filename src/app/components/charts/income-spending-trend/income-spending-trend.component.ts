import { Component, effect, inject, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, output } from '@angular/core';
import { EChartsOption, EChartsType, format, LineSeriesOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
import { MonthlyTrendChartData } from '../../models';
import { MONTHS_TO_PREDICT } from '../../../utils/utils';
import { CurrencyPipe } from '@angular/common';
import { CurrencyService } from '../../../services/currency.service';

@Component({
    selector: 'app-income-spending-trend',
    imports: [NgxEchartsDirective],
    providers: [
        provideAppEcharts(),
        CurrencyPipe
    ],
    templateUrl: './income-spending-trend.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './income-spending-trend.component.scss'
})
export class IncomeSpendingTrendComponent extends BaseChartComponent implements OnChanges {
  @Input() chartData: Pick<MonthlyTrendChartData, 'month' | 'isPrediction' | 'isMissing' | 'totalNetIncome' | 'totalExpenses'>[] = [];
  readonly monthSelected = output<string>();

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
    this.xAxisData = months;
    // Extract financial trends
    const totalNetIncome = this.chartData.map(data => data.totalNetIncome);
    const totalExpenses = this.chartData.map(data => data.totalExpenses);

    /** Clear Series before changing chart type to avoid conflicts.
     *
    */
    this._clearSeries()

    const finalOptions: EChartsOption = {
      color: this.colorService.isDarkMode() ? this.colorService.chartColorPaletteDark : this.colorService.chartColorPaletteLight,
      tooltip: {
        ...this.getTooltipStyle(),
        trigger: 'axis',
        axisPointer: {
          type: 'line',
        },
        formatter: (params: any) => {
          if (!params.length) return "";
          return this.getCustomTooltip(params);
        },
      },
      legend: {
        type: 'scroll',
        itemGap: 22, // Space between legend items
        width: '80%',
        padding: 12,
        itemStyle: {
          opacity: 0,
        },
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
        data: [
          {
            name: 'Net Income',
          },
          {
            name: 'Expenses',
          },
          {
            name: 'Forecasted Net Income',
            lineStyle: {
              opacity: 1,
              width: 4,
              color: 'inherit',
            }
          },

          {
            name: 'Forecasted Expenses',
            lineStyle: {
              opacity: 1,
              width: 4,
              color: 'inherit',
            }
          },
        ].filter(item => this.chartData.some(entry => entry.isPrediction) || !item.name.startsWith('Forecasted'))
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
      series: this._getIncomeGrowthAndExpenseSeries(totalExpenses, totalNetIncome),
    };

    this.mergeOptions = finalOptions;
  }

  getCustomTooltip(params: any): string {
    // Filter out items with value 0
    const visibleParams = params.filter((item: any) => item.value[1] !== 0);

    let tooltip = `${params[0].axisValueLabel}<br>`;

    tooltip += visibleParams.map((item: any) => `
      <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
        <div style="flex: 1; display: flex; align-items: center;">
          ${item.marker} ${format.encodeHTML(this.categoryService.label(item.seriesName))}:
        </div>
        <div style="width: 16px;"></div>
        <div style="flex: 1; text-align: right;">
          <strong>${this.currencyPipe.transform(item.value[1], this.currencyService.getSelectedCurrency())}</strong>
        </div>
      </div>`).join('');

    return tooltip;
  }

  /** Clear Chart series and data zoom */
  private _clearSeries() {
    let tempChartOptions: any = this._chartInstance?.getOption()
    if(tempChartOptions) {
      tempChartOptions['series'] = []
      tempChartOptions['dataZoom'] = []
      this._chartInstance?.setOption(tempChartOptions, true)
    }
  }



  /** Get Income Growth & Expense Trends data */
  private _getIncomeGrowthAndExpenseSeries(totalExpenses: number[], totalNetIncome: number[]): LineSeriesOption[] {
    // Split the data into actual and predicted segments
    const actualExpenses = [];
    const predictedExpenses = [];
    const actualNetIncome = [];
    const predictedNetIncome = [];
    const missingMonths = []

    /** Map Series into [x, y] pairs. Because prediction series starts after real series. */
    for (let i = 0; i < this.chartData.length; i++) {
      if (this.chartData[i].isPrediction) {
        // Pad the prediction series with the last value of the real series
        if (predictedExpenses.length === 0 && actualExpenses.length > 0) {
          const lastIndex = actualExpenses[actualExpenses.length - 1][0];
          const lastValue = actualExpenses[actualExpenses.length - 1][1];
          predictedExpenses.push([lastIndex, lastValue]);
          predictedNetIncome.push([lastIndex, actualNetIncome[actualNetIncome.length - 1][1]]);
        }
        predictedExpenses.push([i, totalExpenses[i]]);
        predictedNetIncome.push([i, totalNetIncome[i]]);

      } else {
        actualExpenses.push([i, totalExpenses[i]]);
        actualNetIncome.push([i, totalNetIncome[i]]);
        if (this.chartData[i].isMissing) {
          missingMonths.push(i)
        }
      }

    }


    const markLines: any = missingMonths.flatMap(index => [
      { xAxis: this.xAxisData[index] }
    ]);


    const trendSeries: LineSeriesOption[] = [
      {
        name: 'Expenses',
        type: 'line',
        data: actualExpenses.map(([x, y]) => [x, Math.round(y * 100) / 100]),
        smooth: true,
        showSymbol: false,
        itemStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.redDarkMode : this.colorService.redLightMode, // Red for expense
        },
        lineStyle: {
          width: 2,
          color: this.colorService.isDarkMode() ? this.colorService.redDarkMode : this.colorService.redLightMode, // Red for expense
        },
        areaStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.redDarkMode : this.colorService.redLightMode, // Red for expense
          opacity: 0.3
        },

        markLine: {
          data: markLines,
          symbol: 'none',
          label: {
            formatter: 'Missing',
            color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
          },
          lineStyle: {
            type: 'dashed',
            cap: 'round',
            width: 2,
            color: '#a3a3a3',
          },
        }
      },
      {
        name: 'Forecasted Expenses',
        type: 'line',
        data: predictedExpenses.map(([x, y]) => [x, Math.round(y * 100) / 100]),
        smooth: true,
        showSymbol: false,
        itemStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.redDarkMode : this.colorService.redLightMode, // Red for expense
        },
        lineStyle: {
          width: 2,
          type: 'dashed',
          color: this.colorService.isDarkMode() ? this.colorService.redDarkMode : this.colorService.redLightMode, // Red for expense
        },
        areaStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.redDarkMode : this.colorService.redLightMode, // Red for expense
          opacity: 0.1
        },
        markArea: predictedNetIncome.length > 0 ? {
          itemStyle: {
            color: this.colorService.isDarkMode() ? 'rgba(225, 225, 225, 0.1)' : 'rgba(100, 100, 100, 0.1)', // Adjust color for light mode
          },
          label: {
            show: true,
            position: 'insideTop',
            color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
          },
          data: [
            [
              {
                name: 'Forecast',
                xAxis: this.xAxisData[this.xAxisData.length - (MONTHS_TO_PREDICT + 1)]
              },
              {
                xAxis: this.xAxisData[this.xAxisData.length - 1]
              }
            ],
          ]
        } : { data: [] },
      },
      {
        name: 'Net Income',
        type: 'line',
        data: actualNetIncome.map(([x, y]) => [x, Math.round(y * 100) / 100]),
        smooth: true,
        showSymbol: false,
        itemStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.greenDarkMode : this.colorService.greenLightMode, // Green for income
        },
        lineStyle: {
          width: 2,
          color: this.colorService.isDarkMode() ? this.colorService.greenDarkMode : this.colorService.greenLightMode, // Green for income
        },
        areaStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.greenDarkMode : this.colorService.greenLightMode, // Green
          opacity: 0.3
        }
      },
      {
        name: 'Forecasted Net Income',
        type: 'line',
        data: predictedNetIncome.map(([x, y]) => [x, Math.round(y * 100) / 100]),
        smooth: true,
        showSymbol: false,
        itemStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.greenDarkMode : this.colorService.greenLightMode, // Green for income
        },
        lineStyle: {
          width: 2,
          type: 'dashed',
          color: this.colorService.isDarkMode() ? this.colorService.greenDarkMode : this.colorService.greenLightMode, // Green for income
        },
        areaStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.greenDarkMode : this.colorService.greenLightMode, // Green
          opacity: 0.1
        }
      },
    ];
    return trendSeries;
  }
}
