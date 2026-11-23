import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Component, effect, inject, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { EChartsOption, EChartsType, format } from 'echarts';
import { NgxEchartsDirective, provideEcharts } from 'ngx-echarts';
import { DifferenceItem, SankeyData, SankeyNode } from '../../models';
import { DataService } from '../../../services/data.service';
import { ColorService } from '../../../services/color.service';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { parseLocaleStringToNumber } from '../../../utils/utils';
import { MatButtonModule } from '@angular/material/button';
import { DialogsService } from '../../../services/dialogs.service';
import { CurrencyService } from '../../../services/currency.service';
import { BaseChartComponent } from '../../../base-components/base-chart/base-chart.component';
import { UiService } from '../../../services/ui.service';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';


@Component({
    selector: 'app-sankey-chart',
    imports: [MatSlideToggleModule, NgxEchartsDirective, CommonModule, MatChipsModule, MatButtonModule,
        MatIconModule,
        MatTooltipModule
    ],
    providers: [
        provideEcharts(),
        CurrencyPipe
    ],
    templateUrl: './sankey-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './sankey-chart.component.scss'
})
export class SankeyChartComponent extends BaseChartComponent implements OnChanges {

  /** Chart data input */
  @Input() sankeyData: SankeyData
  @Input() remainingBalance: string = '-'
  @Input() monthInsights: DifferenceItem[] = []


  /** Chart Configs input */
  @Input() chartHeight: string = '75vh'
  @Input() orientation: 'horizontal' | 'vertical' = 'horizontal'
  @Input() showTooltip: boolean = true
  @Input() allowInteractiveEdit: boolean = true
  @Input() showInsights: boolean = true
  @Input() highlightedCategoryId?: string;


  dataService = inject(DataService)
  dialogService = inject(DialogsService)
  currencyPipe = inject(CurrencyPipe)
  currencyService = inject(CurrencyService)
  uiService = inject(UiService)

  sankeyOption: EChartsOption = this.getBaseChartOptions()
  sankeyMerge: EChartsOption = {}
  private highlightedOptions?: EChartsOption;
  showEnvelopes = true;
  get displayedData(): SankeyData {
    return (!this.showEnvelopes ? this.sankeyData?.categoryView : undefined) ?? this.sankeyData ?? {nodes: [], links: []};
  }
  toggleEnvelopes() { this.showEnvelopes = !this.showEnvelopes; this.updateSankeyChart(); }
  private nodeLabel(node: SankeyNode): string {
    return node.displayName ?? this.categoryService.label(node.categoryId ?? node.name);
  }

  /** Drag threshold.
   * If the mouse movement under this threshold, it will be considered as a click event.
   * 
   * Purpose: 
   * To add some 'forgiveness' to the click event. If the threshold is 0, the mouse must be perfectly still to trigger a click event,
   * which is sometimes hard to trigger the click event.
   * 
   * Set threshold higher means if user wants to drag, they must drag more than this threshold in order to register
   * a drag event. Or else it'll be considered as a click event.
   */
  dragThreshold: number = 5;

  constructor() {
    super();
    effect(() => {
      this.updateSankeyChart();
    });
  }


  override onChartInit(chart: EChartsType): void {
    super.onChartInit(chart);
    this.highlightedOptions = undefined;

    if (!this.allowInteractiveEdit) {
      return
    }
  
    let isDragging = false;
    let startX = 0;
    let startY = 0;
  
    chart.on('mousedown', (params: any) => {
      if (params.componentType === 'series' && params.seriesType === 'sankey' && params.dataType === 'node') {
        // Capture starting mouse position
        const event = params.event.event;
        startX = event.clientX;
        startY = event.clientY;
        isDragging = false;
      }
    });
  
    chart.on('mousemove', (params: any) => {
      if (params.componentType === 'series' && params.seriesType === 'sankey' && params.dataType === 'node') {
        // Check if mouse movement exceeds a threshold
        const event = params.event.event;
        const dx = Math.abs(event.clientX - startX);
        const dy = Math.abs(event.clientY - startY);
        if (dx > this.dragThreshold || dy > this.dragThreshold) {
          isDragging = true;
        }
      }
    });
  
    chart.on('mouseup', (params: any) => {
      if (
        params.componentType === 'series' &&
        params.seriesType === 'sankey' &&
        params.dataType === 'node' &&
        !isDragging
      ) {
        const node = params.data as SankeyNode;
        const entryName = node.entryName ?? node.name;
        if (!node.envelopeId && !node.categoryId && !this.dataService.nonAllowedNames.includes(entryName)) {
          const entry = this.dataService.getEntryForChart(entryName);
          this.dialogService.openInsertIntoDialog({name: entryName, value: entry?.value ?? node.value});
        } else {
          this.uiService.showSnackBar(
            `You are not allowed to modify this entry, since it's generated by the system.`,
            'Close',
            5000
          );
        }
      }
    });
  }


