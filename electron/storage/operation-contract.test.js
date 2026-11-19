const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const {operations}=require('./operations.generated');
const {registerDatabaseApi}=require('./ipc');
function flatten(tree,path=[]){return Object.entries(tree).flatMap(([key,value])=>typeof value.run==='function'?[{path:[...path,key],operation:value}]:flatten(value,[...path,key]));}
test('the contract exposes and registers exactly the same closed operation set',async()=>{
 const routes=flatten(operations);let exposed;const invoked=[];
 vm.runInNewContext(readFileSync(join(__dirname,'../../preload.js'),'utf8'),{
  process:{argv:[]},
  require(name){assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld(_name,api){exposed=api;}},ipcRenderer:{invoke(channel,payload){invoked.push(channel);return Promise.resolve(payload);}}};},
 });
 for(const route of routes){let method=exposed.database;for(const key of route.path)method=method[key];assert.equal(typeof method,'function',route.path.join('.'));await method();}
 assert.deepEqual(invoked,routes.map(route=>route.operation.channel));
 assert.equal(exposed.database.entries.replace,undefined);
 assert.equal(exposed.database.invoke,undefined);
 const dir=mkdtempSync(join(tmpdir(),'contract-'));const handlers=new Map();let registered;
 const frame={url:pathToFileURL(join(process.cwd(),'dist/easy-sankey/browser/index.html')).href};
 const webContents={mainFrame:frame};const event={sender:webContents,senderFrame:frame};
 try {
  registered=registerDatabaseApi({app:{getPath:()=>dir,getAppPath:()=>process.cwd()},getWindow:()=>({webContents}),ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)}});
  assert.deepEqual([...handlers.keys()].sort(),routes.map(route=>route.operation.channel).sort());
  assert.throws(()=>handlers.get('database:entries:get')(event,{month:'2025-04',id:123}),/VALIDATION/);
  assert.throws(()=>handlers.get('database:months:range')(event,null),/VALIDATION/);
  assert.throws(()=>handlers.get('database:state:restore')(event,{}),/VALIDATION/);
  assert.throws(()=>handlers.get('database:settings:set')({...event,sender:{}},{key:'selectedCurrency',value:'EUR'}),/Unauthorized/);
 }finally{registered?.close();assert.equal(handlers.size,0);rmSync(dir,{recursive:true,force:true});}
});
