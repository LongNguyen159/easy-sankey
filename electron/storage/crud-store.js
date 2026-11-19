const { canonical, entries: validateEntries, collections, keys } = require('./schema');
const { isDeepStrictEqual } = require('node:util');
/** Runtime operations deliberately have no access to the full-state snapshot. */
function createCrudStore(db, readRevision) {
    const prepared = new Map();
    const prepare = sql => {
        if (!prepared.has(sql)) prepared.set(sql, db.prepare(sql));
        return prepared.get(sql);
    };
    const statements = {
        month: prepare('SELECT month,last_updated FROM months WHERE month=?'),
        months: prepare('SELECT month,last_updated FROM months WHERE month>=? AND month<=? ORDER BY month'),
        entries: prepare('SELECT payload FROM entries WHERE month=? ORDER BY position'),
        rangeEntries: prepare('SELECT month,payload FROM entries WHERE month>=? AND month<=? ORDER BY month,position'),
        records: prepare('SELECT value FROM records WHERE collection=? ORDER BY position'),
        record: prepare('SELECT value FROM records WHERE collection=? AND id=?'),
        document: prepare('SELECT value FROM documents WHERE key=?'),
        putDocument: prepare('INSERT INTO documents VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value<>excluded.value'),
        putEntry: prepare('INSERT INTO entries VALUES(?,?,?,?) ON CONFLICT(month,id) DO UPDATE SET position=excluded.position,payload=excluded.payload WHERE position<>excluded.position OR payload<>excluded.payload'),
        putRecord: prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET position=excluded.position,value=excluded.value WHERE position<>excluded.position OR value<>excluded.value'),
        revision: prepare("UPDATE migration_metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'"),
    };
    const fail = (code, message) => { throw new Error(`${code}: ${message}`); };
    const checkMonth = month => { if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        fail('VALIDATION', 'Invalid month.'); };
    const document = key => { const row = statements.document.get(key); return row ? JSON.parse(row.value) : null; };
    const records = collection => statements.records.all(collection).map(row => JSON.parse(row.value));
    const entryList = month => statements.entries.all(month).map(row => JSON.parse(row.payload));
    const knownSources = values => { for (const value of values)
        if (value.source?.endsWith('@__system/category__') && !statements.record.get('expenseCategories', value.source))
            fail('VALIDATION', 'An entry refers to a missing category.'); };
    const result = (value, affected = []) => ({ revision: readRevision(), value, affected });
    const transaction = operation => db.transaction(payload => {
        if (!payload || typeof payload !== 'object')
            fail('VALIDATION', 'Invalid request.');
        if (payload.revision !== undefined && payload.revision !== readRevision())
            fail('CONFLICT', 'Storage changed. Reload before saving.');
        const outcome = operation(payload);
        if (outcome.changed)
            statements.revision.run();
        return result(outcome.value, outcome.affected);
    });
    function syncRecords(collection, items) {
        const identity = collection === 'trackedCategories' ? 'name' : collections[collection];
        const ids = new Set(items.map(item => item[identity]));
        if (ids.size !== items.length)
            fail('VALIDATION', 'Duplicate record identity.');
        for (const row of prepare('SELECT id FROM records WHERE collection=?').all(collection))
            if (!ids.has(row.id))
                prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection, row.id);
        items.forEach((item, index) => statements.putRecord.run(collection, item[identity], index, JSON.stringify(item)));
    }
    function readMonth(month) {
        checkMonth(month);
        const row = statements.month.get(month);
        return row ? { month, lastUpdated: row.last_updated, entries: entryList(month), revision: readRevision() } : null;
    }
    function saveMonth(payload) {
        const { month, entries, lastUpdated } = payload;
        checkMonth(month);
        canonical('monthlyData', { [month]: { month, lastUpdated, rawInput: entries } });
        const old = readMonth(month);
        if (payload.mode === 'create' && old)
            fail('ALREADY_EXISTS', 'Month already exists.');
        if (payload.mode === 'update' && !old)
            fail('NOT_FOUND', 'Month does not exist.');
        if (payload.base !== undefined && !isDeepStrictEqual(old?.entries ?? [], payload.base))
            fail('CONFLICT', 'Month changed. Reload before saving.');
        if (payload.categories) {
            canonical('expenseCategories', payload.categories);
            for (const item of payload.categories)
                if (!statements.record.get('expenseCategories', item.value)) {
                    const position = records('expenseCategories').length;
                    statements.putRecord.run('expenseCategories', item.value, position, JSON.stringify(item));
                }
            statements.putDocument.run('expenseCategories', 'true');
        }
        validateEntries(entries);
        knownSources(entries);
        const changed = !old || !isDeepStrictEqual(old.entries, entries) || old.lastUpdated !== lastUpdated || payload.clearHistory || !!payload.history;
        if (changed) {
            prepare('INSERT INTO months(month,last_updated) VALUES(?,?) ON CONFLICT(month) DO UPDATE SET last_updated=excluded.last_updated WHERE last_updated<>excluded.last_updated').run(month, lastUpdated);
            const ids = new Set(entries.map(item => item.id));
            for (const row of prepare('SELECT id FROM entries WHERE month=?').all(month))
                if (!ids.has(row.id)) {
                    prepare('DELETE FROM entries WHERE month=? AND id=?').run(month, row.id);
                    prepare('DELETE FROM entry_history WHERE month=? AND entry_id=?').run(month, row.id);
                }
            entries.forEach((item, index) => statements.putEntry.run(month, item.id, index, JSON.stringify(item)));
            statements.putDocument.run('monthlyData', 'true');
            if (payload.clearHistory)
                prepare('DELETE FROM entry_history WHERE month=?').run(month);
            if (payload.history)
                for (const [id, item] of Object.entries(payload.history)) {
                    if (!ids.has(id))
                        fail('VALIDATION', 'History entry does not exist.');
                    appendHistory(month, id, item);
                }
        }
        return { changed, value: readMonth(month), affected: [`month:${month}`, ...(payload.categories ? ['categories'] : [])] };
    }
    function appendHistory(month, id, item) {
        canonical('logs', { [month]: { [id]: [item] } });
        prepare('DELETE FROM entry_history WHERE month=? AND entry_id=? AND position>=4').run(month,id);
        prepare('UPDATE entry_history SET position=-position-1 WHERE month=? AND entry_id=?').run(month,id);
        prepare('UPDATE entry_history SET position=-position WHERE month=? AND entry_id=?').run(month,id);
        prepare('INSERT INTO entry_history VALUES(?,?,0,?)').run(month,id,JSON.stringify(item));
    }
    db.function('entry_name', {deterministic:true}, value=>String(value).trim().toLowerCase());
    const getEntry=(month,id)=>{
        const row=prepare('SELECT payload FROM entries WHERE month=? AND id=?').get(month,id);
        return row?JSON.parse(row.payload):null;
    };
    function validateMonthHierarchy(month, templates=false) {
        const table=templates?"records":"entries";
        const column=templates?"collection":"month";
        const payload=templates?"value":"payload";
        const cycle=prepare(`WITH RECURSIVE edges AS (
            SELECT json_extract(${payload},'$.target') AS target,json_extract(${payload},'$.source') AS source
            FROM ${table} WHERE ${column}=? AND json_extract(${payload},'$.type')='expense'
        ), paths(start,node) AS (
            SELECT target,source FROM edges UNION
            SELECT paths.start,edges.source FROM paths JOIN edges ON edges.target=paths.node
        ) SELECT 1 FROM paths WHERE start=node LIMIT 1`).get(month);
        if(cycle)fail('VALIDATION','Expense hierarchy contains a cycle.');
    }
    function reorder(table,scope,ids) {
        if(!Array.isArray(ids)||new Set(ids).size!==ids.length)fail('VALIDATION','Invalid record order.');
        const column=table==='entries'?'month':'collection';
        if(prepare(`SELECT count(*) AS count FROM ${table} WHERE ${column}=?`).get(scope).count!==ids.length)fail('VALIDATION','Invalid record order.');
        let changed=false;
        for(const [position,id] of ids.entries()) {
            const row=prepare(`SELECT position FROM ${table} WHERE ${column}=? AND id=?`).get(scope,id);
            if(!row)fail('VALIDATION','Unknown record.');
            if(row.position!==position){prepare(`UPDATE ${table} SET position=? WHERE ${column}=? AND id=?`).run(position,scope,id);changed=true;}
        }
        return changed;
    }
    const deleteCategory = transaction(({ id }) => {
        if (typeof id !== 'string')
            fail('VALIDATION', 'Invalid category.');
        if (!statements.record.get('expenseCategories', id))
            return { changed: false, value: null, affected: [] };
        const affected = prepare("SELECT DISTINCT month FROM entries WHERE json_extract(payload,'$.source')=?").all(id).map(row => row.month);
        prepare("UPDATE entries SET payload=json_remove(payload,'$.source') WHERE json_extract(payload,'$.source')=?").run(id);
        prepare("UPDATE records SET value=json_remove(value,'$.source') WHERE collection='fixCosts' AND json_extract(value,'$.source')=?").run(id);
        for (const collection of ['expenseCategories', 'budgets', 'trackedCategories'])
            prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection, id);
        for (const key of ['essentialCategories', 'budgetManualOrder']) {
            const value = document(key);
            if (value?.includes(id))
                statements.putDocument.run(key, JSON.stringify(value.filter(value => value !== id)));
        }
        return { changed: true, value: null, affected: ['categories', 'budgets', 'tracking', 'fixedCosts', 'settings', ...affected.map(month => `month:${month}`)] };
    });
    return {
        status: () => ({revision:readRevision(),initialized:true}),
        months: {
            list: () => prepare('SELECT month FROM months ORDER BY month').all().map(row => row.month),
            get: readMonth,
            range: ({ from = '0000-01', to = '9999-12' } = {}) => {
                checkMonth(from);
                checkMonth(to);
                if (from > to)
                    fail('VALIDATION', 'Invalid month range.');
                const items = statements.months.all(from, to).map(row => ({ month: row.month, lastUpdated: row.last_updated, entries: [] }));
                const byMonth = new Map(items.map(item => [item.month, item]));
                for (const row of statements.rangeEntries.all(from, to))
                    byMonth.get(row.month).entries.push(JSON.parse(row.payload));
                return result(items);
            },
            save: transaction(saveMonth),
            delete: transaction(({ month }) => { checkMonth(month); const changed = !!prepare('DELETE FROM months WHERE month=?').run(month).changes; prepare('DELETE FROM entry_history WHERE month=?').run(month); return { changed, value: changed, affected: [`month:${month}`] }; }),
        },
        entries: (action, payload) => {
            checkMonth(payload?.month);
            if(!statements.month.get(payload.month))fail('NOT_FOUND','Month does not exist.');
            if(action==='list')return {revision:readRevision(),entries:entryList(payload.month)};
            if(action==='get')return getEntry(payload.month,payload.id);
            return transaction(p=>{
                const {month,id}=p;
                const previous=id?getEntry(month,id):null;
                if(p.expected!==undefined&&!isDeepStrictEqual(previous,p.expected))fail('CONFLICT','Entry changed. Reload before saving.');
                let changed=false;
                if(action==='create'||action==='update') {
                    const item=p.entry;
                    validateEntries([item]);knownSources([item]);
                    if(action==='update'&&(!previous||item.id!==id))fail('NOT_FOUND','Entry does not exist.');
                    if(action==='create'&&getEntry(month,item.id))fail('ALREADY_EXISTS','Entry already exists.');
                    if(prepare("SELECT 1 FROM entries WHERE month=? AND id<>? AND entry_name(json_extract(payload,'$.target'))=entry_name(?) LIMIT 1").get(month,item.id,item.target))fail('VALIDATION','Duplicate entry name.');
                    changed=!isDeepStrictEqual(previous,item);
                    if(changed) {
                        if(action==='create')prepare('INSERT INTO entries(month,id,position,payload) SELECT ?,?,COALESCE(MAX(position)+1,0),? FROM entries WHERE month=?').run(month,item.id,JSON.stringify(item),month);
                        else prepare('UPDATE entries SET payload=? WHERE month=? AND id=?').run(JSON.stringify(item),month,id);
                        if(previous&&previous.target!==item.target)prepare("UPDATE entries SET payload=json_set(payload,'$.source',?) WHERE month=? AND json_extract(payload,'$.source')=?").run(item.target,month,previous.target);
                        if(!previous||previous.target!==item.target||previous.source!==item.source||previous.type!==item.type)validateMonthHierarchy(month);
                    }
                } else if(action==='delete') {
                    if(previous) {
                        prepare('DELETE FROM entries WHERE month=? AND id=?').run(month,id);
                        prepare('DELETE FROM entry_history WHERE month=? AND entry_id=?').run(month,id);
                        if(previous.source)prepare("UPDATE entries SET payload=json_set(payload,'$.source',?) WHERE month=? AND json_extract(payload,'$.source')=?").run(previous.source,month,previous.target);
                        else prepare("UPDATE entries SET payload=json_remove(payload,'$.source') WHERE month=? AND json_extract(payload,'$.source')=?").run(month,previous.target);
                        changed=true;
                    }
                } else if(action==='reorder')changed=reorder('entries',month,p.ids);
                else fail('VALIDATION','Unsupported entry operation.');
                if(p.history)for(const [entryId,item] of Object.entries(p.history)) {
                    if(!getEntry(month,entryId))fail('VALIDATION','History entry does not exist.');
                    appendHistory(month,entryId,item);changed=true;
                }
                if(changed)prepare('UPDATE months SET last_updated=? WHERE month=?').run(new Date().toISOString(),month);
                return {changed,value:action==='create'||action==='update'?getEntry(month,p.entry.id):null,affected:[`month:${month}`]};
            })(payload);
        },
        collection: (collection, action, payload = {}) => {
            const identity = collection === 'trackedCategories' ? 'name' : collections[collection];
            if (!identity)
                fail('VALIDATION', 'Unsupported collection.');
            if (action === 'list')
                return { revision: readRevision(), items: records(collection) };
            if (action === 'get') {
                const row = statements.record.get(collection, payload.id);
                return row ? JSON.parse(row.value) : null;
            }
            if (collection === 'expenseCategories' && action === 'delete')
                return deleteCategory(payload);
            if(action!=='replace')return transaction(p=>{
                const row=p.id?statements.record.get(collection,p.id):null;
                const previous=row?JSON.parse(row.value):null;
                let changed=false;
                let value=null;
                if(action==='create'||action==='update') {
                    let item=p.item;
                    if(collection==='trackedCategories')item=canonical(collection,{targetSurplus:0,trackingCategories:[item]}).trackingCategories[0];
                    else canonical(collection,[item]);
                    if(collection==='fixCosts') {
                        knownSources([item]);
                        if(prepare("SELECT 1 FROM records WHERE collection='fixCosts' AND id<>? AND entry_name(json_extract(value,'$.target'))=entry_name(?) LIMIT 1").get(item.id,item.target))fail('VALIDATION','Duplicate entry name.');
                    }
                    const id=item[identity];
                    if(action==='create'&&statements.record.get(collection,id))fail('ALREADY_EXISTS','Record already exists.');
                    if(action==='update'&&(!previous||id!==p.id))fail('NOT_FOUND','Record does not exist.');
                    changed=!isDeepStrictEqual(previous,item);
                    if(changed) {
                        if(action==='create')prepare('INSERT INTO records(collection,id,position,value) SELECT ?,?,COALESCE(MAX(position)+1,0),? FROM records WHERE collection=?').run(collection,id,JSON.stringify(item),collection);
                        else prepare('UPDATE records SET value=? WHERE collection=? AND id=?').run(JSON.stringify(item),collection,id);
                        if(collection==='fixCosts')validateMonthHierarchy('fixCosts',true);
                        statements.putDocument.run(collection,'true');
                    }
                    value=item;
                } else if(action==='delete')changed=!!prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,p.id).changes;
                else if(action==='reorder')changed=reorder('records',collection,p.ids);
                else fail('VALIDATION','Unsupported collection operation.');
                return {changed,value,affected:[collection]};
            })(payload);
            return transaction(p => {
                const old = records(collection);
                let items = p.items;
                if (p.base !== undefined && !isDeepStrictEqual(old, p.base))
                    fail('CONFLICT', 'Collection changed. Reload before saving.');
                const oldMetadata = document('trackingMetadata') ?? { targetSurplus: 0, avgIncome: 0 };
                if (collection === 'trackedCategories') {
                    const meta = p.metadata ?? document('trackingMetadata') ?? { targetSurplus: 0, avgIncome: 0 };
                    items = canonical(collection, { ...meta, trackingCategories: items }).trackingCategories;
                    if (p.metadata)
                        statements.putDocument.run('trackingMetadata', JSON.stringify(meta));
                }
                else
                    canonical(collection, items);
                if (collection === 'fixCosts')
                    knownSources(items);
                if (collection === 'expenseCategories') {
                    const ids = new Set(items.map(item => item.value));
                    for (const removed of old.filter(item => !ids.has(item.value))) {
                        if (prepare("SELECT 1 FROM entries WHERE json_extract(payload,'$.source')=? LIMIT 1").get(removed.value) || prepare("SELECT 1 FROM records WHERE collection='fixCosts' AND json_extract(value,'$.source')=? LIMIT 1").get(removed.value))
                            fail('VALIDATION', 'An entry refers to a missing category.');
                    }
                }
                syncRecords(collection, items);
                statements.putDocument.run(collection, 'true');
                return { changed: !isDeepStrictEqual(old, items) || (!!p.metadata && !isDeepStrictEqual(oldMetadata, p.metadata)), value: items, affected: [collection] };
            })(payload);
        },
        settings: {
            list: () => result(Object.fromEntries([...keys].filter(key => !['monthlyData', 'expenseCategories', 'fixCosts', 'budgets', 'trackedCategories', 'logs'].includes(key)).map(key => [key, document(key)]).filter(([, value]) => value !== null))),
            set: transaction(({ key, value }) => { if (!keys.has(key) || ['monthlyData', 'expenseCategories', 'fixCosts', 'budgets', 'trackedCategories', 'logs'].includes(key))
                fail('VALIDATION', 'Unsupported preference.'); canonical(key, value); const old = document(key); if (value === null)
                prepare('DELETE FROM documents WHERE key=?').run(key);
            else
                statements.putDocument.run(key, JSON.stringify(value)); return { changed: !isDeepStrictEqual(old, value), value, affected: ['settings'] }; }),
        },
        trackingMetadata: () => document('trackingMetadata') ?? { targetSurplus: 0, avgIncome: 0 },
        history: {
            list: ({ month, id }) => { checkMonth(month); return result(prepare('SELECT value FROM entry_history WHERE month=? AND entry_id=? ORDER BY position').all(month, id).map(row => JSON.parse(row.value))); },
            append: transaction(({ month, id, item }) => { checkMonth(month); if (!getEntry(month,id))
                fail('NOT_FOUND', 'Entry does not exist.'); appendHistory(month, id, item); return { changed: true, value: null, affected: [`history:${month}:${id}`] }; }),
            cleanup: transaction(({ now = Date.now() }) => { if (!Number.isFinite(now))
                fail('VALIDATION', 'Invalid cleanup time.'); let changed = false; for (const row of prepare('SELECT month,last_updated FROM months').all())
                if (now - Date.parse(row.last_updated) > 30 * 86400000)
                    changed = !!prepare('DELETE FROM entry_history WHERE month=?').run(row.month).changes || changed; return { changed, value: null, affected: ['history'] }; }),
        },
        deleteCategory,
    };
}
module.exports = { createCrudStore };
