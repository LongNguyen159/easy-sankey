import { BackupRepository } from '../../../storage/repositories';
import { SessionStore } from '../../../storage/session-store';
import { Component, inject, OnInit, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {MatCardModule} from '@angular/material/card';
import {MatRadioModule} from '@angular/material/radio';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorService, Theme } from '../../../services/color.service';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { UiService } from '../../../services/ui.service';
import { ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { RestartDialogComponent } from '../restart-dialog/restart-dialog.component';
import { CurrencyService } from '../../../services/currency.service';
import { RoutePath } from '../../models';
import { firstValueFrom } from 'rxjs';
import { readBackup } from '../../../utils/data-transfer';


@Component({
    selector: 'app-settings-dialog',
    imports: [MatButtonModule, MatDialogModule, MatCardModule,
        MatRadioModule, CommonModule, FormsModule, MatIconModule,
        RouterModule,
        MatFormFieldModule,
        MatSelectModule
    ],
    templateUrl: './settings-dialog.component.html',
    styleUrl: './settings-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    encapsulation: ViewEncapsulation.None
})
export class SettingsDialogComponent implements OnInit{
  private readonly storage = inject(BackupRepository);
  private readonly sessionStore = inject(SessionStore);
  colorService = inject(ColorService)
  currencyService = inject(CurrencyService)
  readonly router = inject(Router)
  dialogRef = inject(MatDialogRef);
  readonly dialog = inject(MatDialog)
  /** 'system', 'light' or 'dark' */
  selectedTheme: Theme = Theme.System;
  theme = Theme
  uiService = inject(UiService)

  selectedCurrency = ''
  availableCurrencies: string[] = ['USD', 'EUR', 'VND'];
  importing = false;

  async ngOnInit(): Promise<void> {
    this.selectedTheme = this.colorService.isManualThemeSet() ? (this.colorService.isDarkMode() ? Theme.Dark : Theme.Light) : Theme.System
    await this.applySelectedTheme(this.selectedTheme);


    this.selectedCurrency = this.currencyService.getSelectedCurrency();
    await this.applySelectedCurrency(this.selectedCurrency);
  }

  /** On selection change, call apply theme */
  async applySelectedTheme(theme: Theme) {
    await this.colorService.applyTheme(theme);
    this.selectedTheme = theme;
  }


  async applySelectedCurrency(currency: string): Promise<void> {
    this.selectedCurrency = currency;
    await this.currencyService.setSelectedCurrency(currency);
  }

  navigateToDataManager() {
    if (this.router.url === RoutePath.FinanceManagerPage) {
      this.uiService.showSnackBar('Already in Finance Manager', 'Dismiss', 3000)
      return;
    }
    this.router.navigate([RoutePath.FinanceManagerPage]);
    this.dialogRef.close()
  }

  async exportData(): Promise<void> {
    const desktop=window.electronAPI?.database?.state;
    if(desktop?.exportFile) {
      try { await desktop.exportFile(); }
      catch { this.uiService.showSnackBar('Could not export the backup.'); }
      return;
    }
    let json: string;
    try {
      json = (await this.storage.exportBackup());
    } catch {
      this.uiService.showSnackBar('Could not create the backup.');
      return;
    }

    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'easy-sankey-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importData(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.importing) return;
    this.importing = true;

    try {
      let backup: string;
      try {
        backup = await file.text();
        readBackup(backup);
      } catch {
        this.uiService.showSnackBar('Choose a valid Easy Sankey full backup JSON file.');
        return;
      }

      const confirmed = await firstValueFrom(this.uiService.openConfirmDialog({
        title: 'Replace all app data?',
        message: 'Importing this backup will overwrite all your current months, budgets, categories, fixed costs, and settings. This cannot be undone. Are you sure?',
        confirmLabel: 'Replace all data',
        confirmColor: 'warn',
        cancelLabel: 'Cancel'
      }, 'min(30rem, 90vw)', 'auto'));
      if (!confirmed) return;

      try {
        await this.storage.restoreBackup(backup);
      } catch {
        this.uiService.showSnackBar('Could not restore the backup.');
        return;
      }

      this.sessionStore.delete('copiedLinks');
      this.sessionStore.delete('isFormatBigNumbers');
      if (location.protocol === 'file:') {
        location.replace(new URL('index.html', document.baseURI));
      } else {
        location.reload();
      }
    } finally {
      this.importing = false;
    }
  }

  clearLocalStorage() {
    const dialogData: ConfirmDialogData = {
      title: 'Are you sure you want to erase all app data?',
      message: 'This will erase all your data. You will see the welcome screen next time you open the app.',
      confirmLabel: 'Delete',
      confirmColor: 'warn',
      cancelLabel: 'Cancel'
    }
    this.uiService.openConfirmDialog(dialogData).subscribe(async (confirmed: boolean | undefined) => {
      if (confirmed) {
        await this.storage.clear();
        this.sessionStore.clear();
        location.replace(new URL('index.html', document.baseURI));
      }
    })
  }
}
