const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const Database=require('better-sqlite3');
const {openStateStore}=require('./state-store');
function fixture(run){const dir=mkdtempSync(join(tmpdir(),'crud-'));const queries=[];const file=join(dir,'finance.sqlite');let store=openStateStore(file,{onQuery:sql=>queries.push(sql)});try{run({store,crud:store.crud,file,queries,reopen(){store.close();store=openStateStore(file);return store;}});}finally{store.close();rmSync(dir,{recursive:true,force:true});}}
const entry=(id='a',value=1)=>({id,type:'expense',target:id,value});
const save=(crud,month,entries=[entry()])=>crud.months.save({month,entries,lastUpdated:'2025-04-01T00:00:00Z'});

test('targeted reads and edits do not reconstruct snapshots or touch unrelated rows',()=>fixture(({crud,store,file,queries})=>{
 for(let year=2020;year<2030;year++)for(let month=1;month<=12;month++)save(crud,`${year}-${String(month).padStart(2,'0')}`);
 const before=crud.months.get('2021-01');queries.length=0;
 crud.entries('update',{month:'2025-04',id:'a',entry:entry('a',2)});
 assert.equal(queries.some(sql=>sql.includes('FROM months ORDER BY month')),false);
 assert.equal(queries.some(sql=>sql.includes("WHERE month='2021-01'")),false);
 assert.deepEqual(crud.months.get('2021-01').entries,before.entries);
 const result=crud.settings.set({key:'selectedCurrency',value:'EUR'});
 assert.equal(result.data,undefined);assert.equal(result.value,'EUR');
 assert.equal(crud.months.range({from:'2025-04',to:'2025-05'}).value.length,2);
 assert.throws(()=>crud.months.range({from:'2025-13'}),/Invalid/);
}));

test('entry and history updates commit together and reject stale drafts without partial writes',()=>fixture(({crud,store})=>{
 save(crud,'2025-04');const before=crud.months.get('2025-04');const revision=store.snapshot().revision;
 assert.throws(()=>crud.entries('update',{month:'2025-04',id:'a',entry:entry('a',2),history:{missing:{timestamp:'now',value:'1+1'}}}),/History entry/);
 assert.deepEqual(crud.months.get('2025-04'),before);assert.equal(store.snapshot().revision,revision);
 crud.entries('update',{month:'2025-04',id:'a',entry:entry('a',2),expected:before.entries[0],history:{a:{timestamp:'display timestamp',value:'1+1'}}});
 assert.deepEqual(crud.history.list({month:'2025-04',id:'a'}).value,[{timestamp:'display timestamp',value:'1+1'}]);
 assert.throws(()=>crud.months.save({month:'2025-04',entries:[entry('a',3)],lastUpdated:'-',base:before.entries}),/CONFLICT/);
 assert.equal(crud.months.get('2025-04').entries[0].value,2);
 for(let i=0;i<8;i++)crud.history.append({month:'2025-04',id:'a',item:{timestamp:String(i),value:i}});
 assert.deepEqual(crud.history.list({month:'2025-04',id:'a'}).value.map(item=>item.value),[7,6,5,4,3]);
 crud.entries('delete',{month:'2025-04',id:'a'});
 assert.deepEqual(crud.history.list({month:'2025-04',id:'a'}).value,[]);
}));

test('batch validates the final hierarchy atomically, preserves order and handles scoped identities',()=>fixture(({crud})=>{
 save(crud,'2025-04',[entry('parent'),{...entry('child'),source:'parent'}]);save(crud,'2025-05');
 crud.entries('update',{month:'2025-04',id:'parent',entry:{...entry('parent'),target:'renamed'}});
 assert.equal(crud.entries('get',{month:'2025-04',id:'child'}).source,'renamed');
 const previous=crud.months.get('2025-04');
 assert.throws(()=>save(crud,'2025-04',[{...entry('a'),source:'b'},{...entry('b'),source:'a'}]),/cycle/);
 assert.deepEqual(crud.months.get('2025-04'),previous);
 crud.entries('reorder',{month:'2025-04',ids:['child','parent']});
 assert.deepEqual(crud.months.get('2025-04').entries.map(item=>item.id),['child','parent']);
 crud.entries('delete',{month:'2025-04',id:'parent'});
 assert.equal(crud.months.get('2025-04').entries[0].source,undefined);
 assert.equal(crud.months.get('2025-05').entries[0].id,'a');
}));

