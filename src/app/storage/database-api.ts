import { UserDefinedLink } from '../components/models';

/** Source records only; calculated chart projections never cross this API. */
export interface StoredMonth {
  month: string;
  lastUpdated: string;
  entries: UserDefinedLink[];
  revision: number;
}
export interface DatabaseApi {
  months: {
    list(): Promise<string[]>;
    get(month: string): Promise<StoredMonth | null>;
    create(record: Omit<StoredMonth, 'revision'>): Promise<StoredMonth>;
    update(record: StoredMonth): Promise<StoredMonth>;
    delete(month: string): Promise<boolean>;
  };
}