  getBaseChartOptions(): EChartsOption {
    return {
      animation: true,
      tooltip: {
        trigger: 'item',
        position: 'top',
        triggerOn: 'mousemove',
        backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundSecondary : this.colorService.lightBackgroundPrimary,
        textStyle: {
          color: this.colorService.isDarkMode() ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
        },
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            const nodeName = format.encodeHTML(this.nodeLabel(params.data));
            if (params.data.envelopeId) {
              return `${nodeName}: <strong>${this.currencyPipe.transform(params.data.spent, this.currencyService.getSelectedCurrency())} / ${this.currencyPipe.transform(params.data.budget, this.currencyService.getSelectedCurrency())}</strong><br>Allowance shown for planning; Surplus uses actual spending.`;
            }
            return `${nodeName}: <strong>${this.currencyPipe.transform(params.data.value, this.currencyService.getSelectedCurrency())}</strong>`;
          } else {
            const label = (name: string) => {
              const node = this.displayedData.nodes.find(item => item.name === name);
              return format.encodeHTML(node ? this.nodeLabel(node) : this.categoryService.label(name));
            };
            const source = params.data.source ? label(params.data.source) : '';
            const target = params.data.target ? label(params.data.target) : '';
            return `${source} → ${target}: <strong>${this.currencyPipe.transform(params.data.value, this.currencyService.getSelectedCurrency())}</strong>`;
          }
        }
      },
      toolbox: {
        right: 20,
        feature: {
          saveAsImage: {
            name: `Financial Flow Sankey_${this.dataService.getTodaysDate()}`,
            backgroundColor: this.colorService.isDarkMode() ? this.colorService.darkBackgroundPrimary : this.colorService.lightBackgroundPrimary,
          },
        },
      },
      series: [
      ]
    }
  }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes['highlightedCategoryId'] && this.highlightedCategoryId) {
      this.showEnvelopes = false;
    }

    if (changes['sankeyData'] || changes['orientation'] || changes['highlightedCategoryId']) {
      this.updateSankeyChart();
    }
  }

  applyCategoryEmphasis(): void {
    const chart = this._chartInstance;
    if (!chart || chart.isDisposed() || !this.highlightedCategoryId || this.highlightedOptions === this.sankeyMerge) {
      return;
    }

    // Read the rendered series because the base options may finish before the data is merged.
    const series = chart.getOption()['series'] as {data?: SankeyNode[]}[] | undefined;
    const dataIndex = series?.[0]?.data?.findIndex(node =>
      (node.categoryId ?? node.name) === this.highlightedCategoryId) ?? -1;
    if (dataIndex < 0) {
      return;
    }

    this.highlightedOptions = this.sankeyMerge;
    chart.dispatchAction({type: 'highlight', seriesIndex: 0, dataType: 'node', dataIndex});
  }

  updateSankeyChart() {
    const isDarkMode = this.colorService.isDarkMode();
    const textColor = isDarkMode ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary;
    const { nodes: displayedNodes, links } = this.displayedData;
    const nodes = displayedNodes.map(node => {
      const color = this.categoryService.color(node.categoryId ?? node.name, isDarkMode);
      return color ? { ...node, itemStyle: { color } } : node;
    });

    const hasSelectedCategory = nodes.some(node =>
      (node.categoryId ?? node.name) === this.highlightedCategoryId);

    this.sankeyMerge = {
      ...this.getBaseChartOptions(),
      series: [
        {
          nodeAlign: 'left',
          type: 'sankey',
          data: nodes,
          links,
          silent: hasSelectedCategory,
          emphasis: { focus: 'adjacency' },
          orient: this.orientation,
          label: {
            position: this.orientation === 'horizontal' ? 'right' : 'top',
            fontSize: 12,
            color: textColor,
            // Use rich text for formatting
            rich: {
              bold: {
                fontWeight: 'bold',
                fontSize: 12,
                color: isDarkMode ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
              },
              normal: {
                fontSize: 12,
                color: isDarkMode ? this.colorService.darkTextPrimary : this.colorService.lightTextPrimary,
              }
            },
            formatter: (params: any) => {
              const nodeName = this.nodeLabel(params.data);
              const valueLabel = params.data.envelopeId
                ? `${params.data.spent.toLocaleString('en-US')} / ${params.data.budget.toLocaleString('en-US')}`
                : params.data.value.toLocaleString('en-US');
              return [
                `{bold|${nodeName}}`, // Bold name
                `{normal|${valueLabel}}`, // Normal value
              ].join('\n'); // Join with a newline
            }
          },
          labelLayout: {
            hideOverlap: true,
          },
          nodeGap: 28,
          lineStyle: { color: 'gradient', curveness: 0.5 }
        }
      ]
    }
  }

  


  //#region Helper Functions
  isPositiveBalance(): boolean {
    const balanceNumber = parseLocaleStringToNumber(this.remainingBalance);
    return balanceNumber >= 0;
  }

  parseLocaleStringToNumber(value: string): number {
    return parseLocaleStringToNumber(value);
  }

  getBalanceClass(): string {
    return this.isPositiveBalance() ? 'positive-balance' : 'negative-balance';
  }

  categoryLabel(name: string): string {
    return this.categoryService.label(name)
  }
  //#endregion
}
