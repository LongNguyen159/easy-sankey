const {spawnSync}=require('node:child_process');
const {mkdtempSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const executable=process.argv[2];
if(!executable)throw new Error('Pass the packaged application executable.');
const profile=mkdtempSync(join(tmpdir(),'easy-sankey-packaged-'));
for(let launch=0;launch<2;launch++) {
 const result=spawnSync(resolve(executable),['--storage-smoke-test','--disable-gpu'],{
  env:{...process.env,EASY_SANKEY_SMOKE_PROFILE:profile},stdio:'inherit',timeout:120000});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`Packaged smoke failed: ${result.status} ${result.signal}`);
 const report=JSON.parse(readFileSync(join(profile,'smoke-result.json'),'utf8'));
 if(!report.passed||!report.packaged||!report.offline||!report.legacyMigrationVerified||(launch===1&&!report.restartVerified))throw new Error('Packaged/restart verification failed.');
}
console.log(`Packaged SQLite verification passed. Evidence: ${profile}`);
