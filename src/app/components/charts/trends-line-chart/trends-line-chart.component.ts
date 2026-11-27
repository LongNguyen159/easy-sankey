import { Component, effect, inject, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, output } from '@angular/core';
import { BarSeriesOption, CustomSeriesOption, EChartsOption, EChartsType, format, LineSeriesOption, SeriesOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
import { TrendsLineChartData } from '../../models';
import { MONTHS_TO_PREDICT } from '../../../utils/utils';
import { CurrencyPipe } from '@angular/common';
import { CurrencyService } from '../../../services/currency.service';
import { isArray } from 'mathjs';

@Component({
    selector: 'app-trends-line-chart',
    imports: [NgxEchartsDirective],
    providers: [
        provideAppEcharts(),
        CurrencyPipe
    ],
    templateUrl: './trends-line-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './trends-line-chart.component.scss'
})
export class TrendsLineChartComponent extends BaseChartComponent implements OnChanges {
  @Input() chartData: TrendsLineChartData[] = [];
  readonly monthSelected = output<string>();
  @Input() showCategories: boolean = false;

  @Input() stackCategories: boolean = true;

  chartOptions: EChartsOption = this.getBaseOptions()
  mergeOptions: EChartsOption
  currencyPipe = inject(CurrencyPipe)
  currencyService = inject(CurrencyService)
  

  xAxisData: string[] = []
  isPredictionAvailable: boolean = false

  constructor() {
    super()
    effect(() => {
      this.updateChart();
    })
  }

  override onChartInit(chart: EChartsType): void {
    super.onChartInit(chart);
    chart.on('legendselectchanged', event => {
      if (!this.showCategories) return;
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
    const categories = this.showCategories ? this.getSortedCategories() : [];
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
        borderColor: this.colorService.isDarkMode() ? '#484753' : '#E0E6F1',
        borderWidth: 2,
        borderRadius: 16,
        trigger: 'axis',
        axisPointer: {
          type: this.showCategories ? 'shadow' : 'line',
        },
        backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundSecondary : this.colorService.lightBackgroundPrimary,
        textStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        formatter: (params: any) => {
          if (!params.length) return "";
          const items = this.showCategories
            ? params.filter((item: { seriesType: string }) => item.seriesType === 'bar')
            : params;
          return items.length ? this.getCustomTooltip(items, items[0].seriesType) : '';
        },
      },
      legend: {
        type: 'scroll',
        itemGap: 22, // Space between legend items
        width: '80%',
        padding: 12,
        itemStyle: {
          opacity: this.showCategories ? 1 : 0,
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
        data: !this.showCategories ? 
        [
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
        ].filter(item => this.chartData.some(entry => entry.isPrediction) || !item.name.startsWith('Forecasted')) : categories
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
      series: this.showCategories ? this._getCategoriesSeries(categories) : this._getIncomeGrowthAndExpenseSeries(totalExpenses, totalNetIncome),
    };

    this.mergeOptions = finalOptions;
  }

  /** TODO:
   * Also map [x, y] pairs for the bar series. So this tooltip we will all use item.value[1] instead of item.value
   * 
   * Additionally, apply a different style fo the bars for predicted series.
   */
  getCustomTooltip(params: any, seriesType: string): string {
    // Filter out items with value 0
    const visibleParams = params.filter((item: any) => isArray(item.value) ?  item.value[1] !== 0 : item.value !== 0);
    
    // If series type is bar chart, calculate total
    let tooltip = `${params[0].axisValueLabel}<br>`;
    

    if (seriesType === 'bar') {
      // Calculate the total sum of values for the visible items (only for bar chart)
      const total = this.stackCategories
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
    } else {
      // For other series types, just show the individual items without the total
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
    }
  
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

  private _getCategoriesSeries(allCategories: string[]): SeriesOption[] {
    const categorySeries: BarSeriesOption[] = allCategories.map(category => ({
      name: category,
      type: 'bar',
      showSymbol: false,
      itemStyle: {
        color: this.categoryService.color(category, this.colorService.isDarkMode()),
        opacity: 0.9,
      },
      stack: this.stackCategories ? 'categories' : '',
      barCategoryGap: this.stackCategories ? undefined : '24%',
      data: this.xAxisData.map(month => {
        // Find the month's data
        const monthData = this.chartData.find(data => data.month === month);
        
        
        // Find the category value for this month
        const categoryData = monthData?.categories.find(
          cat => cat.name === category
        );
        
        return Math.round((categoryData?.value || 0) * 100) / 100; // Default to 0 if missing
      }),
    }));
  
    const selected = this._chartInstance?.getOption()?.['legend'] as { selected?: Record<string, boolean> }[] | undefined;
    const firstVisibleSeries = categorySeries.find(series => selected?.[0]?.selected?.[series.name as string] !== false);
    if (firstVisibleSeries) firstVisibleSeries.markArea = this.getCategoryForecastArea();
    if (this.stackCategories || !categorySeries.length) return categorySeries;

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

    this.isPredictionAvailable = predictedExpenses.length > 0 || predictedNetIncome.length > 0;


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
  }}
