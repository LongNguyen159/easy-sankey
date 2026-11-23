import { Component, effect, inject, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { EChartsOption, format } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { DataService } from '../../../services/data.service';
import { ColorService } from '../../../services/color.service';
import { CurrencyService } from '../../../services/currency.service';
import { PieData } from '../../models';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
@Component({
    selector: 'app-pie-chart',
    imports: [NgxEchartsDirective, CommonModule],
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
  @Input() chartTitle: string = ''
  @Input() chartDescription: string = ''

  @Input() showPieChart: boolean = true

  @Input() totalExpenses: number = -1
  @Input() totalIncome: number = -1

  @Input() chartHeight: string = '70vh'


  dataService = inject(DataService)
  currencyPipe = inject(CurrencyPipe)
  currencyService = inject(CurrencyService)

  pieOption: EChartsOption = this.getBaseChartOptions()
  pieMergeOption: EChartsOption = {}

  constructor() {
    super()
    effect(() => {
      this.updateChart();
    });
  }

  getBaseChartOptions(): EChartsOption {
    return {
      color: this.colorService.isDarkMode() ? this.colorService.chartColorPaletteDark : this.colorService.chartColorPaletteLight,
      tooltip: {
        trigger: 'item',
        backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundSecondary : this.colorService.lightBackgroundPrimary,
        textStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        formatter: (params: any) => {
          // Use toLocaleString to format the value
          const value = this.currencyPipe.transform(params.data.value, this.currencyService.getSelectedCurrency()); // Format the value
          return `${format.encodeHTML(this.categoryService.label(params.name))}: <b>${value} (${params.percent}%)</b>`; // Bold the params.name
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
    if (changes && changes['pieChartData']) {
      this.updateChart()
    }
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
}
