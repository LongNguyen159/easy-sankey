import {SettingsService} from '../services/settings.service';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private readonly preferences = inject(SettingsService);

  private readonly currencyKey = 'selectedCurrency';
  private readonly defaultCurrency = 'EUR';

  private currencySymbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    VND: '₫',
  };


  constructor() { }


  getSelectedCurrency(): string {
    return this.preferences.read(this.currencyKey) || this.defaultCurrency;
  }
  getCurrencySymbol(currency: string = this.getSelectedCurrency()): string {
      return this.currencySymbols[currency] || '';
  }

  async setSelectedCurrency(currency: string): Promise<void> {
      await this.preferences.write(this.currencyKey, currency);
  }
}
