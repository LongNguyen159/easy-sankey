const ts=require('typescript');
const {readFileSync,writeFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const code=ts.transpileModule(readFileSync('src/app/components/models.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const modelExports={};
runInNewContext(code,{exports:modelExports});
writeFileSync('electron/storage/default-categories.json',JSON.stringify(Object.values(modelExports.expenseCategoryDetails),null,2)+'\n');
