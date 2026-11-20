require('./build-electron.cjs');
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[require.resolve('@angular/cli/bin/ng.js'),'build'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
