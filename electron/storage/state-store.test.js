const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {openStateStore}=require('./state-store');
test('development database starts directly, round-trips backups, and creates no recovery sidecars',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dev-db-'));let store;
 try {
  const file=join(dir,'finance.sqlite');store=openStateStore(file);store.initialize({});
  store.crud.settings.set({key:'selectedCurrency',value:'EUR'});
  store.crud.months.save({month:'2025-04',entries:[{id:'a',type:'expense',target:'Food',value:12.3456}],lastUpdated:'-'});
  const backup=store.exportBackup();
  store.reset(store.snapshot().revision);
  store.restore(backup,store.snapshot().revision);
  assert.equal(store.crud.months.get('2025-04').entries[0].value,12.3456);
  assert.throws(()=>store.restore('{"app":"other"}',store.snapshot().revision),/Invalid/);
  store.close();store=openStateStore(file);
  assert.equal(store.snapshot().data.selectedCurrency,'EUR');
  assert.equal(readdirSync(dir).some(name=>/schema-|legacy.json|before-restore/.test(name)),false);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
