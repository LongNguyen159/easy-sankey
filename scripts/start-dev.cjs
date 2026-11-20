require('./build-electron.cjs');
const {spawn}=require('node:child_process');
const http=require('node:http');
const net=require('node:net');
const {join}=require('node:path');
const root=join(__dirname,'..');
let server,desktop,stopping=false;
function stop(code=0){
 if(stopping)return;stopping=true;
 desktop?.kill();server?.kill();
 process.exitCode=code;
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
async function start(){
 await new Promise((resolve,reject)=>{
  const check=net.createServer();check.once('error',()=>reject(new Error('Port 4200 is in use. Stop the existing dev server first.')));
  check.listen(4200,'127.0.0.1',()=>check.close(resolve));
 });
 server=spawn(process.execPath,[join(root,'node_modules/@angular/cli/bin/ng.js'),'serve','--host','127.0.0.1','--port','4200'],{cwd:root,stdio:'inherit'});
 server.on('error',error=>{console.error(error);stop(1);});
 server.on('exit',code=>{if(!stopping)stop(code??1);});
 const deadline=Date.now()+90000;
 while(!stopping){
  const ready=await new Promise(resolve=>{
   const request=http.get('http://127.0.0.1:4200/',response=>{response.resume();resolve(response.statusCode===200);});
   request.on('error',()=>resolve(false));request.setTimeout(1000,()=>request.destroy());
  });
  if(ready)break;
  if(Date.now()>deadline)throw new Error('Development server startup timed out.');
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(stopping)return;
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 desktop=spawn(require('electron'),['.','--dev'],{cwd:root,env,stdio:'inherit'});
 desktop.on('error',error=>{console.error(error);stop(1);});
 desktop.on('exit',code=>stop(code??1));
}
start().catch(error=>{console.error(error.message);stop(1);});
