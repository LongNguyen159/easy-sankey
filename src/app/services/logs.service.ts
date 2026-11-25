import { Injectable, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {DATABASE_CLIENT} from '../data/database';
import { catchError, defer, map, Observable, of, shareReplay, startWith } from 'rxjs';
import { HistoryItem } from '../data/database';
type EntryHistory =
    | { status: 'loading' }
    | { status: 'loaded'; items: HistoryItem[] }
    | { status: 'error' };

/** History reads are scoped. Pending expressions commit in the entry transaction. */
@Injectable({ providedIn: 'root' })
export class LogsService {
    private client = inject(DATABASE_CLIENT);
    private datePipe = inject(DatePipe);
    private history = new Map<string, Observable<EntryHistory>>();
    private historyRevision = signal(0);
    private pending = new Map<string, Record<string, HistoryItem>>();
    async setLog(month: string, id: string, value: string | number) {
        const items = this.pending.get(month) ?? {};
        items[id] = { timestamp: this.datePipe.transform(new Date(), 'MMM dd, HH:mm') ?? '', value };
        this.pending.set(month, items);
    }
    pendingFor(month: string) { return structuredClone(this.pending.get(month)); }
    commitPending(month: string, committed?: Record<string, HistoryItem>, removedIds: string[] = []) {
        const pending = this.pending.get(month);
        if (pending && committed) {
            for (const [id, item] of Object.entries(committed)) {
                if (JSON.stringify(pending[id]) === JSON.stringify(item)) delete pending[id];
            }
            if (!Object.keys(pending).length) this.pending.delete(month);
        }
        this.invalidateEntries(month, [...Object.keys(committed ?? {}), ...removedIds]);
    }

    getLogs(month: string, id: string): Observable<EntryHistory> {
        this.historyRevision();
        const key = `${month}:${id}`;
        const cached = this.history.get(key);
        if (cached) return cached;

        const history = defer(() => this.client.api.history.list({ month, id })).pipe(
            map((result): EntryHistory => ({ status: 'loaded', items: result.value })),
            catchError(() => of<EntryHistory>({ status: 'error' })),
            startWith<EntryHistory>({ status: 'loading' }),
            shareReplay(1),
        );
        this.history.set(key, history);
        return history;
    }

    retryLogs(month: string, id: string): void {
        this.invalidateEntries(month, [id]);
    }

    invalidateEntries(month: string, ids: string[]): void {
        let invalidated = false;
        for (const id of ids) {
            if (this.history.delete(`${month}:${id}`)) invalidated = true;
        }
        if (invalidated) this.historyRevision.update(revision => revision + 1);
    }

    async reload() { this.invalidateHistory(); }

    private invalidateHistory(): void {
        this.history.clear();
        this.historyRevision.update(revision => revision + 1);
    }
}
