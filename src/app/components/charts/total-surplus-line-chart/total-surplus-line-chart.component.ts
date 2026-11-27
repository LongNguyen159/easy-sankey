import { Component, Input, OnChanges, SimpleChanges, effect, inject, ChangeDetectionStrategy, output } from '@angular/core';
import { EChartsOption, EChartsType } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { TrendsLineChartData } from '../../models';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
import { CurrencyPipe } from '@angular/common';
import { CurrencyService } from '../../../services/currency.service';
import { MONTHS_TO_PREDICT } from '../../../utils/utils';

@Component({
    selector: 'app-total-surplus-line-chart',
    imports: [NgxEchartsDirective],
    providers: [
        provideAppEcharts(),
        CurrencyPipe
    ],
    templateUrl: './total-surplus-line-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./total-surplus-line-chart.component.scss']
})
export class TotalSurplusLineChartComponent extends BaseChartComponent implements OnChanges {
  @Input() chartData: TrendsLineChartData[] = [];
  readonly monthSelected = output<string>();

  private legendSelection: Record<string, boolean> = {
    Invested: false,
    'Cumulative cash surplus': false,
    'Forecasted cumulative cash surplus': false,
  };

  chartOptions: EChartsOption = this.getBaseOption()
  mergeOptions: EChartsOption = {};
  currencyPipe = inject(CurrencyPipe);
  currencyService = inject(CurrencyService);

  constructor() {
    super()
    effect(() => {
      this.updateChart();
    })
  }

  override onChartInit(chart: EChartsType): void {
    super.onChartInit(chart);
    chart.on('legendselectchanged', event => {
      this.legendSelection = (event as { selected: Record<string, boolean> }).selected;
    });
    this.bindMonthSelection(chart, index => {
      const entry = this.chartData[index];
      return entry && !entry.isPrediction && !entry.isMissing ? entry.month : undefined;
    }, month => this.monthSelected.emit(month));
  }

  getBaseOption(): EChartsOption {
    return {
      tooltip: {
        borderColor: this.colorService.isDarkMode() ? '#484753' : '#E0E6F1',
        borderWidth: 2,
        borderRadius: 16,
        trigger: 'axis',
        backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundSecondary : this.colorService.lightBackgroundPrimary,
        textStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        formatter: (param: any) => {
          return this.getCustomTooltip(param);
        }
      },
      legend: {
        type: 'scroll',
        selected: this.legendSelection,
        itemGap: 22,
        textStyle: {
          padding: 8,
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        itemStyle: {
          opacity: 0,
        },
        lineStyle: {
          width: 10,
          inactiveWidth: 8,
          cap: 'round',
        },
        data: [
          { name: 'Monthly savings' },
          {
            name: 'Cash surplus',
          },
          { name: 'Invested' },
          {
            name: 'Cumulative cash surplus',
          }, 
          {
            name: 'Forecasted cash surplus',
            lineStyle: {
              opacity: 1,
              width: 4,
              color: 'inherit',
            }
          }, 
          
          {
            name: 'Forecasted cumulative cash surplus',
            lineStyle: {
              opacity: 1,
              width: 4,
              color: 'inherit',
            }
          }, 
        ].filter(item => this.chartData.some(entry => entry.isPrediction) || !item.name.startsWith('Forecasted'))
      },
      grid: { top: 84, containLabel: true },
      xAxis: {
        type: 'category',
        data: [],
        axisLine: {
          lineStyle: {
            color: this.colorService.isDarkMode() ? '#B0B0B0' : this.colorService.lightTextSecondary,
            width: 1.5,
          },
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) =>
            this.currencyPipe.transform(value, this.currencyService.getSelectedCurrency(), 'symbol', '1.0-2') ?? '',
        },
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
      series: [],
      dataZoom: [
        {
          type: 'inside',
        }
      ]
    };

  }

  getCustomTooltip(params: any): string {
    const order = ['Monthly savings', 'Cash surplus', 'Invested'];
    const rows = params.filter((item: any) => item.value?.[1] != null);
    const index = rows[0]?.value[0];
    const month = this.chartData[index];
    if (month?.savings && !month.isMissing && !month.isPrediction &&
        !rows.some((item: any) => item.seriesName === 'Invested')) {
      rows.push({ marker: '', seriesName: 'Invested', value: [index, month.savings.investments] });
    }
    rows.sort((a: any, b: any) =>
      (order.includes(a.seriesName) ? order.indexOf(a.seriesName) : order.length) -
      (order.includes(b.seriesName) ? order.indexOf(b.seriesName) : order.length));
    
    let tooltip = `${params[0]?.axisValueLabel ?? ''}<br>`;
    tooltip += rows.map((item: any) => `
      <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
        <div style="flex: 1; display: flex; align-items: center;">
          ${item.marker} ${item.seriesName}:
        </div>
        <div style="width: 22px;"></div>
        <div style="flex: 1; text-align: right;">
          <strong>${this.currencyPipe.transform(item.value[1], this.currencyService.getSelectedCurrency())}</strong>
        </div>
      </div>`).join('');
  
    return tooltip;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes && changes['chartData']) {
      this.updateChart();
    }
  }

