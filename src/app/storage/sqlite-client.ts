import { calculateMonth } from '../utils/month-calculation';
import { expenseCategoryDetails } from '../components/models';

type Snapshot = { initialized?:boolean; recoveryRequired?:boolean; revision: number; data: Record<string, any> };
interface StateApi {
  deleteCategory(payload:{id:string;revision:number}):Promise<Snapshot>;
  snapshot():Promise<Snapshot>;
  initialize(legacy: Record<string,string>): Promise<Snapshot>;
  mutate(payload: { changes: Record<string,unknown>; revision: number; replace: boolean }): Promise<Snapshot>;
  exportBackup(): Promise<string>;
  restore(payload: { text: string; revision: number }): Promise<Snapshot>;
  reset(revision: number): Promise<Snapshot>;
}
const textKeys = new Set(['selectedCurrency','entryView','budgetView','budgetSort','fixCostSort','firstTime','appVersion']);
let client: SqliteClient | undefined;
export function getSqliteClient(): SqliteClient {
  if (!client) throw new Error('Desktop database is not initialized.');
  return client;
}
/** Startup gate: the only reader of legacy LocalStorage; never writes it. */
export async function initializeSqlite(): Promise<void> {
  const api = (window as any).electronAPI?.database?.state as StateApi | undefined;
  if (!api) throw new Error('Open Easy Sankey in the desktop application to use its local database.');
  const status=await api.snapshot();
  const legacy: Record<string,string> = {};
  if(!status.initialized) for (let index=0; index<localStorage.length; index++) {
    const key=localStorage.key(index)!;
    legacy[key]=localStorage.getItem(key)!;
  }
  let snapshot=await api.initialize(legacy);
  if(snapshot.recoveryRequired) throw new Error('The local database is missing. Restore a full backup to recover your data.');
  if (!Object.hasOwn(snapshot.data, 'expenseCategories')) snapshot=await api.mutate({changes:{expenseCategories:Object.values(expenseCategoryDetails)},revision:snapshot.revision,replace:false});
  client=new SqliteClient(api,snapshot);
}

/** Synchronous reads are detached runtime snapshots; all persistence is asynchronous. */
export class SqliteClient {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private api: StateApi, private snapshot: Snapshot) {}
  read(key: string): any {
    let value=this.snapshot.data[key] ?? null;
    if(key==='monthlyData' && value) {
      const categories=this.snapshot.data['expenseCategories'] ?? Object.values(expenseCategoryDetails);
      const ids=new Set(categories.map((category:any)=>category.value));
      value=Object.fromEntries(Object.entries(value).map(([month,record]:[string,any])=>
        [month,calculateMonth(record.rawInput,month,record.lastUpdated,id=>ids.has(id))]));
    }
    if(key==='trackedCategories' && value) value={...value,avgIncome:value.avgIncome??0,trackingCategories:value.trackingCategories.map((item:any)=>
      ({currentSpending:0,percentageSpent:0,...item}))};
    return value===null?null:structuredClone(value);
  }
  private enqueue(operation:()=>Promise<Snapshot>): Promise<void> {
    const result=this.tail.then(operation).then(snapshot=>{this.snapshot=snapshot;});
    this.tail=result.catch(()=>{});
    return result;
  }
  mutate(changes:Record<string,unknown>,replace=false):Promise<void> {
    const detached=JSON.parse(JSON.stringify(changes));
    return this.enqueue(()=>this.api.mutate({changes:detached,revision:this.snapshot.revision,replace}));
  }
  restore(text:string):Promise<void> {
    return this.enqueue(()=>this.api.restore({text,revision:this.snapshot.revision}));
  }
  deleteCategory(id:string):Promise<void> {
    return this.enqueue(()=>this.api.deleteCategory({id,revision:this.snapshot.revision}));
  }
  reset():Promise<void> { return this.enqueue(()=>this.api.reset(this.snapshot.revision)); }
  async exportBackup():Promise<string> { await this.tail; return this.api.exportBackup(); }
  legacyChanges(changes:ReadonlyMap<string,string|null>):Promise<void> {
    return this.mutate(Object.fromEntries([...changes].map(([key,value])=>
      [key,value===null?null:textKeys.has(key)?value:JSON.parse(value)])));
  }
}
