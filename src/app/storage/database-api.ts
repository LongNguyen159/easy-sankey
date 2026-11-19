import { Budget, ExpenseCategoryDetails, TrackingMetaData, UserDefinedLink } from '../components/models';

export interface MonthSource { month:string; lastUpdated:string; rawInput:UserDefinedLink[]; }
/** Source records only; calculated chart projections never cross this API. */
export interface StoredMonth { month:string; lastUpdated:string; entries:UserDefinedLink[]; revision:number; }
export interface DatabaseSnapshot {
  revision:number;
  initialized?:boolean;
  recoveryRequired?:boolean;
  data:Record<string,unknown> & {monthlyData?:Record<string,MonthSource>};
}
export interface EntityApi<T> {
  list():Promise<{revision:number;items:T[]}>;
  get(payload:{id:string}):Promise<T|null>;
  create(payload:{item:T;revision:number}):Promise<DatabaseSnapshot>;
  update(payload:{id:string;item:T;revision:number}):Promise<DatabaseSnapshot>;
  delete(payload:{id:string;revision:number}):Promise<DatabaseSnapshot>;
  reorder(payload:{ids:string[];revision:number}):Promise<DatabaseSnapshot>;
}
export interface DatabaseApi {
  state: {
    snapshot():Promise<DatabaseSnapshot>;
    initialize(legacy:Record<string,string>):Promise<DatabaseSnapshot>;
    mutate(payload:{changes:Record<string,unknown>;revision:number;replace?:boolean}):Promise<DatabaseSnapshot>;
    deleteCategory(payload:{id:string;revision:number}):Promise<DatabaseSnapshot>;
    exportBackup():Promise<string>;
    exportFile():Promise<boolean>;
    restore(payload:{text:string;revision:number}):Promise<DatabaseSnapshot>;
    reset(revision:number):Promise<DatabaseSnapshot>;
  };
  months: {
    list():Promise<string[]>;
    get(month:string):Promise<StoredMonth|null>;
    create(record:Omit<StoredMonth,'revision'>):Promise<StoredMonth>;
    update(record:StoredMonth):Promise<StoredMonth>;
    delete(month:string):Promise<boolean>;
  };
  entries: {
    list(scope:{month:string}):Promise<{revision:number;entries:UserDefinedLink[]}>;
    get(scope:{month:string;id:string}):Promise<UserDefinedLink|null>;
    create(payload:{month:string;entry:UserDefinedLink;revision:number}):Promise<DatabaseSnapshot>;
    update(payload:{month:string;id:string;entry:UserDefinedLink;revision:number}):Promise<DatabaseSnapshot>;
    delete(payload:{month:string;id:string;revision:number}):Promise<DatabaseSnapshot>;
    reorder(payload:{month:string;ids:string[];revision:number}):Promise<DatabaseSnapshot>;
  };
  categories:EntityApi<ExpenseCategoryDetails>;
  fixedCosts:EntityApi<UserDefinedLink>;
  budgets:EntityApi<Budget>;
  tracking:EntityApi<Pick<TrackingMetaData['trackingCategories'][number],'name'|'targetSpending'>>;
}
