const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,unlinkSync}=require('node:fs');
const {join}=require('node:path');const {tmpdir}=require('node:os');
const {openStateStore}=require('./state-store');
function fixture(run){const dir=mkdtempSync(join(tmpdir(),'legacy-'));let store;const file=join(dir,'finance.sqlite');try{store=openStateStore(file);run({file,store,reopen(){store.close();store=openStateStore(file);return store;}});}finally{store?.close();rmSync(dir,{recursive:true,force:true});}}
const month={month:'2025-04',lastUpdated:'2025-04-01T12:00:00Z',rawInput:[{id:'salary',target:'Salary',type:'income',value:1000.123,lastEditedAt:1234},{id:'food',target:'Food',type:'expense',value:12.345,isFixCost:true}],pieData:[{name:'obsolete',value:99}]};
test('released LocalStorage imports source records once with identities, precision, history and settings intact',()=>fixture(({store,reopen})=>{
 const legacy={monthlyData:JSON.stringify({'2025-04':month}),selectedCurrency:'EUR',budgetView:'list',logs:JSON.stringify({'2025-04':{food:[{timestamp:'Apr 01',value:'10+2.345'}]}}),trackedCategories:JSON.stringify({avgIncome:2000,targetSurplus:100,trackingCategories:[{name:'Food',targetSpending:50,currentSpending:12}]})};
 assert.equal(store.crud.status().initialized,false);
 const state=store.initialize(legacy);
 assert.deepEqual(state.data.monthlyData['2025-04'].rawInput,month.rawInput);
 assert.equal(state.data.monthlyData['2025-04'].pieData,undefined);
 assert.equal(state.data.selectedCurrency,'EUR');assert.equal(state.data.budgetView,'list');
 assert.deepEqual(state.data.logs,JSON.parse(legacy.logs));assert.equal(state.data.trackedCategories.trackingCategories[0].currentSpending,undefined);
 assert.equal(reopen().initialize({selectedCurrency:'OLD'}).data.selectedCurrency,'EUR');
}));
test('malformed legacy data rolls back and remains retryable after reopening',()=>fixture(({store,reopen})=>{
 assert.throws(()=>store.initialize({selectedCurrency:'EUR',monthlyData:'broken'}));
 assert.equal(store.crud.status().initialized,false);assert.equal(store.snapshot().data.selectedCurrency,undefined);
 const opened=reopen();assert.equal(opened.crud.status().initialized,false);
 assert.equal(opened.initialize({selectedCurrency:'EUR',logs:'{}'}).data.selectedCurrency,'EUR');
}));
test('reset and missing database never resurrect obsolete LocalStorage; explicit restore recovers',()=>fixture(({store,file,reopen})=>{
 store.initialize({monthlyData:JSON.stringify({'2025-04':month})});const backup=store.exportBackup();
 store.reset(store.snapshot().revision);assert.equal(store.initialize({selectedCurrency:'OLD'}).data.selectedCurrency,undefined);
 store.close();unlinkSync(file);const opened=reopen();
 assert.equal(opened.crud.status().recoveryRequired,true);assert.equal(opened.initialize({selectedCurrency:'OLD'}).data.selectedCurrency,undefined);
 opened.restore(backup,opened.snapshot().revision);assert.equal(opened.crud.status().initialized,true);
 assert.deepEqual(opened.crud.months.get('2025-04').entries,month.rawInput);
}));
