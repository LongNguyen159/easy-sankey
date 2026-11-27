import { Component, effect, inject, Input, OnChanges, OnInit, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { EChartsOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { provideAppEcharts } from '../../../base-components/base-chart/echarts.provider';
import { TreeNode } from '../../models';
import { ColorService } from '../../../services/color.service';
import { MatButtonModule } from '@angular/material/button';
import { CurrencyPipe } from '@angular/common';
import { CurrencyService } from '../../../services/currency.service';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UiService } from '../../../services/ui.service';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
@Component({
    selector: 'app-treemap-chart',
    imports: [NgxEchartsDirective,
        MatButtonModule,
        MatButtonToggleModule,
        MatIconModule,
        MatTooltipModule
    ],
    providers: [
        provideAppEcharts(),
        CurrencyPipe
    ],
    templateUrl: './treemap-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './treemap-chart.component.scss'
})
export class TreemapChartComponent extends BaseChartComponent implements OnInit, OnChanges {
  @Input() chartType?: 'treemap' | 'sunburst';
  @Input() treeData: TreeNode[] = []
  @Input() totalExpenses: number = -1
  @Input() totalNetIncome: number = -1

  @Input() actionsPosition: 'top' | 'bottom' = 'bottom'

  currencyPipe = inject(CurrencyPipe)
  uiService = inject(UiService)
  currencyService = inject(CurrencyService)

  chartOptions: EChartsOption = this.getBaseOptions()
  mergeOptions: EChartsOption

  currentChartType: 'treemap' | 'sunburst' = 'treemap';
  private hideTreemapHeaders = false;
  private fadingTreemapHeaders = false;


  constructor() {
    super()
    effect(() => {
      this.updateChart(this.currentChartType === 'treemap' ? this.getTreemapSeries() : this.getSunburstSeries())
    })
  }

  ngOnInit(): void {
    this.updateChart(this.currentChartType === 'treemap' ? this.getTreemapSeries() : this.getSunburstSeries())
  }

  getBaseOptions(): EChartsOption {
    return { 
      color: this.colorService.isDarkMode() 
        ? this.colorService.chartColorPaletteDark 
        : this.colorService.chartColorPaletteLight,
      tooltip: {
        ...this.getTooltipStyle(),
        formatter: (info: any) => {
          const value = this.currencyPipe.transform(info.value, this.currencyService.getSelectedCurrency());
          const parent = info.treePathInfo?.at(-2);
          return this.formatDistributionTooltip(info.name, value, info.value, this.totalNetIncome, parent);
        },
      },
      series: [],
    };
  }
  
  
  
  

  /** Map the color to series. This function helps persist color between the same series when switching
   * between treemap and sunburst charts. 
   * 
   * A good side-effect: It also helps matching the color in the Basic pie chart.
   */
  private generateColorMapping(data: TreeNode[], parentColor?: string): TreeNode[] {
    const isDarkMode = this.colorService.isDarkMode();
    const palette = isDarkMode ? this.colorService.chartColorPaletteDark : this.colorService.chartColorPaletteLight;

    return data.map((node, index) => {
      const color = this.categoryService.color(node.name, isDarkMode) ?? parentColor
        ?? palette[(index + Math.floor(index / palette.length)) % palette.length];

      return {
        ...node,
        itemStyle: { ...node.itemStyle, color },
        children: this.generateColorMapping(node.children, color),
      };
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartType'] && this.chartType) {
      this.setChartType(this.chartType);
    }
    if (changes['treeData'] || changes['chartType']) {
      this.updateChart(this.currentChartType === 'treemap' ? this.getTreemapSeries() : this.getSunburstSeries())
    }
  }


  private getTreemapSeries(): EChartsOption['series'] {
    return {
      type: 'treemap',
      id: 'treemap-sunburst-transition',
      animationDurationUpdate: 600,
      left: 12,
      right: 12,
      top: 12,
      bottom: 12,
      width: '95%',
      height: '95%',
      universalTransition: true,
      label: {
        show: true,
        formatter: params => this.categoryService.label(params.name),
      },
      upperLabel: {
        show: true,
        opacity: this.hideTreemapHeaders ? 0 : 1,
        formatter: (params: any) => this.categoryService.label(params.name),
        color: this.colorService.isDarkMode()
          ? this.colorService.darkTextPrimary
          : this.colorService.lightTextPrimary,
      },
      itemStyle: {
        borderWidth: 1,
        borderColor: this.colorService.isDarkMode() ? '#404040' : '#e5e5e5',
      },
      data: this.generateColorMapping(this.treeData),
      breadcrumb: {
        show: false,
      },
    };
  }

  private getSunburstSeries(): EChartsOption['series'] {
    return {
      type: 'sunburst',
      id: 'treemap-sunburst-transition',
      radius: ['20%', '90%'],
      animationDurationUpdate: 600,
      universalTransition: true,
      itemStyle: {
        borderWidth: 1,
        borderColor: this.colorService.isDarkMode() ? '#404040' : '#e5e5e5',
      },
      label: {
        show: false,
      },
      data: this.generateColorMapping(this.treeData),
    };
  }

  updateChart(series: EChartsOption['series']) {
    this.mergeOptions = {
      ...this.getBaseOptions(),
      series: series
    }
  }

  /** Reset zoom on treemap. */
  resetZoom(chartInstance: any): void {
    if (this.currentChartType === 'treemap') {
      chartInstance.dispatchAction({
        type: 'treemapZoomToNode',
        targetNodeId: 0 // Assuming root node has ID 0
      });
    } else if (this.currentChartType === 'sunburst') {
      // No built-in zoom reset for sunburst, but you can re-apply options
      this.updateChart(this.getSunburstSeries());
    }
  }

  toggleChartType(): void {
    this.setChartType(this.currentChartType === 'sunburst' ? 'treemap' : 'sunburst');
    this.updateChart(this.currentChartType === 'treemap' ? this.getTreemapSeries() : this.getSunburstSeries());
  }

  onChartFinished(): void {
    if (!this.hideTreemapHeaders) return;

    const finishedOptions = this.mergeOptions;
    // ECharts can emit finished synchronously while Angular is applying the options.
    queueMicrotask(() => {
      if (this.mergeOptions !== finishedOptions || !this.hideTreemapHeaders) return;

      if (!this.fadingTreemapHeaders) {
        // Treemap attaches upper labels to rectangles with a separate header layout.
        this._chartInstance?.getZr().storage.traverse(element => {
          const label = element.textConfig?.layoutRect && element.getTextContent();
          if (label && label.style.text && label.style.opacity === 0 && !label.ignore) {
            this.fadingTreemapHeaders = true;
            label.animateTo({ style: { opacity: 1 } }, { duration: 180, easing: 'quadraticOut' }, { style: true });
          }
        });
        if (this.fadingTreemapHeaders) return;
      }

      this.hideTreemapHeaders = false;
      this.fadingTreemapHeaders = false;
      this.updateChart(this.getTreemapSeries());
    });
  }

  private setChartType(chartType: 'treemap' | 'sunburst'): void {
    if (chartType === this.currentChartType) return;

    this.fadingTreemapHeaders = false;
    this.hideTreemapHeaders = this.currentChartType === 'sunburst' && chartType === 'treemap';
    this.currentChartType = chartType;
  }
}
