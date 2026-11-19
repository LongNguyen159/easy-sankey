import { Budget, ExpenseCategoryDetails, UserDefinedLink } from '../components/models';
export interface MonthSource {
    month: string;
    lastUpdated: string;
    rawInput: UserDefinedLink[];
}
export interface StoredMonth {
    month: string;
    lastUpdated: string;
    entries: UserDefinedLink[];
    revision: number;
}
export interface DatabaseSnapshot {
    revision: number;
    initialized?: boolean;
    recoveryRequired?: boolean;
    data: Record<string, unknown> & {
        monthlyData?: Record<string, MonthSource>;
    };
}
export interface CommandResult<T> {
    revision: number;
    value: T;
    affected: string[];
}
export interface HistoryItem {
    timestamp: string;
    value: string | number;
}
export interface EntityApi<T> {
    list(): Promise<{
        revision: number;
        items: T[];
    }>;
    get(payload: {
        id: string;
    }): Promise<T | null>;
    create(payload: {
        item: T;
        revision?: number;
    }): Promise<CommandResult<T>>;
    update(payload: {
        id: string;
        item: T;
        revision?: number;
    }): Promise<CommandResult<T>>;
    delete(payload: {
        id: string;
        revision?: number;
    }): Promise<CommandResult<null>>;
    reorder(payload: {
        ids: string[];
        revision?: number;
    }): Promise<CommandResult<null>>;
    replace(payload: {
        items: T[];
        base?: T[];
        metadata?: TrackingMetadata;
        revision?: number;
    }): Promise<CommandResult<T[]>>;
}
export interface TrackingTarget {
    name: string;
    targetSpending: number;
}
export interface TrackingMetadata {
    targetSurplus: number;
    avgIncome: number;
}
export interface MonthSave {
    month: string;
    lastUpdated: string;
    entries: UserDefinedLink[];
    base?: UserDefinedLink[];
    revision?: number;
    mode?: 'create' | 'update';
    categories?: ExpenseCategoryDetails[];
    clearHistory?: boolean;
    history?: Record<string, HistoryItem>;
}
