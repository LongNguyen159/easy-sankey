const {isDeepStrictEqual}=require('node:util');
const Database = require('better-sqlite3');
const { mkdirSync, chmodSync, existsSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const defaultCategories=require('./default-categories.json');
const { keys, textKeys, collections, canonical, object } = require('./schema');

function openStateStore(filename, {onQuery}={}) {
  mkdirSync(dirname(filename), { recursive:true });
  const missingDatabase= !existsSync(filename) && existsSync(`${filename}.initialized`);
  const db = new Database(filename,onQuery?{verbose:onQuery}:{});
  try {
    const version = db.pragma('user_version',{simple:true});
    if (version !== 0 && version !== 4) throw new Error('Unsupported development database schema. Use a fresh database or import a current backup.');
    chmodSync(filename,0o600);
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
    const migration=()=>db.prepare("SELECT value FROM migration_metadata WHERE key='legacy-import'").get()?.value;
    if(!migration())db.prepare("INSERT INTO migration_metadata VALUES('legacy-import',?)").run(missingDatabase?'recovery-required':version===4?'complete':'pending');
    if(missingDatabase)db.prepare("UPDATE migration_metadata SET value='recovery-required' WHERE key='legacy-import'").run();
    const markInitialized=()=>writeFileSync(`${filename}.initialized`,'SQLite is authoritative',{mode:0o600});
    const readRevision = () => Number(db.prepare("SELECT value FROM migration_metadata WHERE key='revision'").get().value);
    db.exec(`CREATE TABLE IF NOT EXISTS entry_history(month TEXT NOT NULL, entry_id TEXT NOT NULL,
      position INTEGER NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)),PRIMARY KEY(month,entry_id,position));`);
    const get = key => {
      if (!keys.has(key)) throw new Error('Unsupported storage field.');
      if(key==='trackedCategories') {
        const metadata=db.prepare("SELECT value FROM documents WHERE key='trackingMetadata'").get();
        const marker=db.prepare("SELECT value FROM documents WHERE key='trackedCategories'").get();
        if(!marker)return null;
        return {...(metadata?JSON.parse(metadata.value):{targetSurplus:0,avgIncome:0}),trackingCategories:db.prepare("SELECT value FROM records WHERE collection='trackedCategories' ORDER BY position").all().map(row=>JSON.parse(row.value))};
      }
      if(key==='logs') {
        const result={};
        for(const row of db.prepare('SELECT month,entry_id,value FROM entry_history ORDER BY month,entry_id,position').all()) {
          result[row.month]??={};result[row.month][row.entry_id]??=[];result[row.month][row.entry_id].push(JSON.parse(row.value));
        }
        return Object.keys(result).length?result:null;
      }
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
      if(key==='logs') {
        db.prepare("DELETE FROM documents WHERE key='logs'").run();
        db.exec('DELETE FROM entry_history');
        for(const [month,items] of Object.entries(value??{}))for(const [id,history] of Object.entries(items))history.forEach((item,index)=>db.prepare('INSERT INTO entry_history VALUES(?,?,?,?)').run(month,id,index,JSON.stringify(item)));
        return;
      }
      if(key==='trackedCategories') {
        db.prepare("DELETE FROM records WHERE collection='trackedCategories'").run();
        if(value) {
          const {trackingCategories,...metadata}=value;
          db.prepare("INSERT OR REPLACE INTO documents VALUES('trackingMetadata',?)").run(JSON.stringify(metadata));
          trackingCategories.forEach((item,index)=>db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(key,item.name,index,JSON.stringify(item)));
          db.prepare('INSERT OR REPLACE INTO documents VALUES(?,?)').run(key,'true');
        } else db.prepare("DELETE FROM documents WHERE key IN ('trackingMetadata','trackedCategories')").run();
        return;
      }
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
        const collection=key;
        const existing=db.prepare('SELECT id FROM records WHERE collection=?').all(collection);
        const nextIds=new Set(value===null?[]:value.map(v=>v[collections[key]]));
        for(const row of existing)if(!nextIds.has(row.id))db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,row.id);
        if(value!==null) {
          const records=value.map(v => [v[collections[key]],v]);
          records.forEach(([id,item],position) => db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET position=excluded.position,value=excluded.value WHERE records.position<>excluded.position OR records.value<>excluded.value').run(collection,id,position,JSON.stringify(item)));
        }
      }
      if(value===null) db.prepare('DELETE FROM documents WHERE key=?').run(key);
      else db.prepare('INSERT INTO documents VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,
        JSON.stringify(key==='monthlyData'||collections[key] ? true : value));
    };
    const normalizeHistory=value=>{
      const result={};for(const [month,items] of Object.entries(value??{}))for(const [id,history] of Object.entries(items))if(history.length){result[month]??={};result[month][id]=history;}
      return Object.keys(result).length?result:null;
    };
    const snapshot=()=>({revision:readRevision(),initialized:migration()==='complete',recoveryRequired:migration()==='recovery-required',data:Object.fromEntries([...keys].map(k=>[k,get(k)]).filter(([,v])=>v!==null))});
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
      if(replace) { db.exec('DELETE FROM documents; DELETE FROM records; DELETE FROM months; DELETE FROM entry_history;'); }
      for(const [key,value] of Object.entries(changes)) put(key,value);
      db.prepare("UPDATE migration_metadata SET value=? WHERE key='revision'").run(String(revision+1));
      db.prepare("UPDATE migration_metadata SET value='complete' WHERE key='legacy-import'").run();
      return snapshot();
    });
    const backupPayload=()=>({app:'easy-sankey',version:2,type:'full',exportedAt:new Date().toISOString(),
      data:Object.fromEntries(Object.entries(snapshot().data).filter(([key])=>!['appVersion','firstTime'].includes(key)))});
    db.pragma('user_version=4');
    if(!db.prepare("SELECT 1 FROM documents WHERE key='expenseCategories'").get()) db.transaction(()=>put('expenseCategories',defaultCategories))();
    if(migration()==='complete')markInitialized();
    const crud=require('./crud-store').createCrudStore(db,readRevision);
    crud.status=()=>({revision:readRevision(),initialized:migration()==='complete',recoveryRequired:migration()==='recovery-required'});
    return {
      snapshot, crud,
      initialize(legacy) {
        if(migration()!=='pending')return snapshot();
        const importLegacy=db.transaction(()=>{
          if(!object(legacy))throw new Error('Invalid legacy snapshot.');
          const values={};
          for(const key of keys)if(Object.hasOwn(legacy,key)) {
            if(typeof legacy[key]!=='string')throw new Error('Invalid legacy value.');
            values[key]=canonical(key,textKeys.has(key)?legacy[key]:JSON.parse(legacy[key]));
          }
          if(!Object.hasOwn(values,'expenseCategories'))values.expenseCategories=defaultCategories;
          const result=mutate(values,readRevision(),true);
          for(const [key,value] of Object.entries(values)) {
            const actual=result.data[key]??null;
            if(!isDeepStrictEqual(actual,key==='logs'?normalizeHistory(value):value))throw new Error(`Migration verification failed for ${key}.`);
          }
          return result;
        });
        const result=importLegacy();markInitialized();return result;
      },
      exportBackup:()=>JSON.stringify(backupPayload(),null,2),
      restore(text,revision) {
        const payload=JSON.parse(text);
        if(!object(payload)||payload.app!=='easy-sankey'||![1,2].includes(payload.version)||payload.type!=='full'||!object(payload.data)) throw new Error('Invalid backup.');
        const values={};
        for(const [key,value] of Object.entries(payload.data)) values[key]=canonical(key,value);
        if(!Object.hasOwn(values,'expenseCategories'))values.expenseCategories=defaultCategories;
        values.appVersion=require('../../package.json').version;
        values.firstTime='false';
        const result=mutate(values,revision,true);markInitialized();return result;
      },
      reset(revision){const result=mutate({},revision,true);markInitialized();return result;},
      close:()=>db.close(),
    };
  } catch(error) { db.close(); throw error; }
}
module.exports={openStateStore};
