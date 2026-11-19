import type {Budget, ExpenseCategoryDetails, UserDefinedLink} from '../../src/app/components/models';
import type {CommandResult,DatabaseSnapshot,HistoryItem,MonthSave,StoredMonth,TrackingMetadata,TrackingTarget} from '../../src/app/storage/database-models';

/** Existing JavaScript store stays private to the main process. */
export interface Context {state:any; exportFile:()=>Promise<boolean>;}
export interface Operation<I,O> {
    channel:string;
    description:string;
    validate:(input:unknown)=>boolean;
    run:(context:Context,input:I)=>O|Promise<O>;
}
export type ClientOf<T> = {
    [K in keyof T]: T[K] extends Operation<infer I,infer O>
        ? undefined extends I ? (input?:I)=>Promise<Awaited<O>> : (input:I)=>Promise<Awaited<O>>
        : ClientOf<T[K]>;
};
const object=(input:unknown):input is Record<string,unknown>=>!!input&&typeof input==='object'&&!Array.isArray(input);
const month=(input:unknown)=>typeof input==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(input);
const record=(input:unknown):input is Record<string,unknown>=>object(input)&&(input['revision']===undefined||Number.isSafeInteger(input['revision']));
const id=(input:unknown):input is Record<string,unknown>=>record(input)&&typeof input['id']==='string'&&!!input['id'];
const scope=(input:unknown):input is Record<string,unknown>=>record(input)&&month(input['month']);
const scopedId=(input:unknown):input is Record<string,unknown>=>scope(input)&&id(input);
const none=(input:unknown)=>input===undefined;
function operation<I,O>(channel:string,description:string,validate:(input:unknown)=>boolean,run:(context:Context,input:I)=>O|Promise<O>):Operation<I,O>{
    return {channel:`database:${channel}`,description,validate,run};
}
type Revision={revision?:number};
function collection<T>(name:string) {
    return {
        list:operation<void,{revision:number;items:T[]}>(`${name}:list`,'List ordered records.',none,({state})=>state.crud.collection(name,'list')),
        get:operation<{id:string},T|null>(`${name}:get`,'Read one record by ID.',id,({state},input)=>state.crud.collection(name,'get',input)),
        create:operation<{item:T}&Revision,CommandResult<T>>(`${name}:create`,'Insert one record.',input=>record(input)&&object(input['item']),({state},input)=>state.crud.collection(name,'create',input)),
        update:operation<{id:string;item:T}&Revision,CommandResult<T>>(`${name}:update`,'Update one record.',input=>id(input)&&object(input['item']),({state},input)=>state.crud.collection(name,'update',input)),
        delete:operation<{id:string}&Revision,CommandResult<null>>(`${name}:delete`,'Delete a record; category deletion clears dependent references.',id,({state},input)=>state.crud.collection(name,'delete',input)),
        reorder:operation<{ids:string[]}&Revision,CommandResult<null>>(`${name}:reorder`,'Set the complete record order.',input=>record(input)&&Array.isArray(input['ids']),({state},input)=>state.crud.collection(name,'reorder',input)),
        replace:operation<{items:T[];base?:T[];metadata?:TrackingMetadata}&Revision,CommandResult<T[]>>(`${name}:replace`,'Explicit transactional collection replacement for bulk editing.',input=>record(input)&&Array.isArray(input['items']),({state},input)=>state.crud.collection(name,'replace',input)),
    };
}
/** Define an operation here once. Registration, bridge, client types and reference docs derive from this tree. */
export const operations={
    status:operation<void,{revision:number;initialized:boolean;recoveryRequired?:boolean}>('status','Read startup and migration status.',none,({state})=>state.crud.status()),
    settings:{
        list:operation<void,CommandResult<Record<string,unknown>>>('settings:list','Read preferences.',none,({state})=>state.crud.settings.list()),
        set:operation<{key:string;value:unknown},CommandResult<unknown>>('settings:set','Set one validated preference.',input=>record(input)&&typeof input['key']==='string'&&Object.hasOwn(input,'value'),({state},input)=>state.crud.settings.set(input)),
    },
    history:{
        list:operation<{month:string;id:string},CommandResult<HistoryItem[]>>('history:list','Read ordered history for one entry.',scopedId,({state},input)=>state.crud.history.list(input)),
        append:operation<{month:string;id:string;item:HistoryItem},CommandResult<null>>('history:append','Append history and retain five items.',input=>scopedId(input)&&object(input['item']),({state},input)=>state.crud.history.append(input)),
        cleanup:operation<{now?:number},CommandResult<null>>('history:cleanup','Apply history retention.',input=>record(input)&&(input['now']===undefined||typeof input['now']==='number'),({state},input)=>state.crud.history.cleanup(input)),
    },
    trackingMetadata:operation<void,TrackingMetadata>('tracking:metadata','Read tracking configuration metadata.',none,({state})=>state.crud.trackingMetadata()),
    deleteCategory:operation<{id:string},CommandResult<null>>('category:remove','Delete a category and clear dependent references atomically.',id,({state},input)=>state.crud.deleteCategory(input)),
    state:{
        initialize:operation<Record<string,string>,DatabaseSnapshot>('state:initialize','Import released LocalStorage once; retain the original data.',input=>object(input)&&Object.values(input).every(value=>typeof value==='string'),({state},input)=>state.initialize(input)),
        snapshot:operation<void,DatabaseSnapshot>('state:snapshot','Read a full snapshot for diagnostics/recovery.',none,({state})=>state.snapshot()),
        exportBackup:operation<void,string>('state:export','Export full JSON backup.',none,({state})=>state.exportBackup()),
        exportFile:operation<void,boolean>('state:export-file','Export backup using the native save dialog.',none,context=>context.exportFile()),
        restore:operation<{text:string;revision:number},DatabaseSnapshot>('state:restore','Validate and restore a full backup atomically.',input=>record(input)&&typeof input['text']==='string'&&Number.isSafeInteger(input['revision']),({state},input)=>state.restore(input.text,input.revision)),
        reset:operation<number,DatabaseSnapshot>('state:reset','Clear user data while retaining migration completion.',input=>Number.isSafeInteger(input)&&Number(input)>=0,({state},input)=>state.reset(input)),
    },
    months:{
        list:operation<void,string[]>('months:list','List saved month identifiers.',none,({state})=>state.crud.months.list()),
        get:operation<string,StoredMonth|null>('months:get','Read a month and its ordered entries.',month,({state},input)=>state.crud.months.get(input)),
        range:operation<{from?:string;to?:string}|undefined,CommandResult<StoredMonth[]>>('months:range','Read an inclusive month range.',input=>input===undefined||(record(input)&&(input['from']===undefined||month(input['from']))&&(input['to']===undefined||month(input['to']))),({state},input)=>state.crud.months.range(input)),
        save:operation<MonthSave,CommandResult<StoredMonth>>('months:save','Explicit transactional multi-row form/import save.',input=>scope(input)&&Array.isArray(input['entries'])&&typeof input['lastUpdated']==='string',({state},input)=>state.crud.months.save(input)),
        remove:operation<{month:string},CommandResult<boolean>>('months:remove','Delete one month and its history.',scope,({state},input)=>state.crud.months.delete(input)),
    },
    entries:{
        list:operation<{month:string},{revision:number;entries:UserDefinedLink[]}>('entries:list','Read ordered entries for a month.',scope,({state},input)=>state.crud.entries('list',input)),
        get:operation<{month:string;id:string},UserDefinedLink|null>('entries:get','Read one entry by its scoped ID.',scopedId,({state},input)=>state.crud.entries('get',input)),
        create:operation<{month:string;entry:UserDefinedLink}&Revision,CommandResult<UserDefinedLink|null>>('entries:create','Insert one entry.',input=>scope(input)&&object(input['entry']),({state},input)=>state.crud.entries('create',input)),
        update:operation<{month:string;id:string;entry:UserDefinedLink;expected?:UserDefinedLink;history?:Record<string,HistoryItem>}&Revision,CommandResult<UserDefinedLink|null>>('entries:update','Update one entry and optional history; repair parent references atomically.',input=>scopedId(input)&&object(input['entry']),({state},input)=>state.crud.entries('update',input)),
        delete:operation<{month:string;id:string}&Revision,CommandResult<null>>('entries:delete','Delete one entry/history and reparent its children.',scopedId,({state},input)=>state.crud.entries('delete',input)),
        reorder:operation<{month:string;ids:string[]}&Revision,CommandResult<null>>('entries:reorder','Update entry positions.',input=>scope(input)&&Array.isArray(input['ids']),({state},input)=>state.crud.entries('reorder',input)),
    },
    categories:collection<ExpenseCategoryDetails>('expenseCategories'),
    budgets:collection<Budget>('budgets'),
    fixedCosts:collection<UserDefinedLink>('fixCosts'),
    tracking:collection<TrackingTarget>('trackedCategories'),
};
