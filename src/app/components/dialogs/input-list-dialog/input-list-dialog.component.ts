import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { takeUntil } from 'rxjs';
import { InputListComponent } from '../../input-list/input-list.component';
import { DataService } from '../../../services/data.service';
import { BasePageComponent } from '../../../base-components/base-page/base-page.component';
import {formatYearMonthToLongDate } from '../../../utils/utils';
import { NavigationStart, Router } from '@angular/router';
import { UiService } from '../../../services/ui.service';

import { RoutePath } from '../../models';

@Component({
    selector: 'app-input-list-dialog',
    imports: [MatButtonModule, MatDialogModule, InputListComponent],
    templateUrl: './input-list-dialog.component.html',
    styleUrl: './input-list-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InputListDialogComponent extends BasePageComponent implements OnInit {
  dataService = inject(DataService)
  router = inject(Router)
  dialogRef = inject(MatDialogRef)
  uiService = inject(UiService)

  private readonly monthData = toSignal(this.dataService.getSingleMonthData(), {requireSync: true});
  readonly monthString = computed(() => {
    const month = this.monthData().month;
    return month ? formatYearMonthToLongDate(month) : '';
  });


  ngOnInit(): void {
    this.router.events.pipe(takeUntil(this.componentDestroyed$)).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.dialogRef.close();
      }
    });


    this.dataService.getNavigateFixCostState().pipe(takeUntil(this.componentDestroyed$)).subscribe((navigating: boolean) => {
        if (navigating && this.router.url === RoutePath.FixCostsPage) {
          this.dialogRef.close();
          this.uiService.showSnackBar('You’re already on the Monthly Recurring page')
        }
    })
  }
}
