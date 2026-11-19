const { isDeepStrictEqual } = require('node:util');
const Database = require('better-sqlite3');
const { mkdirSync, writeFileSync, renameSync, existsSync, chmodSync } = require('node:fs');
const { dirname } = require('node:path');
const defaultCategories=require('./default-categories.json');
const { keys, textKeys, collections, canonical, object } = require('./schema');

function openStateStore(filename) {
  mkdirSync(dirname(filename), { recursive:true });
  const recoveryRequired=!existsSync(filename) && existsSync(`${filename}.initialized`);
  const db = new Database(filename);
  try {
    const version = db.pragma('user_version',{simple:true});
    if (version > 3) throw new Error('Database needs a newer application.');
    chmodSync(filename,0o600);
    if(version>0 && version<3) db.prepare('VACUUM INTO ?').run(`${filename}.schema-${version}-${Date.now()}.sqlite`);
    db.pragma('foreign_keys=ON'); db.pragma('busy_timeout=5000');
    db.pragma('journal_mode=WAL'); db.pragma('synchronous=FULL');
    db.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS documents(key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
        CREATE TABLE IF NOT EXISTS records(collection TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL,
          value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(collection,id));
        CREATE TABLE IF NOT EXISTS migration_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        INSERT OR IGNORE INTO migration_metadata VALUES('revision','0');
        CREATE TABLE IF NOT EXISTS months(month TEXT PRIMARY KEY,last_updated TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS entries(month TEXT NOT NULL REFERENCES months(month) ON DELETE CASCADE,
          id TEXT NOT NULL,position INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),PRIMARY KEY(month,id));
`);
    })();
    if(recoveryRequired) db.prepare("INSERT OR REPLACE INTO migration_metadata VALUES('legacy-import','recovery-required')").run();
    const readRevision = () => Number(db.prepare("SELECT value FROM migration_metadata WHERE key='revision'").get().value);
    const migrated = () => !!db.prepare("SELECT value FROM migration_metadata WHERE key='legacy-import'").get();
    const get = key => {
      if (!keys.has(key)) throw new Error('Unsupported storage field.');
      if (key === 'monthlyData') {
        const marker=db.prepare('SELECT value FROM documents WHERE key=?').get(key);
        if (!marker) return null;
        return Object.fromEntries(db.prepare('SELECT month,last_updated FROM months ORDER BY month').all()
          .map(row=>[row.month,{month:row.month,lastUpdated:row.last_updated,
            rawInput:db.prepare('SELECT payload FROM entries WHERE month=? ORDER BY position').all(row.month).map(value=>JSON.parse(value.payload))}]));
      }
      if (collections[key]) {
        if (!db.prepare('SELECT value FROM documents WHERE key=?').get(key)) return null;
        return db.prepare('SELECT value FROM records WHERE collection=? ORDER BY position').all(key).map(r => JSON.parse(r.value));
      }
      const row=db.prepare('SELECT value FROM documents WHERE key=?').get(key);
      return row ? JSON.parse(row.value) : null;
    };
    const put = (key,input) => {
      const value=canonical(key,input);
      if(key==='monthlyData') {
        const next=value ?? {};
        for(const row of db.prepare('SELECT month FROM months').all()) if(!Object.hasOwn(next,row.month))db.prepare('DELETE FROM months WHERE month=?').run(row.month);
        for(const [month,record] of Object.entries(next)) {
          db.prepare('INSERT INTO months(month,last_updated) VALUES(?,?) ON CONFLICT(month) DO UPDATE SET last_updated=excluded.last_updated WHERE months.last_updated<>excluded.last_updated').run(month,record.lastUpdated);
          const ids=new Set(record.rawInput.map(entry=>entry.id));
          for(const row of db.prepare('SELECT id FROM entries WHERE month=?').all(month))if(!ids.has(row.id))db.prepare('DELETE FROM entries WHERE month=? AND id=?').run(month,row.id);
          record.rawInput.forEach((entry,position)=>db.prepare('INSERT INTO entries VALUES(?,?,?,?) ON CONFLICT(month,id) DO UPDATE SET position=excluded.position,payload=excluded.payload WHERE entries.position<>excluded.position OR entries.payload<>excluded.payload').run(month,entry.id,position,JSON.stringify(entry)));
        }
      } else if (collections[key]) {
        const collection=key==='monthlyData' ? 'months' : key;
        const existing=db.prepare('SELECT id FROM records WHERE collection=?').all(collection);
        const nextIds=new Set(value===null?[]:key==='monthlyData'?Object.keys(value):value.map(v=>v[collections[key]]));
        for(const row of existing)if(!nextIds.has(row.id))db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,row.id);
        if(value!==null) {
          const records=key==='monthlyData' ? Object.entries(value) : value.map(v => [v[collections[key]],v]);
          records.forEach(([id,item],position) => db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET position=excluded.position,value=excluded.value WHERE records.position<>excluded.position OR records.value<>excluded.value').run(collection,id,position,JSON.stringify(item)));
        }
      }
      if(value===null) db.prepare('DELETE FROM documents WHERE key=?').run(key);
      else db.prepare('INSERT INTO documents VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,
        JSON.stringify(key==='monthlyData'||collections[key] ? true : value));
    };
    const snapshot=()=>({revision:readRevision(),initialized:migrated(),recoveryRequired:db.prepare("SELECT value FROM migration_metadata WHERE key='legacy-import'").get()?.value==='recovery-required',data:Object.fromEntries([...keys].map(k=>[k,get(k)]).filter(([,v])=>v!==null))});
    const mutate=db.transaction((changes,revision,replace=false)=>{
      if(revision!==readRevision()) throw new Error('Storage changed. Reload before saving.');
      if(!object(changes)) throw new Error('Invalid storage changes.');
      for(const [key,value] of Object.entries(changes)) canonical(key,value);
      const definitions=Object.hasOwn(changes,'expenseCategories')?changes.expenseCategories:(replace?null:get('expenseCategories'));
      {
        const known=new Set((definitions??[]).map(value=>value.value));
        const months=Object.hasOwn(changes,'monthlyData')?changes.monthlyData:(replace?{}:get('monthlyData'));
        const templates=Object.hasOwn(changes,'fixCosts')?changes.fixCosts:(replace?[]:get('fixCosts'));
        const values=[...Object.values(months??{}).flatMap(record=>record.rawInput),...(templates??[])];
        if(values.some(value=>value.source?.endsWith('@__system/category__')&&!known.has(value.source)))throw new Error('An entry refers to a missing category.');
      }
      if(replace) { db.exec('DELETE FROM documents; DELETE FROM records; DELETE FROM months;'); }
      for(const [key,value] of Object.entries(changes)) put(key,value);
      db.prepare("UPDATE migration_metadata SET value=? WHERE key='revision'").run(String(revision+1));
      db.prepare("INSERT OR REPLACE INTO migration_metadata VALUES('legacy-import','complete')").run();
      writeFileSync(`${filename}.initialized`,'SQLite is authoritative',{mode:0o600});
      return snapshot();
    });
    const backupPayload=()=>({app:'easy-sankey',version:2,type:'full',exportedAt:new Date().toISOString(),
      data:Object.fromEntries(Object.entries(snapshot().data).filter(([key])=>!['appVersion','firstTime'].includes(key)))});
    if(version<3) db.transaction(()=>{
      const previous=db.prepare("SELECT id,value FROM records WHERE collection='months'").all();
      if(previous.length) {
        const data=Object.fromEntries(previous.map(row=>[row.id,JSON.parse(row.value)]));
        put('monthlyData',data);
        db.prepare("DELETE FROM records WHERE collection='months'").run();
      }
      db.pragma('user_version=3');
    })();
    return {
      snapshot, mutate,
      initialize:db.transaction(legacy=>{
        if(migrated()) return snapshot();
        if(db.prepare('SELECT COUNT(*) AS count FROM documents').get().count || db.prepare('SELECT COUNT(*) AS count FROM months').get().count) throw new Error('Existing unmarked database requires recovery.');
        if(!object(legacy)) throw new Error('Invalid legacy snapshot.');
        const values={};
        for(const key of keys) if(Object.hasOwn(legacy,key)) {
          const raw=legacy[key];
          if(typeof raw!=='string') throw new Error('Invalid legacy value.');
          values[key]=textKeys.has(key)?raw:JSON.parse(raw);
          canonical(key,values[key]);
        }
        writeFileSync(`${filename}.legacy.json`,JSON.stringify(legacy),{mode:0o600});
        if(!Object.hasOwn(values,'expenseCategories'))values.expenseCategories=defaultCategories;
        const result=mutate(values,readRevision());
        for(const [key,value] of Object.entries(values)) {
          const expected=canonical(key,value);
          const actual=Object.hasOwn(result.data,key)?result.data[key]:null;
          if(!isDeepStrictEqual(actual,expected)) throw new Error(`Migration verification failed for ${key}.`);
        }
        writeFileSync(`${filename}.initialized`,'SQLite is authoritative', {mode:0o600});
        return result;
      }),
      monthOperation(action, payload) {
        const current=snapshot(), months=current.data.monthlyData ?? {};
        const month=typeof payload==='string'?payload:payload?.month;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error('Invalid month.');
        const existing=months[month];
        if(action==='get') return existing ? {month:existing.month,lastUpdated:existing.lastUpdated,entries:existing.rawInput,revision:current.revision}:null;
        if(action==='delete') {
          if(!existing) return false;
          delete months[month];
          const logs=current.data.logs ?? {}; delete logs[month];
          mutate({monthlyData:months,logs},current.revision); return true;
        }
        if(action==='create' && existing) throw new Error('Month already exists.');
        if(action==='update' && !existing) throw new Error('Month does not exist.');
        if(action==='update' && payload.revision!==current.revision) throw new Error('Storage changed. Reload before saving.');
        months[month]={month,lastUpdated:payload.lastUpdated,rawInput:payload.entries};
        const result=mutate({monthlyData:months},current.revision);
        return {month,lastUpdated:result.data.monthlyData[month].lastUpdated,entries:result.data.monthlyData[month].rawInput,revision:result.revision};
      },
      entryOperation(action,payload) {
        const current=snapshot();
        const months=current.data.monthlyData ?? {};
        const record=months[payload?.month];
        if(!record) throw new Error('Month does not exist.');
        if(action==='list') return {revision:current.revision,entries:record.rawInput};
        const index=record.rawInput.findIndex(v=>v.id===payload.id);
        if(action==='get') return index<0?null:record.rawInput[index];
        if(payload.revision!==current.revision) throw new Error('Storage changed. Reload before saving.');
        if(action==='create') {
          if(record.rawInput.some(v=>v.id===payload.entry?.id)) throw new Error('Entry already exists.');
          record.rawInput.push(payload.entry);
        } else if(action==='reorder') {
          if(!Array.isArray(payload.ids)||new Set(payload.ids).size!==record.rawInput.length
            ||payload.ids.length!==record.rawInput.length) throw new Error('Invalid entry order.');
          const byId=new Map(record.rawInput.map(v=>[v.id,v]));
          record.rawInput=payload.ids.map(id=>{if(!byId.has(id))throw new Error('Unknown entry.');return byId.get(id);});
        } else if(action==='delete') {
          if(index<0)return current;
          const removed=record.rawInput[index];
          record.rawInput.splice(index,1);
          record.rawInput=record.rawInput.map(value=>value.source===removed.target?{...value,source:removed.source}:value);
        } else if(action==='update') {
          if(index<0||payload.entry?.id!==payload.id)throw new Error('Entry does not exist.');
          const previous=record.rawInput[index];record.rawInput[index]=payload.entry;
          record.rawInput=record.rawInput.map(value=>value.source===previous.target?{...value,source:payload.entry.target}:value);
        } else throw new Error('Unsupported entry operation.');
        record.lastUpdated=new Date().toISOString();
        return mutate({monthlyData:months},current.revision);
      },
      collectionOperation(collection,action,payload={}) {
        const identity=collection==='trackedCategories'?'name':collections[collection];
        if(!identity)throw new Error('Unsupported collection.');
        const current=snapshot(), values=collection==='trackedCategories'?(current.data.trackedCategories?.trackingCategories??[]):(current.data[collection] ?? []);
        const commit=items=>mutate(collection==='trackedCategories'?{trackedCategories:{targetSurplus:current.data.trackedCategories?.targetSurplus??0,avgIncome:current.data.trackedCategories?.avgIncome??0,trackingCategories:items}}:{[collection]:items},current.revision);
        if(action==='list')return {revision:current.revision,items:values};
        const index=values.findIndex(v=>v[identity]===payload.id);
        if(action==='get')return index<0?null:values[index];
        if(payload.revision!==current.revision)throw new Error('Storage changed. Reload before saving.');
        if(action==='create') {
          if(values.some(v=>v[identity]===payload.item?.[identity]))throw new Error('Record already exists.');
          values.push(payload.item);
        } else if(action==='update') {
          if(index<0||payload.item?.[identity]!==payload.id)throw new Error('Record does not exist.');
          values[index]=payload.item;
        } else if(action==='delete') {
          if(collection==='expenseCategories')throw new Error('Use transactional category deletion.');
          if(index<0)return current;
          values.splice(index,1);
        } else if(action==='reorder') {
          if(!Array.isArray(payload.ids)||payload.ids.length!==values.length
            ||new Set(payload.ids).size!==values.length)throw new Error('Invalid record order.');
          const byId=new Map(values.map(v=>[v[identity],v]));
          const sorted=payload.ids.map(id=>{if(!byId.has(id))throw new Error('Unknown record.');return byId.get(id);});
          return commit(sorted);
        } else throw new Error('Unsupported collection operation.');
        return commit(values);
      },
      deleteCategory(id,revision) {
        const current=snapshot().data;
        const clear=values=>values.map(value=>{
          if(value.source!==id)return value;
          const {source,...remaining}=value;return remaining;
        });
        const months=current.monthlyData ?? {};
        for(const record of Object.values(months)) record.rawInput=clear(record.rawInput);
        const changes={monthlyData:months,
          expenseCategories:(current.expenseCategories??[]).filter(v=>v.value!==id),
          fixCosts:clear(current.fixCosts??[]),budgets:(current.budgets??[]).filter(v=>v.category!==id),
          essentialCategories:(current.essentialCategories??[]).filter(v=>v!==id),
          budgetManualOrder:(current.budgetManualOrder??[]).filter(v=>v!==id)};
        if(current.trackedCategories) changes.trackedCategories={...current.trackedCategories,
          trackingCategories:current.trackedCategories.trackingCategories.filter(v=>v.name!==id)};
        return mutate(changes,revision);
      },
      exportBackup:()=>JSON.stringify(backupPayload(),null,2),
      restore(text,revision) {
        const payload=JSON.parse(text);
        if(!object(payload)||payload.app!=='easy-sankey'||![1,2].includes(payload.version)||payload.type!=='full'||!object(payload.data)) throw new Error('Invalid backup.');
        const values={};
        for(const [key,value] of Object.entries(payload.data)) values[key]=canonical(key,value);
        writeFileSync(`${filename}.before-restore.tmp`, JSON.stringify(backupPayload(),null,2), {mode:0o600});
        renameSync(`${filename}.before-restore.tmp`, `${filename}.before-restore.json`);
        if(!Object.hasOwn(values,'expenseCategories'))values.expenseCategories=defaultCategories;
        values.appVersion=require('../../package.json').version;
        values.firstTime='false';
        return mutate(values,revision,true);
      },
      reset:revision=>mutate({},revision,true),
      close:()=>db.close(),
    };
  } catch(error) { db.close(); throw error; }
}
module.exports={openStateStore};
