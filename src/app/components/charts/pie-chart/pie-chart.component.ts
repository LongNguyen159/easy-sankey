import { Component, effect, ElementRef, inject, Input, OnChanges, SimpleChanges, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { BarSeriesOption, EChartsOption, color, format } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { DataService } from '../../../services/data.service';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CurrencyService } from '../../../services/currency.service';
import { PieData, SavingsMetrics, TreeNode } from '../../models';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
import { TreemapChartComponent } from '../treemap-chart/treemap-chart.component';

type DistributionView = 'pie' | 'totals' | 'stacked' | 'treemap' | 'sunburst';

@Component({
    selector: 'app-pie-chart',
    imports: [NgxEchartsDirective, CommonModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatMenuModule, MatSlideToggleModule, TreemapChartComponent],
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
  @Input() regularExpenseTree?: TreeNode[];
  @Input() savings?: SavingsMetrics;
  expenseDistribution = false;

  get regularExpenses(): number {
    return this.regularExpenseTree?.reduce((total, node) => total + node.value, 0) ?? 0;
  }

  get distributionTree(): TreeNode[] {
    return this.expenseDistribution ? this.regularExpenseTree ?? [] : this.treeMapData;
  }

  setExpenseDistribution(expensesOnly: boolean): void {
    this.expenseDistribution = expensesOnly;
    this.hiddenBars.clear();
    this.updateChart();
  }
  @Input() chartTitle: string = ''
  @Input() chartDescription: string = ''

  @Input() showBreakdown = false

  @Input() totalExpenses: number = -1
  @Input() totalIncome: number = -1

  @Input() chartHeight: string = '70vh'

  @ViewChild('chartContent') private chartContent?: ElementRef<HTMLElement>;
  private chartFade?: Animation;


  dataService = inject(DataService)
  currencyPipe = inject(CurrencyPipe)
  currencyService = inject(CurrencyService)

  readonly barViews = [
    { id: 'totals', label: 'Total bars' },
    { id: 'stacked', label: 'Stacked bars' }
  ] as const;
  readonly breakdownViews = [
    { id: 'treemap', label: 'Tree Map' },
    { id: 'sunburst', label: 'Sunburst' }
  ] as const;
  chartView: DistributionView = 'pie';
  private lastBarView: 'totals' | 'stacked' = 'totals';
  private lastBreakdownView: 'treemap' | 'sunburst' = 'treemap';
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
        ...this.getTooltipStyle(),
        trigger: 'item',
        formatter: (params: any) => {
          const value = this.currencyPipe.transform(params.value, this.currencyService.getSelectedCurrency());
          const name = params.data.name ?? params.name;
          const { categoryName, categoryTotal } = params.data;
          if (categoryTotal !== undefined) {
            return this.formatDistributionTooltip(name, value, params.value, total, {
              name: categoryName,
              value: categoryTotal
            });
          }
          const percent = params.percent ?? (total ? (params.value / total * 100).toFixed(2) : '0');
          return `${format.encodeHTML(this.categoryService.label(name))}: <b>${value} (${percent}%)</b>`;
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
    if (changes['pieChartData'] || changes['treeMapData'] || changes['regularExpenseTree'] || changes['chartTitle']) {
      this.updateChart()
    }
  }

  get chartGroup(): 'pie' | 'bars' | 'breakdown' {
    switch (this.chartView) {
      case 'pie': return 'pie';
      case 'totals':
      case 'stacked': return 'bars';
      default: return 'breakdown';
    }
  }

  setChartGroup(group: 'pie' | 'bars' | 'breakdown'): void {
    const views = { pie: 'pie', bars: this.lastBarView, breakdown: this.lastBreakdownView } as const;
    this.setChartView(views[group], group === 'breakdown' && views[group] === 'treemap');
  }

  setChartView(view: DistributionView, fadeIn = false): void {
    if (view === this.chartView) {
      return;
    }

    this.chartView = view;
    if (view === 'totals' || view === 'stacked') {
      this.lastBarView = view;
      this.updateBarChart();
    } else if (view === 'treemap' || view === 'sunburst') {
      this.lastBreakdownView = view;
    }

    const content = this.chartContent?.nativeElement;
    this.chartFade?.cancel();
    if (fadeIn && content
      && !content.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.chartFade = content.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        easing: 'ease-in-out'
      });
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
    const data = this.expenseDistribution ? this.distributionTree : this.pieChartData;
    const colorAssignedData = data.map((data, index) => {
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
      grid: { top: 40, right: 35, bottom: 55, left: 16, containLabel: true },
      xAxis: {
        type: 'value',
        name: `Amount (${this.currencyService.getSelectedCurrency()})`,
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { color: textColor },
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
      series: this.chartView === 'stacked' ? this.getStackedSeries(visibleBars) : [{
        type: 'bar',
        data: visibleBars,
        barMaxWidth: 32,
        itemStyle: { borderRadius: 6 }
      }]
    };
  }

  private getStackedSeries(bars: typeof this.barLegend): BarSeriesOption[] {
    const isDarkMode = this.colorService.isDarkMode();
    const separatorColor = isDarkMode
      ? this.colorService.darkBackgroundPrimary
      : this.colorService.lightBackgroundPrimary;
    const categories = new Map(this.distributionTree.map(node => [node.name, node]));
    const rows = bars.map(bar => {
      const category = categories.get(bar.name);
      const segments = category?.children.length ? this.getEntrySegments(category) : [bar];
      segments.sort((a, b) => b.value - a.value);
      const baseColor = bar.itemStyle.color;
      const shadeTarget = isDarkMode && color.lum(baseColor, 0) < 0.5 ? '#ffffff' : '#000000';
      const alternateColor = color.lerp(isDarkMode ? 0.45 : 0.25, [baseColor, shadeTarget]);
      return segments.map((segment, index) => ({
        name: segment.name,
        value: segment.value,
        categoryName: bar.name,
        categoryTotal: bar.value,
        itemStyle: {
          color: index % 2 === 0 ? baseColor : alternateColor,
          borderColor: separatorColor,
          borderWidth: segments.length > 1 ? 0.5 : 0
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
