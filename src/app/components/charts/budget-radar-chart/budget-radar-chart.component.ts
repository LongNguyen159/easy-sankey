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
  styles: '.budget-radar { height: clamp(280px, 45vw, 400px); width: 100%; }',
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
        radius: '57%',
        splitNumber: 4,
        axisName: {color: textColor, width: 96, overflow: 'truncate'},
        axisLine: {lineStyle: {color: gridColor}},
        splitLine: {lineStyle: {color: gridColor}},
        splitArea: {show: false},
        indicator: budgets.map(({name}) => ({name, min: 0, max: maximum})),
      },
      series: [{
        type: 'radar',
        symbolSize: 5,
        data: [
          {
            name: 'Budget',
            value: budgets.map(({budget}) => budget),
            itemStyle: {color: budgetColor},
            lineStyle: {color: budgetColor, width: 2, type: 'dashed'},
            symbol: 'diamond',
            areaStyle: {color: budgetColor, opacity: 0.16},
          },
          {
            name: 'Actual spending',
            value: budgets.map(({spent}) => spent),
            itemStyle: {color: spendingColor},
            lineStyle: {color: spendingColor, width: 2},
            symbol: 'circle',
            areaStyle: {color: spendingColor, opacity: 0.2},
          },
        ],
      }],
    };
  });
}
