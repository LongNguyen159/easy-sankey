import { inject, Injectable, InjectionToken } from '@angular/core';
import { BudgetEnvelope, UserDefinedLink } from '../components/models';
export const SESSION_STORAGE = new InjectionToken<Storage>('Session storage', { providedIn: 'root', factory: () => sessionStorage });
interface SessionSchema {
    copiedLinks: UserDefinedLink[];
    copiedEnvelopes: BudgetEnvelope[];
    copiedSourceMonth: string;
    copiedAllowSameMonth: boolean;
    isFormatBigNumbers: boolean;
}
@Injectable({ providedIn: 'root' })
export class SessionStore {
    private readonly adapter = inject(SESSION_STORAGE);
    read<K extends keyof SessionSchema>(key: K): SessionSchema[K] | null {
        const value = this.adapter.getItem(key);
        return value === null ? null : JSON.parse(value) as SessionSchema[K];
    }
    write<K extends keyof SessionSchema>(key: K, value: SessionSchema[K]): void {
        this.adapter.setItem(key, JSON.stringify(value));
    }
    delete(key: keyof SessionSchema): void {
        this.adapter.removeItem(key);
    }
    clear(): void {
        this.adapter.clear();
    }
}
