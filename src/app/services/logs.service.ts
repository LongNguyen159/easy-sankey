import { Injectable, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DATABASE_CLIENT } from '../storage/repositories';
import { HistoryItem } from '../storage/database-api';
/** History reads are scoped. Pending expressions commit in the entry transaction. */
@Injectable({ providedIn: 'root' })
export class LogsService {
    private client = inject(DATABASE_CLIENT);
    private datePipe = inject(DatePipe);
    private loaded = new Map<string, HistoryItem[]>();
    private pending = new Map<string, Record<string, HistoryItem>>();
    private inflight = new Set<string>();
    async setLog(month: string, id: string, value: string | number) {
        const items = this.pending.get(month) ?? {};
        items[id] = { timestamp: this.datePipe.transform(new Date(), 'MMM dd, HH:mm') ?? '', value };
        this.pending.set(month, items);
    }
    pendingFor(month: string) { return structuredClone(this.pending.get(month)); }
    commitPending(month: string, committed?: Record<string, HistoryItem>) {
        const pending = this.pending.get(month);
        if (pending && committed) {
            for (const [id, item] of Object.entries(committed)) {
                if (JSON.stringify(pending[id]) === JSON.stringify(item)) delete pending[id];
            }
            if (!Object.keys(pending).length) this.pending.delete(month);
        }
        this.loaded.clear();
    }
    getLogs(month: string, id: string): HistoryItem[] {
        const key = `${month}:${id}`;
        if (!this.loaded.has(key) && !this.inflight.has(key)) {
            this.inflight.add(key);
            this.client.api.history.list({ month, id }).then(result => this.loaded.set(key, result.value)).catch(() => this.loaded.delete(key)).finally(() => this.inflight.delete(key));
        }
        return structuredClone(this.loaded.get(key) ?? []);
    }
    async reloadFromStorage() { this.loaded.clear(); }
}
