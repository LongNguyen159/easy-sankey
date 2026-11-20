const {buildSync}=require('esbuild');
const options={bundle:true,packages:'external',platform:'node',format:'cjs',target:'node20',external:['electron','better-sqlite3','../generated/prisma'],logLevel:'warning'};
buildSync({...options,entryPoints:{main:'main.js',preload:'electron/preload.ts'},outdir:'.electron-dist',outExtension:{'.js':'.cjs'}});
