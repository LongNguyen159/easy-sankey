import { Component, computed, inject, input } from '@angular/core';
import { format, type EChartsOption } from 'echarts';
import { NgxEchartsDirective, provideEcharts } from 'ngx-echarts';
import { ColorService } from '../../../services/color.service';
import { CurrencyService } from '../../../services/currency.service';

@Component({
  selector: 'app-budget-radar-chart',
  imports: [NgxEchartsDirective],
  providers: [provideEcharts()],
  template: `
    <div echarts [options]="options()" class="budget-radar"
      role="img" aria-label="Radar chart comparing budget and actual spending. Exact amounts are listed below.">
    </div>
  `,
  styles: '.budget-radar { height: clamp(320px, 50vw, 460px); width: 100%; }',
})
export class BudgetRadarChartComponent {
  readonly budgets = input.required<ReadonlyArray<{name: string; budget: number; spent: number}>>();

  private readonly colors = inject(ColorService);
  private readonly currency = inject(CurrencyService);

  protected readonly options = computed<EChartsOption>(() => {
    const budgets = this.budgets();
    const dark = this.colors.isDarkMode();
    const textColor = dark ? this.colors.darkTextPrimary : this.colors.lightTextPrimary;
    const budgetColor = dark ? '#b0ebc5' : '#67ad5b';
    const spendingColor = dark ? '#ffadad' : '#d36e76';
    const gridColor = dark ? '#5c6260' : '#c5cdca';
    const tooltipBackground = dark ? this.colors.darkBackgroundSecondary : this.colors.lightBackgroundPrimary;
    const maximum = Math.max(1, ...budgets.map(({budget, spent}) => Math.max(budget, spent)));
    const currency = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: this.currency.getSelectedCurrency(),
    });

    const underColor = dark ? '#b0ebc5' : '#287349';
    const overColor = dark ? '#ffadad' : '#ac3e48';
    const tooltipRows = budgets.map(({name, budget, spent}) => {
      const remaining = budget - spent;
      const color = remaining < 0 ? overColor : remaining > 0 ? underColor : textColor;
      const difference = currency.format(Math.abs(remaining));
      const status = remaining < 0 ? `(${difference} over)` : remaining > 0 ? `(${difference} left)` : 'On budget';
      return `
        <tr>
          <th scope="row" style="padding: 3px 12px 3px 0; text-align: start; font-weight: 400; white-space: normal; overflow-wrap: anywhere;">
            ${format.encodeHTML(name)}
          </th>
          <td style="padding-block: 3px; text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; color: ${color};">
            ${currency.format(spent)} / ${currency.format(budget)}
          </td>
          <td style="padding: 3px 0 3px 10px; white-space: nowrap; color: ${color};">${status}</td>
        </tr>`;
    }).join('');

    return {
      animation: false,
      legend: {top: 0, textStyle: {color: textColor}},
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBackground,
        borderColor: gridColor,
        textStyle: {color: textColor},
        renderMode: 'html',
        confine: true,
        enterable: true,
        formatter: () => `
          <div style="max-width: min(26rem, 80vw); max-height: min(18rem, 50vh); overflow: auto;">
            <strong>Spent / budget</strong>
            <table aria-label="Budget spending breakdown" style="width: 100%; margin-top: 4px; border-collapse: collapse;">
              ${tooltipRows}
            </table>
          </div>`,
      },
      radar: {
        center: ['50%', '54%'],
        radius: '66%',
        // shape: 'circle',
        splitNumber: 6,
        axisName: {color: textColor, width: 96, overflow: 'truncate'},
        axisLine: {lineStyle: {color: dark ? 'rgba(204, 204, 204, 0.7)' : '#909090'}},
        splitLine: {
          lineStyle: {
            // ECharts also counts the zero-radius tick when assigning ring colours.
            color: [1, 0.8, 0.6, 0.4, 0.2, 0.1, 0.2].map(opacity => `rgba(144, 144, 144, ${opacity})`),
          },
        },
        splitArea: {
          show: false,
          areaStyle: {
            color: dark
              ? ['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.09)']
              : ['rgba(250, 250, 250, 0.2)', 'rgba(210, 219, 238, 0.2)'],
          },
        },
        indicator: budgets.map(({name}) => ({name, min: 0, max: maximum})),
      },
      series: [{
        type: 'radar',
        symbol: 'none',
        data: [
          {
            name: 'Actual spending',
            value: budgets.map(({spent}) => spent),
            itemStyle: {color: spendingColor},
            lineStyle: {color: spendingColor, width: 2, cap: 'round'},
            areaStyle: {color: spendingColor, opacity: 0.25},
          },
          {
            name: 'Budget',
            value: budgets.map(({budget}) => budget),
            itemStyle: {color: budgetColor},
            lineStyle: {color: budgetColor, width: 2, type: 'dashed'},
            areaStyle: {color: budgetColor, opacity: 0.12},
          },
        ],
      }],
    };
  });
}
