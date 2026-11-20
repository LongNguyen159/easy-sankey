import { BudgetEnvelope, expenseCategoryDetails } from '../components/models';
import {CONFIGURATION,DATABASE_CLIENT,Settings} from '../data/database';
import { DatabaseClient } from '../data/database';
import { DatabaseApi, StoredMonth, MonthSave, HistoryItem } from '../data/database';
/** Promise-based fake at the same boundary as the desktop bridge. No browser persistence. */
export function testDatabase() {
    let revision = 0;
    const configuration = { settings: { firstTime: 'false', appVersion: '2.0.4' } as Partial<Settings>, categories: structuredClone(Object.values(expenseCategoryDetails)), globalEnvelopes: [] as BudgetEnvelope[], fixedCosts: [], tracking: [], metadata: { targetSurplus: 0, avgIncome: 0 } };
    const months = new Map<string, StoredMonth>();
    const histories = new Map<string, HistoryItem[]>();
    const result = <T>(value: T) => ({ revision: ++revision, value: structuredClone(value), affected: [] });
    const entity = (key: 'categories' | 'fixedCosts' | 'tracking') => ({
        list: async () => ({ revision, items: structuredClone(configuration[key]) }),
        replace: async ({ items, metadata }: any) => { (configuration as any)[key] = structuredClone(items); if (metadata)
            configuration.metadata = metadata; return result(items); },
        create: async ({ item }: any) => { (configuration[key] as any[]).push(structuredClone(item)); return result(configuration[key]); },
        update: async ({ id, changes }: any) => { (configuration as any)[key] = (configuration[key] as any[]).map(value => (key==='categories'?value.value:key==='tracking'?value.name:value.id) === id ? {...value,...structuredClone(changes)} : value); return result(configuration[key]); },
        reorder: async ({ ids }: any) => { const map = new Map((configuration[key] as any[]).map(value => [value.value, value])); (configuration as any)[key] = ids.map((id: string) => map.get(id)); return result(configuration[key]); },
        delete: async ({id}:any)=>{if(key==='categories')return api.deleteCategory({id});(configuration as any)[key]=(configuration[key] as any[]).filter(item=>(key==='tracking'?item.name:item.id)!==id);return result(null);},
        get: async ({id}:any) => structuredClone((configuration[key] as any[]).find(item=>(key==='categories'?item.value:key==='tracking'?item.name:item.id)===id)??null),
    });
    const api = {
        status: async () => ({ revision, initialized: true, recoveryRequired: false }),
        settings: { list: async () => result(configuration.settings), set: async ({ key, value }: any) => { (configuration.settings as any)[key] = value; return result(value); } },
        categories: entity('categories'), fixedCosts: entity('fixedCosts'), tracking: entity('tracking'),
        trackingMetadata: async () => configuration.metadata,
        envelopes: {
          listGlobal: async () => structuredClone(configuration.globalEnvelopes),
          replaceGlobal: async ({items,base}: {items:BudgetEnvelope[];base:BudgetEnvelope[]}) => {
            if(JSON.stringify(base)!==JSON.stringify(configuration.globalEnvelopes)) throw new Error('CONFLICT');
            configuration.globalEnvelopes=structuredClone(items);
            const ids=new Set(items.map(item=>item.id));
            for(const month of months.values()) month.entries=month.entries.map(entry=>
              entry.envelopeId && base.some(item=>item.id===entry.envelopeId) && !ids.has(entry.envelopeId)
                ? {...entry,envelopeId:null} : entry);
            return result(items);
          },
        },
        months: {
            range: async () => result([...months.values()]), get: async (month: string) => structuredClone(months.get(month) ?? null),
            save: async (p: MonthSave) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month))
                throw new Error('Invalid month'); const old = months.get(p.month); if(p.globalEnvelopes) configuration.globalEnvelopes = structuredClone(p.globalEnvelopes); if (p.mode === 'create' && old)
                throw new Error('Month already exists'); if (p.mode === 'update' && !old)
                throw new Error('Month does not exist'); const record = { month: p.month, entries: structuredClone(p.entries), envelopes: structuredClone(p.envelopes ?? old?.envelopes ?? []), lastUpdated: p.lastUpdated, revision: revision + 1 }; months.set(p.month, record); for (const c of p.categories ?? [])
                if (!configuration.categories.some(item => item.value === c.value))
                    configuration.categories.push(c); return result(record); },
            remove: async ({ month }: any) => result(months.delete(month)), list: async () => [...months.keys()],
        },
        history: { list: async ({ month, id }: any) => result(histories.get(`${month}:${id}`) ?? []), cleanup: async () => result(null) },
        deleteCategory: async ({ id }: any) => { configuration.categories = configuration.categories.filter(item => item.value !== id); for (const record of months.values())
            record.entries = record.entries.map(item => { if (item.source !== id)
                return item; const { source, ...rest } = item; return rest; }); return result(null); },
    } as unknown as DatabaseApi;
    const client = new DatabaseClient(api);
    return { api, client, configuration, months, histories, providers: [{ provide: DATABASE_CLIENT, useValue: client }, { provide: CONFIGURATION, useValue: configuration }] };
}
export const TEST_DATABASE = { provide: DATABASE_CLIENT, useFactory: () => testDatabase().client };
export function provideTestDatabase() { const fake = testDatabase(); return fake.providers; }
