const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {openStateStore}=require('./state-store');

test('migration, source-only persistence, transactions, CRUD, backups and reset',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sankey-state-'));let store;
 try{
  const file=join(dir,'finance.sqlite');store=openStateStore(file);
  const record={month:'2025-04',lastUpdated:'2025-04-01T00:00:00Z',rawInput:[
   {id:'a',type:'income',target:'Salary',value:1000,lastEditedAt:123},
   {id:'b',type:'expense',target:'Food',value:50}],pieData:[{name:'cached',value:99}]};
  let result=store.initialize({monthlyData:JSON.stringify({'2025-04':record}),selectedCurrency:'EUR',budgetView:'list',trackedCategories:JSON.stringify({targetSurplus:100,avgIncome:1500,trackingCategories:[{name:'Food',targetSpending:200,currentSpending:50,percentageSpent:25}]})});
  assert.equal(result.data.monthlyData['2025-04'].pieData,undefined);
  assert.equal(result.data.monthlyData['2025-04'].rawInput[0].lastEditedAt,123);
  assert.equal(result.data.budgetView,'list');
  assert.equal(result.data.trackedCategories.avgIncome,1500);
  assert.equal(result.data.trackedCategories.trackingCategories[0].currentSpending,undefined);
  assert.throws(()=>store.mutate({selectedCurrency:'USD'},0),/changed/);
  assert.throws(()=>store.mutate({selectedCurrency:'USD',budgets:'bad'},result.revision),/Invalid/);
  assert.equal(store.snapshot().data.selectedCurrency,'EUR');
  store.monthOperation('create',{month:'2025-05',lastUpdated:'-',entries:record.rawInput});
  const may=store.monthOperation('get','2025-05');
  store.monthOperation('update',{...may,entries:[{...may.entries[0],value:1200}]});
  assert.throws(()=>store.monthOperation('update',may),/changed/);
  const backup=store.exportBackup();
  result=store.reset(store.snapshot().revision);
  assert.deepEqual(result.data,{});
  store.close();store=openStateStore(file);
  assert.deepEqual(store.initialize({selectedCurrency:'OLD'}).data,{});
  result=store.restore(backup,store.snapshot().revision);
  assert.equal(result.data.monthlyData['2025-05'].rawInput[0].value,1200);
  assert.equal(store.monthOperation('delete','2025-05'),true);
  assert.equal(store.monthOperation('delete','2025-05'),false);
  const legacyBackup=JSON.stringify({app:'easy-sankey',version:1,type:'full',data:{monthlyData:{'2025-04':record},selectedCurrency:'EUR'}});
  result=store.restore(legacyBackup,store.snapshot().revision);
  assert.equal(result.data.monthlyData['2025-04'].rawInput[0].lastEditedAt,123);
  assert.equal(result.data.monthlyData['2025-04'].pieData,undefined);
  assert.throws(()=>store.restore('{"app":"easy-sankey","version":999,"type":"full","data":{}}',store.snapshot().revision),/Invalid/);
  store.close();store=openStateStore(file);
  assert.equal(store.snapshot().data.selectedCurrency,'EUR');
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('entity CRUD, entry rename and category deletion are atomic',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sankey-entities-'));let store;
 try {
  store=openStateStore(join(dir,'finance.sqlite'));
  let state=store.initialize({expenseCategories:'[]'});
  const category={value:'tools@__system/category__',label:'Tools'};
  state=store.collectionOperation('expenseCategories','create',{item:category,revision:state.revision});
  assert.throws(()=>store.collectionOperation('expenseCategories','create',{item:category,revision:state.revision}),/already exists/);
  store.monthOperation('create',{month:'2025-04',lastUpdated:'-',entries:[
   {id:'a',type:'expense',target:'Parent',value:20,source:category.value},
   {id:'b',type:'expense',target:'Child',value:10,source:'Parent'}]});
  state=store.entryOperation('list',{month:'2025-04'});
  store.entryOperation('update',{month:'2025-04',id:'a',revision:state.revision,
   entry:{...state.entries[0],target:'Renamed'}});
  assert.equal(store.entryOperation('get',{month:'2025-04',id:'b'}).source,'Renamed');
  assert.throws(()=>store.mutate({expenseCategories:null},store.snapshot().revision),/missing category/);
  assert.equal(store.snapshot().data.expenseCategories[0].value,category.value);
  state=store.deleteCategory(category.value,store.snapshot().revision);
  assert.equal(state.data.monthlyData['2025-04'].rawInput[0].source,undefined);
  assert.deepEqual(state.data.expenseCategories,[]);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('invalid migration rolls back and a missing database cannot resurrect legacy data',()=>{
 const {unlinkSync}=require('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'sankey-recovery-'));let store;
 try{
  const file=join(dir,'finance.sqlite');store=openStateStore(file);
  assert.throws(()=>store.initialize({monthlyData:'{"2025-04":{"month":"2025-04","lastUpdated":"-","rawInput":null}}'}),/Invalid/);
  assert.equal(store.snapshot().revision,0);
  const state=store.initialize({selectedCurrency:'EUR'});
  const backup=store.exportBackup();
  store.close();unlinkSync(file);
  store=openStateStore(file);
  const recovery=store.initialize({selectedCurrency:'OLD'});
  assert.equal(recovery.recoveryRequired,true);
  assert.equal(recovery.data.selectedCurrency,undefined);
  store.restore(backup,recovery.revision);
  assert.equal(store.snapshot().recoveryRequired,false);
  assert.equal(store.snapshot().data.selectedCurrency,'EUR');
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('schema upgrades retain source records and refuse unsupported future versions',()=>{
 const Database=require('better-sqlite3');
 const dir=mkdtempSync(join(tmpdir(),'sankey-upgrade-'));let store;
 try{
  const file=join(dir,'finance.sqlite');
  let original=new Database(file);
  original.exec(`CREATE TABLE documents(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE records(collection TEXT,id TEXT,position INTEGER,value TEXT,PRIMARY KEY(collection,id));
    CREATE TABLE migration_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO documents VALUES('monthlyData','true');
    INSERT INTO migration_metadata VALUES('legacy-import','complete');
    INSERT INTO migration_metadata VALUES('revision','0'); PRAGMA user_version=2;`);
  original.prepare('INSERT INTO records VALUES(?,?,?,?)').run('months','2025-04',0,JSON.stringify({month:'2025-04',lastUpdated:'-',rawInput:[]}));
  original.close();
  store=openStateStore(file);
  assert.equal(store.snapshot().data.monthlyData['2025-04'].month,'2025-04');
  store.close();store=undefined;
  original=new Database(file);original.pragma('user_version=999');original.close();
  assert.throws(()=>openStateStore(file),/newer/);
  original=new Database(file);assert.equal(original.pragma('user_version',{simple:true}),999);original.close();
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('migration verifies month contents independently of object key order and preserves entry order',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sankey-month-order-'));let store;
 try{
  const file=join(dir,'finance.sqlite');store=openStateStore(file);
  const entries=[{id:'second',target:'Salary',value:1000,type:'income'},
    {id:'first',target:'Food',value:30,type:'expense'}];
  const legacy={
    '2025-05':{lastUpdated:'-',rawInput:entries,month:'2025-05'},
    '2025-04':{rawInput:entries,month:'2025-04',lastUpdated:'-'}
  };
  const result=store.initialize({monthlyData:JSON.stringify(legacy),budgets:'null'});
  assert.deepEqual(Object.keys(result.data.monthlyData),['2025-04','2025-05']);
  assert.deepEqual(result.data.monthlyData['2025-05'].rawInput,entries);
  assert.equal(result.initialized,true);
  store.close();store=openStateStore(file);
  assert.deepEqual(store.initialize({}).data.monthlyData['2025-04'].rawInput,entries);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
