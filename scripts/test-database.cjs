const {spawnSync}=require('node:child_process');
const {readdirSync}=require('node:fs');
const {join}=require('node:path');
const files=readdirSync('electron/storage').filter(file=>file.endsWith('.test.js')).map(file=>join('electron/storage',file));
const result=spawnSync(require('electron'),['--test',...files],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
