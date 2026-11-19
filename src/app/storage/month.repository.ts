import { inject, Injectable } from '@angular/core';
import { UserDefinedLink, ExpenseCategoryDetails } from '../components/models';
import { DATABASE_CLIENT } from './repositories';
import { HistoryItem, MonthSave } from './database-api';
@Injectable({ providedIn: 'root' })
export class MonthRepository {
    private client = inject(DATABASE_CLIENT);
    list(from?: string, to?: string) { return this.client.api.months.range({ from, to }).then(result => result.value); }
    get(month: string) { return this.client.api.months.get(month); }
    save(data: MonthSave) { const command = structuredClone(data); return this.client.command(() => this.client.api.months.save(command)).then(result => result.value); }
    delete(month: string) { return this.client.command(() => this.client.api.months.remove({ month })).then(result => result.value); }
    importMonth(data: MonthSave, categories?: ExpenseCategoryDetails[]) { return this.save({ ...data, categories, clearHistory: true }); }
    updateEntry(month: string, entry: UserDefinedLink, history?: HistoryItem, expected?: UserDefinedLink) { return this.client.command(() => this.client.api.entries.update({ month, id: entry.id, entry, expected, history: history ? { [entry.id]: history } : undefined })).then(async () => {const saved=await this.get(month);if(!saved)throw new Error("Month does not exist.");return saved;}); }
}
