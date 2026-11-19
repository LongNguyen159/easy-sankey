import { AppStorage } from '../storage/app-storage';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private readonly storage = inject(AppStorage);

  private readonly currencyKey = 'selectedCurrency';
  private readonly defaultCurrency = 'EUR';

  private currencySymbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    VND: '₫',
  };


  constructor() { }


  getSelectedCurrency(): string {
    return this.storage.read(this.currencyKey) || this.defaultCurrency;
  }
  getCurrencySymbol(currency: string = this.getSelectedCurrency()): string {
      return this.currencySymbols[currency] || '';
  }

  async setSelectedCurrency(currency: string): Promise<void> {
      await this.storage.write(this.currencyKey, currency);
  }
}
