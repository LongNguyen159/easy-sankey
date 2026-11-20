import {ExpenseCategoryDetails,UserDefinedLink} from '../components/models';
import {canonical,entries as validateEntries,sourceData} from '../../../electron/import-export';

type JsonObject=Record<string,unknown>;
function readTransfer(text:string,type:'full'|'month'):JsonObject {
 const payload:unknown=JSON.parse(text);
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid transfer data.');
 const data=payload as JsonObject;
 if(data['app']!=='easy-sankey'||![1,2].includes(data['version'] as number)||data['type']!==type)throw new Error('Unsupported data transfer format.');
 return data;
}
export function readBackup(text:string):JsonObject {
 return sourceData(readTransfer(text,'full')['data']);
}
export interface MonthTransfer {entries:UserDefinedLink[];categories:ExpenseCategoryDetails[];}
export function exportMonth(entries:UserDefinedLink[],categories:readonly ExpenseCategoryDetails[]):string {
 const sources=new Set(entries.map(entry=>entry.source));
 return JSON.stringify({app:'easy-sankey',version:1,type:'month',entries,categories:categories.filter(category=>sources.has(category.value))});
}
export function readMonth(text:string):MonthTransfer {
 const payload=readTransfer(text,'month');
 const entries=payload['entries'];const categories=payload['categories'];
 if(!Array.isArray(entries)||!entries.length||!Array.isArray(categories))throw new Error('Invalid month data.');
 validateEntries(entries);canonical('expenseCategories',categories);
 return {entries:entries as UserDefinedLink[],categories:categories as ExpenseCategoryDetails[]};
}
