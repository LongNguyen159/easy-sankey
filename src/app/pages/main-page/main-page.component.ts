import { ChangeDetectionStrategy, Component, inject, Input, OnChanges, OnInit, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import {MatChipsModule} from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { DataService } from '../../services/data.service';
import { DifferenceItem, MonthlyData, SingleMonthData, TreeNode } from '../../components/models';
import { takeUntil } from 'rxjs';
import { BasePageComponent } from '../../base-components/base-page/base-page.component';
import { NavbarComponent } from "../../components/navbar/navbar.component";
import { ColorService } from '../../services/color.service';
import { MonthPickerComponent } from "../../components/month-picker/month-picker.component";
import { onMonthChanges } from '../../utils/data-utils';
import { PieChartComponent } from '../../components/charts/pie-chart/pie-chart.component';
import { SankeyChartComponent } from '../../components/charts/sankey-chart/sankey-chart.component';
import { DialogsService } from '../../services/dialogs.service';
import { DateChanges } from '../../components/models';
import { BudgetGaugeChartComponent } from "../../components/charts/budget-gauge-chart/budget-gauge-chart.component";
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoutePath } from '../../components/models';
import { TreemapChartComponent } from "../../components/charts/treemap-chart/treemap-chart.component";
import { calculateDifferences, getLastMonth } from '../../utils/utils';
import { MatTooltipModule } from '@angular/material/tooltip';
@Component({
    selector: 'app-main-page',
    imports: [SankeyChartComponent, PieChartComponent,
        MatButtonModule, CommonModule, MatIconModule, MatMenuModule, MatDividerModule,
        NavbarComponent, MonthPickerComponent,
        MatChipsModule, BudgetGaugeChartComponent,
        MatSlideToggleModule, FormsModule, TreemapChartComponent,
        MatTooltipModule],
    templateUrl: './main-page.component.html',
    styleUrl: './main-page.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager
})
export class MainPageComponent extends BasePageComponent implements OnInit, OnChanges {
  @Input() hasMonthPicker: boolean = true;
  @Input() hasNavbar: boolean = false;
  @Input() selectedMonth: Date = new Date();

  isVerticalLayout = true;

  dataService = inject(DataService)
  colorService = inject(ColorService)
  dialogService = inject(DialogsService)

  router = inject(Router)

  entriesOfOneMonth: SingleMonthData
  monthlyData: MonthlyData = {};
  highlightMonths: string[] = []


  totalExpenses: number = -1
  totalGrossIncome: number = -1
  totalNetIncome: number = -1
  showGrossIncomePieChart: boolean = false /** Only shown when tax is given and > 0 */

  pieChartDataBrutto: {name: string, value: number}[] = []
  pieChartDataNetto: {name: string, value: number}[] = []


  monthInsights: DifferenceItem[] = []

  treeMapData: TreeNode[] = []


  isSankeyVertical: boolean = false
  isShowInsights: boolean = true

  viewTreeMap: boolean = false

  constructor() {
    super();
  }
  ngOnInit(): void {

    /** Get all months data to show the orange dot under the months that has entries.
     *
     * TODO: Optimise this, reading all months data might not be efficient.
     * Maybe all months of one year? Then as user navigates through years, get the data for that year.
     */
    this.dataService.getAllMonthsData().pipe(takeUntil(this.componentDestroyed$)).subscribe(data => {
      const filteredMonthlyData = Object.keys(data).reduce((result, month) => {
        const dataEntry = data[month];
        // Check if the data contains meaningful entries
        if (dataEntry.rawInput.length > 0 || dataEntry.totalGrossIncome > 0 || dataEntry.totalExpenses > 0) {
            result[month] = dataEntry; // Keep non-empty months
        }
          return result;
      }, {} as MonthlyData);

      this.monthlyData = filteredMonthlyData;
      this.highlightMonths = Object.keys(filteredMonthlyData); // Get keys of filtered data
    })

    this.dataService.getSingleMonthData().pipe(takeUntil(this.componentDestroyed$)).subscribe((data: SingleMonthData) => {
      if (data && Object.keys(data).length > 0) {
        this.entriesOfOneMonth = data
        this.pieChartDataNetto = data.pieData
        this.totalExpenses = data.totalExpenses
        this.totalGrossIncome = data.totalGrossIncome
        this.totalNetIncome = data.totalUsableIncome
        this.treeMapData = data.treeMapData


        this.getMonthInsights(data.month, getLastMonth(data.month))

        if (this.entriesOfOneMonth.totalTax == 0) {
          this.showGrossIncomePieChart = false

          this.pieChartDataBrutto = this.pieChartDataNetto
        } else {
          this.showGrossIncomePieChart = true

          this.pieChartDataBrutto = [
            ...this.pieChartDataNetto,
            {name: 'Taxes', value: this.entriesOfOneMonth.totalTax}
          ]
          this.totalGrossIncome = this.entriesOfOneMonth.totalGrossIncome
        }
      }
    })
  }

  /** Get insights of current month compared to last month to show the differences in percentages in template */
  getMonthInsights(currentMonth: string, previousMonth: string = '') {
    if (!previousMonth || !currentMonth || !this.monthlyData[previousMonth] || !this.monthlyData[currentMonth]) {
      this.monthInsights = calculateDifferences([], [])
      return
    }
    this.monthInsights = calculateDifferences(this.monthlyData[currentMonth].pieData, this.monthlyData[previousMonth].pieData)
  }


  get envelopeBudgets() {
    return (this.entriesOfOneMonth?.envelopes ?? []).map(envelope => ({...envelope,
      spent: this.entriesOfOneMonth.sankeyData.nodes.find(node => node.envelopeId === envelope.id)?.spent ?? 0,
    }));
  }

  navigateToBudgetList() {
    this.router.navigate([RoutePath.FinanceManagerPage], {
      queryParams: { tab: 3 }
    });
  }



  ngOnChanges(changes: SimpleChanges): void {
    if (changes && changes['selectedMonth']) {
      // this.onMonthChanges(this.selectedMonth)
    }
  }


  async onMonthChanges(selectedMonth: DateChanges) {
    await onMonthChanges(selectedMonth.currentMonth, this.monthlyData, this.entriesOfOneMonth, this.dataService);
  }

  toggleLayout() {
    this.isVerticalLayout = !this.isVerticalLayout;
  }

}
