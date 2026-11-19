const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const {registerDatabaseApi}=require('./ipc');
test('database bridge authorizes only the application main frame and validates requests',()=>{
 const directory=mkdtempSync(join(tmpdir(),'sankey-ipc-'));
 const handlers=new Map();let api;
 try{
  const mainFrame={url:pathToFileURL(join(process.cwd(),'dist/easy-sankey/browser/index.html')).href+'#/storage'};
  const webContents={mainFrame};
  const event={sender:webContents,senderFrame:mainFrame};
  api=registerDatabaseApi({app:{getPath:()=>directory,getAppPath:()=>process.cwd()},
   ipcMain:{handle:(key,value)=>handlers.set(key,value),removeHandler:key=>handlers.delete(key)},
   getWindow:()=>({webContents})});
  assert.throws(()=>handlers.get('database:state:initialize')({...event,sender:{}},{}),/Unauthorized/);
  assert.throws(()=>handlers.get('database:state:initialize')({...event,senderFrame:{url:mainFrame.url}},{}),/Unauthorized/);
  assert.throws(()=>handlers.get('database:months:get')(event,'not-a-month'),/Invalid/);
  const initial=handlers.get('database:state:initialize')(event,{});
  assert.equal(initial.revision,1);
  const saved=handlers.get('database:months:create')(event,{month:'2025-04',lastUpdated:'-',entries:[]});
  assert.equal(saved.month,'2025-04');
  assert.deepEqual(handlers.get('database:months:list')(event),['2025-04']);
  mainFrame.url='https://example.com/';
  assert.throws(()=>handlers.get('database:months:list')(event),/Unauthorized/);
 }finally{api?.close();assert.equal(handlers.size,0);rmSync(directory,{recursive:true,force:true});}
});

test('live development accepts only the configured loopback origin and is unavailable in packaged apps',()=>{
 const directory=mkdtempSync(join(tmpdir(),'sankey-dev-ipc-'));
 const handlers=new Map();let api;
 const frame={url:'http://127.0.0.1:4200/index.html#/welcome'};
 const webContents={mainFrame:frame};
 const options={app:{isPackaged:false,getPath:()=>directory,getAppPath:()=>process.cwd()},
  ipcMain:{handle:(key,value)=>handlers.set(key,value),removeHandler:key=>handlers.delete(key)},
  getWindow:()=>({webContents}),developmentURL:'http://127.0.0.1:4200/'};
 try{
  assert.throws(()=>registerDatabaseApi({...options,app:{...options.app,isPackaged:true}}),/Invalid development/);
  api=registerDatabaseApi(options);
  const event={sender:webContents,senderFrame:frame};
  assert.equal(handlers.get('database:state:initialize')(event,{}).initialized,true);
  frame.url='http://localhost:4200/';
  assert.throws(()=>handlers.get('database:state:snapshot')(event),/Unauthorized/);
  frame.url='https://example.com/';
  assert.throws(()=>handlers.get('database:state:snapshot')(event),/Unauthorized/);
 }finally{api?.close();rmSync(directory,{recursive:true,force:true});}
});
