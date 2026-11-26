import { Component, effect, inject, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { BarSeriesOption, EChartsOption, format } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { DataService } from '../../../services/data.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { CurrencyService } from '../../../services/currency.service';
import { PieData, TreeNode } from '../../models';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
@Component({
    selector: 'app-pie-chart',
    imports: [NgxEchartsDirective, CommonModule, MatButtonToggleModule],
    providers: [
        provideAppEcharts(),
        CurrencyPipe
    ],
    templateUrl: './pie-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './pie-chart.component.scss'
})
export class PieChartComponent extends BaseChartComponent implements OnChanges {
  @Input() pieChartData: PieData[] = []
  @Input() treeMapData: TreeNode[] = []
  @Input() chartTitle: string = ''
  @Input() chartDescription: string = ''

  @Input() showPieChart: boolean = true

  @Input() totalExpenses: number = -1
  @Input() totalIncome: number = -1

  @Input() chartHeight: string = '70vh'


  dataService = inject(DataService)
  currencyPipe = inject(CurrencyPipe)
  currencyService = inject(CurrencyService)

  chartType: 'pie' | 'bar' | 'stacked' = 'pie'
  readonly hiddenBars = new Set<string>()
  barLegend: (PieData & { itemStyle: { color: string } })[] = []
  visibleBarCount = 0
  barOption: EChartsOption = {}
  pieOption: EChartsOption = this.getBaseChartOptions()
  pieMergeOption: EChartsOption = {}

  constructor() {
    super()
    effect(() => {
      this.updateChart();
    });
  }

  getBaseChartOptions(total = 0): EChartsOption {
    return {
      color: this.colorService.isDarkMode() ? this.colorService.chartColorPaletteDark : this.colorService.chartColorPaletteLight,
      tooltip: {
        trigger: 'item',
        backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundSecondary : this.colorService.lightBackgroundPrimary,
        textStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        formatter: (params: any) => {
          const value = this.currencyPipe.transform(params.value, this.currencyService.getSelectedCurrency());
          const percent = params.percent ?? (total ? (params.value / total * 100).toFixed(2) : '0');
          return `${format.encodeHTML(this.categoryService.label(params.data.name ?? params.name))}: <b>${value} (${percent}%)</b>`;
        }
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        textStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        formatter: (name: string) => {
          return this.categoryService.label(name);
        }
      },
      toolbox: {
        right: 20,
        feature: {
          saveAsImage: {
            name: `${this.chartTitle}_${this.dataService.getTodaysDate()}`,
            backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundPrimary : this.colorService.lightBackgroundPrimary,
          },
        },
      },
      series: []
    }
  }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pieChartData'] || changes['treeMapData'] || changes['chartTitle']) {
      this.updateChart()
    }
  }

  setChartType(type: typeof this.chartType): void {
    this.chartType = type;
    if (type !== 'pie') {
      this.updateBarChart();
    }
  }

  toggleBar(name: string): void {
    if (!this.hiddenBars.delete(name)) {
      this.hiddenBars.add(name);
    }
    this.updateBarChart();
  }

  updateChart() {

    const isDarkMode = this.colorService.isDarkMode();
    const colorPalette = isDarkMode
      ? this.colorService.chartColorPaletteDark 
      : this.colorService.chartColorPaletteLight;

    // Create a staggered color assignment for slices
    const colorAssignedData = this.pieChartData.map((data, index) => {
      // Shift the color start after each full cycle to avoid adjacent slices having the same color
      const colorIndex = (index + Math.floor(index / colorPalette.length)) % colorPalette.length;
      return {
        ...data,
        itemStyle: {
          // Assign the color based on the shifted index
          color: this.categoryService.color(data.name, isDarkMode) ?? colorPalette[colorIndex]
        }
      };
    });
    
    this.barLegend = [...colorAssignedData].sort((a, b) => b.value - a.value);
    this.updateBarChart();

    this.pieMergeOption = {
      ...this.getBaseChartOptions(),
      series: [
        {
          type: 'pie',
          radius: '50%',
          data: colorAssignedData,
          emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
          label: {
            formatter: (params: any) =>  {
              return `${this.categoryService.label(params.name)}: ${params.value.toLocaleString('en-US')} (${params.percent.toLocaleString('en-US')}%)`;
            },
            fontSize: 12,
            color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary
          },
          padAngle: 0.5,
          avoidLabelOverlap: true,
          itemStyle: {
            borderWidth: 0, // Adjust thickness for the gap
            borderColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundPrimary : this.colorService.lightBackgroundPrimary, // Use a contrasting color for the gap
            borderRadius: 6,
            borderJoin: "round"
          }
        }
      ]
    }
  }

  private updateBarChart(): void {
    const visibleBars = this.barLegend.filter(item => !this.hiddenBars.has(item.name));
    this.visibleBarCount = visibleBars.length;
    const total = this.barLegend.reduce((sum, item) => sum + item.value, 0);
    const textColor = this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary;
    this.barOption = {
      ...this.getBaseChartOptions(total),
      legend: { show: false },
      grid: { top: 40, right: 35, bottom: 35, left: 16, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: textColor }
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: visibleBars.map(item => item.name),
        axisLabel: {
          color: textColor,
          width: 160,
          overflow: 'truncate',
          formatter: name => this.categoryService.label(name)
        }
      },
      series: this.chartType === 'stacked' ? this.getStackedSeries(visibleBars) : [{
        type: 'bar',
        data: visibleBars,
        barMaxWidth: 32,
        itemStyle: { borderRadius: 6 }
      }]
    };
  }

  private getStackedSeries(bars: typeof this.barLegend): BarSeriesOption[] {
    const categories = new Map(this.treeMapData.map(node => [node.name, node]));
    const rows = bars.map(bar => {
      const category = categories.get(bar.name);
      const segments = category?.children.length ? this.getEntrySegments(category) : [bar];
      segments.sort((a, b) => b.value - a.value);
      return segments.map((segment, index) => ({
        name: segment.name,
        value: segment.value,
        itemStyle: {
          color: bar.itemStyle.color,
          opacity: index % 2 === 0 ? 1 : 0.65
        }
      }));
    });

    const segmentCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    return Array.from({ length: segmentCount }, (_, index) => ({
      type: 'bar',
      stack: 'entries',
      stackStrategy: 'all',
      barMaxWidth: 32,
      data: rows.map(row => row[index] ?? '-')
    }));
  }

  private getEntrySegments(node: TreeNode): PieData[] {
    if (node.children.length === 0) {
      return [{ name: node.name, value: node.value }];
    }

    const segments = node.children.flatMap(child => this.getEntrySegments(child));
    // A parent can have its own amount in addition to the amounts of its children.
    const remainder = node.value - node.children.reduce((sum, child) => sum + child.value, 0);
    if (remainder > 0) {
      segments.push({ name: node.name, value: remainder });
    }
    return segments;
  }
}