  updateChart() {
    const colors = this.colorService.isDarkMode()
      ? { cashSurplus: '#ff7f50', cumulativeCashSurplus: '#1e90ff', investments: '#e879f9', totalSavings: '#86efac' }
      : { cashSurplus: '#ff6f00', cumulativeCashSurplus: '#4682b4', investments: '#a21caf', totalSavings: '#15803d' };

    const months = this.chartData.map(data => data.month);
    const surplusValues = this.chartData.map(data => data.surplus);
    const balanceValues = this.chartData.map(data => data.balance);


    // Split the data into actual and predicted segments
    const {
      actualSurplusValues,
      predictedSurplusValues,
      actualBalance,
      predictedBalance,
      missingMonths,
    } = this.chartData.reduce(
      (acc, data, index) => {
        if (data.isPrediction) {
          // Pad the prediction series with the last actual value
          if (!acc.hasPredictionStarted && acc.actualSurplusValues.length > 0) {
            const lastActualIndex = acc.actualSurplusValues.at(-1)![0];
            const lastActualSurplus = acc.actualSurplusValues.at(-1)![1];
            const lastActualBalance = acc.actualBalance.at(-1)![1];
  
            acc.predictedSurplusValues.push([lastActualIndex, lastActualSurplus]);
            acc.predictedBalance.push([lastActualIndex, lastActualBalance]);
            acc.hasPredictionStarted = true;
          }
          acc.predictedSurplusValues.push([index, surplusValues[index]]);
          acc.predictedBalance.push([index, balanceValues[index]]);
        } else {
          acc.actualSurplusValues.push([index, surplusValues[index]]);
          acc.actualBalance.push([index, balanceValues[index]]);

          if (data.isMissing) {
            acc.missingMonths.push(index);
          }
        }
        return acc;
      },
      {
        actualSurplusValues: [] as [number, number][],
        predictedSurplusValues: [] as [number, number][],
        actualBalance: [] as [number, number][],
        predictedBalance: [] as [number, number][],
        missingMonths: [] as number[],
        hasPredictionStarted: false,
      }
    );
  

    // const markAreas: any = missingMonths.map(index => (
    //   [
    //     {
    //       xAxis: months[index - 1]
    //     },
    //     {
    //       xAxis: months[index + 1]
    //     }
    //   ]
    // ));

    const markLine: any = missingMonths.map(i => ({
      xAxis: months[i],
    }))

    this.mergeOptions = {
      ...this.getBaseOption(),
      xAxis: {
        type: 'category',
        data: months,
        axisLine: {
          lineStyle: {
            color: this.colorService.isDarkMode() ? '#B0B0B0' : this.colorService.lightTextSecondary,
            width: 1.5,
          },
        },
      },
      series: [
        {
          name: 'Cash surplus',
          type: 'line',
          data: actualSurplusValues.map(([x, y]) => [x, Math.round(y * 100) / 100]),
          showSymbol: false,
          itemStyle: {
            color: colors.cashSurplus,
          },
          lineStyle: {
            width: 2,
            color: colors.cashSurplus,
          },

          markLine: {
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
            data: markLine
          }
        },
        {
          name: 'Cumulative cash surplus',
          type: 'line',
          data: actualBalance.map(([x, y]) => [x, Math.round(y * 100) / 100]),
          showSymbol: false,
          itemStyle: {
            color: colors.cumulativeCashSurplus,
          },
          lineStyle: {
            width: 2,
            color: colors.cumulativeCashSurplus,
          },
        },
        {
          name: 'Forecasted cumulative cash surplus',
          type: 'line',
          data: predictedBalance.map(([x, y]) => [x, Math.round(y * 100) / 100]),
          showSymbol: false,
          itemStyle: {
            color: colors.cumulativeCashSurplus,
          },
          lineStyle: {
            width: 2,
            type: 'dashed',
            color: colors.cumulativeCashSurplus,
          },
        },

        {
          name: 'Forecasted cash surplus',
          type: 'line',
          data: predictedSurplusValues.map(([x, y]) => [x, Math.round(y * 100) / 100]),
          showSymbol: false,
          itemStyle: {
            color: colors.cashSurplus,
          },
          lineStyle: {
            width: 2,
            type: 'dashed',
            color: colors.cashSurplus,
          },
          markArea: predictedSurplusValues.length > 0 ? {
            itemStyle: {
              color: this.colorService.isDarkMode() ? 'rgba(225, 225, 225, 0.1)' : 'rgba(100, 100, 100, 0.1)',
            },
            label: { show: false },
            data: [
              [
                {
                  xAxis: months[months.length - (MONTHS_TO_PREDICT + 1)]
                },
                {
                  xAxis: months[months.length - 1]
                }
              ],
            ]
          } : { data: [] },
        },
        ...([
          { name: 'Invested', key: 'investments', color: colors.investments },
          { name: 'Monthly savings', key: 'totalSavings', color: colors.totalSavings },
        ] as const).map(({ name, key, color }) => ({
          name,
          itemStyle: { color },
          lineStyle: { color, width: key === 'totalSavings' ? 3 : 2 },
          z: key === 'totalSavings' ? 3 : 2,
          type: 'line' as const,
          showSymbol: false,
          data: this.chartData.map((month, index): [number, number | null] =>
            [index, month.isMissing || month.isPrediction ? null : month.savings?.[key] ?? null]),
        })),
      ],
    };
  }
}
