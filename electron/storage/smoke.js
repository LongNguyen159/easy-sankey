const assert=require('node:assert/strict');
const {writeFileSync}=require('node:fs');
const {join}=require('node:path');
async function runSmoke(window,app) {
 window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
 const consoleErrors=[];
 window.webContents.on('console-message',(_event,level,message)=>{if(level===3)consoleErrors.push(message);});
 const execute=script=>window.webContents.executeJavaScript(script,true);
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(new Error('Application loading timed out')),30000);
  window.webContents.once('did-finish-load',()=>{clearTimeout(timeout);resolve();});
 });
 for(let attempt=0;attempt<100;attempt++) {
  const ready=await execute('!!document.querySelector("app-welcome-page, app-main-page, app-whats-new-page, app-storage-page")');
  if(ready) break;
  if(attempt===99)throw new Error(await execute('document.body.innerText'));
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(await execute('document.body.innerText.includes("Could not open local database")'),false);
 const result=await execute(`(async()=>{
  const api=window.electronAPI.database;
  const first=await api.state.initialize({});
  const migrated=first.data.monthlyData['2024-01'];
  if(migrated.rawInput[1].value!==123.45 || migrated.rawInput[0].lastEditedAt!==1234 || migrated.pieData!==undefined)throw new Error('Legacy migration lost source data or retained chart cache');
  if(first.data.selectedCurrency!=='USD'||first.data.budgetView!=='list')throw new Error('Legacy settings were lost');
  const previous=await api.months.get('2025-04');
  if(previous) { if(previous.entries[1].value!==250)throw new Error('Restart lost saved data'); await api.months.delete('2025-04'); }
  const month='2025-04';
  const entries=[{id:'income',type:'income',target:'Smoke salary',value:1000},
   {id:'expense',type:'expense',target:'Smoke rent',value:200}];
  const created=await api.months.create({month,lastUpdated:'2025-04-01T00:00:00Z',entries});
  const updated=await api.months.update({...created,entries:[entries[0],{...entries[1],value:250}]});
  const backup=await api.state.exportBackup();
  const state=await api.state.initialize({});
  await api.state.reset(state.revision);
  const empty=await api.months.list();
  const reset=await api.state.initialize({selectedCurrency:'OLD'});
  await api.state.restore({text:backup,revision:reset.revision});
  return {restartVerified:!!previous,created,updated,empty,reset,restored:await api.months.get(month),backup:JSON.parse(backup)};
 })()`);
 assert.equal(result.created.entries[1].value,200);
 assert.equal(result.updated.entries[1].value,250);
 assert.equal(result.restored.entries[1].value,250);
 assert.deepEqual(result.empty,[]);
 assert.equal(result.reset.data.selectedCurrency,undefined);
 assert.equal(result.backup.version,2);
 assert.equal(result.backup.data.monthlyData['2025-04'].sankeyData,undefined);
 const reloaded=new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
 window.webContents.reload();await reloaded;
 for(let attempt=0;attempt<100;attempt++) {
   if(await execute('!!document.querySelector("app-welcome-page, app-main-page, app-whats-new-page, app-storage-page")'))break;
   if(attempt===99)throw new Error('UI did not render after restoring and reloading');
   await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(await execute('document.body.innerText.includes("Could not open local database")'),false);
 assert.deepEqual(consoleErrors.filter(message=>/NG\d|ERROR|TypeError|Uncaught/.test(message)),[]);
 writeFileSync(join(app.getPath('userData'),'smoke-result.json'),JSON.stringify({passed:true,offline:true,legacyMigrationVerified:true,packaged:app.isPackaged,restartVerified:result.restartVerified,result},null,2));
 console.log('SQLITE_ELECTRON_SMOKE_PASS');
}
module.exports={runSmoke};
