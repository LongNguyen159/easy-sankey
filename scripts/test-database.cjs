const {spawnSync}=require('node:child_process');
const {readdirSync}=require('node:fs');const {join}=require('node:path');
require('./build-electron.cjs');
const sources=readdirSync('tests/database').filter(file=>file.endsWith('.test.js'));
require('esbuild').buildSync({entryPoints:sources.map(file=>join('tests/database',file)),outdir:'.electron-tests',bundle:true,packages:'external',platform:'node',format:'cjs',target:'node20',external:['electron','better-sqlite3','../generated/prisma'],logLevel:'warning'});
const result=spawnSync(require('electron'),['--test',...sources.map(file=>join('.electron-tests',file))],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit'});
if(result.error)throw result.error;process.exit(result.status??1);