test('category removal cleans every dependent scope without changing unrelated data or timestamps',()=>fixture(({crud})=>{
 const category={value:'tools@__system/category__',label:'Tools'};
 crud.collection('expenseCategories','create',{item:category});
 save(crud,'2025-04',[{...entry(),source:category.value}]);
 crud.collection('fixCosts','create',{item:{...entry(),source:category.value}});
 crud.collection('budgets','create',{item:{category:category.value,value:12.3456}});
 crud.collection('trackedCategories','replace',{items:[{name:category.value,targetSpending:50}],metadata:{avgIncome:1500,targetSurplus:100}});
 crud.settings.set({key:'essentialCategories',value:[category.value]});crud.settings.set({key:'budgetManualOrder',value:[category.value]});
 const previous=crud.months.get('2025-04');crud.deleteCategory({id:category.value});
 assert.equal(crud.months.get('2025-04').entries[0].source,undefined);assert.equal(crud.months.get('2025-04').lastUpdated,previous.lastUpdated);
 assert.equal(crud.collection('fixCosts','list').items[0].source,undefined);
 assert.deepEqual(crud.collection('budgets','list').items,[]);assert.deepEqual(crud.collection('trackedCategories','list').items,[]);
 assert.equal(crud.trackingMetadata().avgIncome,1500);assert.deepEqual(crud.settings.list().value.essentialCategories,[]);
}));

test('no-op commands preserve revision and timestamps; invalid orders and settings roll back',()=>fixture(({crud,store})=>{
 save(crud,'2025-04');const before=crud.months.get('2025-04');const revision=store.snapshot().revision;
 crud.entries('update',{month:'2025-04',id:'a',entry:entry()});assert.equal(store.snapshot().revision,revision);assert.deepEqual(crud.months.get('2025-04'),before);
 assert.throws(()=>crud.entries('reorder',{month:'2025-04',ids:['wrong']}),/Unknown/);
 assert.throws(()=>crud.settings.set({key:'monthlyData',value:{}}),/Unsupported/);
 assert.throws(()=>crud.settings.set({key:'budgetSort',value:'invalid'}),/Invalid/);
 assert.equal(store.snapshot().revision,revision);
}));

 test('single row CRUD uses primary-key reads and does not reconcile sibling rows',()=>fixture(({crud,queries})=>{
 save(crud,'2025-04',[entry('a'),entry('b')]);
 crud.collection('budgets','create',{item:{category:'a',value:10}});
 crud.collection('budgets','create',{item:{category:'b',value:20}});
 queries.length=0;
 assert.equal(crud.entries('get',{month:'2025-04',id:'a'}).id,'a');
 assert.equal(crud.entries('update',{month:'2025-04',id:'a',entry:entry('a',3)}).value.value,3);
 crud.collection('budgets','update',{id:'a',item:{category:'a',value:30}});
 assert.equal(queries.some(sql=>sql.includes('SELECT payload FROM entries WHERE month=')&&!sql.includes('AND id=')),false);
 assert.equal(queries.some(sql=>sql.includes('SELECT value FROM records WHERE collection=')&&!sql.includes('AND id=')),false);
 assert.equal(queries.some(sql=>sql.startsWith('INSERT INTO entries')||sql.startsWith('INSERT INTO records')),false);
 assert.equal(crud.entries('get',{month:'2025-04',id:'b'}).value,1);
 assert.equal(crud.collection('budgets','get',{id:'b'}).value,20);
}));
