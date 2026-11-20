const {spawnSync}=require('node:child_process');
const generated=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'generate'],{stdio:'inherit'});
if(generated.error)throw generated.error;
if(generated.status!==0)process.exit(generated.status??1);
const {buildSync}=require('esbuild');
const options={bundle:true,packages:'external',platform:'node',format:'cjs',target:'node20',external:['electron','better-sqlite3','../generated/prisma'],logLevel:'warning'};
buildSync({...options,entryPoints:{main:'main.js',preload:'electron/preload.ts'},outdir:'.electron-dist',outExtension:{'.js':'.cjs'}});
