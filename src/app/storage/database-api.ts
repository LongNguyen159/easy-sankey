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
export interface DatabaseApi {
    status(): Promise<{
        revision: number;
        initialized: boolean;
        recoveryRequired?: boolean;
    }>;
    settings: {
        list(): Promise<CommandResult<Record<string, unknown>>>;
        set(payload: {
            key: string;
            value: unknown;
        }): Promise<CommandResult<unknown>>;
    };
    history: {
        list(payload: {
            month: string;
            id: string;
        }): Promise<CommandResult<HistoryItem[]>>;
        append(payload: {
            month: string;
            id: string;
            item: HistoryItem;
        }): Promise<CommandResult<null>>;
        cleanup(payload: {
            now?: number;
        }): Promise<CommandResult<null>>;
    };
    trackingMetadata(): Promise<TrackingMetadata>;
    deleteCategory(payload: {
        id: string;
    }): Promise<CommandResult<null>>;
    state: {
        initialize(legacy:Record<string,string>):Promise<DatabaseSnapshot>;
        snapshot(): Promise<DatabaseSnapshot>;
        exportBackup(): Promise<string>;
        exportFile(): Promise<boolean>;
        restore(payload: {
            text: string;
            revision: number;
        }): Promise<DatabaseSnapshot>;
        reset(revision: number): Promise<DatabaseSnapshot>;
    };
    months: {
        list(): Promise<string[]>;
        get(month: string): Promise<StoredMonth | null>;
        range(payload?: {
            from?: string;
            to?: string;
        }): Promise<CommandResult<StoredMonth[]>>;
        save(payload: MonthSave): Promise<CommandResult<StoredMonth>>;
        remove(payload: {
            month: string;
        }): Promise<CommandResult<boolean>>;
    };
    entries: {
        list(payload: {
            month: string;
        }): Promise<{
            revision: number;
            entries: UserDefinedLink[];
        }>;
        get(payload: {
            month: string;
            id: string;
        }): Promise<UserDefinedLink | null>;
        create(payload: {month: string; entry: UserDefinedLink; revision?: number}): Promise<CommandResult<UserDefinedLink | null>>;
        delete(payload: {month: string; id: string; revision?: number}): Promise<CommandResult<UserDefinedLink | null>>;
        reorder(payload: {month: string; ids: string[]; revision?: number}): Promise<CommandResult<UserDefinedLink | null>>;
        update(payload: {
            month: string;
            id: string;
            entry: UserDefinedLink;
            history?: Record<string, HistoryItem>;
            expected?: UserDefinedLink;
            revision?: number;
        }): Promise<CommandResult<UserDefinedLink | null>>;
    };
    categories: EntityApi<ExpenseCategoryDetails>;
    fixedCosts: EntityApi<UserDefinedLink>;
    budgets: EntityApi<Budget>;
    tracking: EntityApi<TrackingTarget>;
}
declare global {
    interface Window {
        electronAPI?: {
            database: DatabaseApi;
            readMonthClipboard?: () => Promise<string>;
            writeMonthClipboard?: (text: string) => Promise<void>;
            [key: string]: any;
        };
    }
}
