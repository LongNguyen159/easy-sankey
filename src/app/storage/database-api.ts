export * from './database-models';
import type {ClientOf} from '../../../electron/api/operations';
import type {operations} from '../../../electron/api/operations';
export type DatabaseApi=ClientOf<typeof operations>;
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
