import {BudgetEnvelope,ExpenseCategoryDetails,UserDefinedLink} from '../components/models';
import {envelopes as validateEnvelopes,canonical,entries as validateEntries,sourceData} from '../../../electron/import-export';

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
export interface MonthTransfer {entries:UserDefinedLink[];categories:ExpenseCategoryDetails[];envelopes?:BudgetEnvelope[];sourceMonth?:string;allowSameMonth?:boolean;}
export function exportMonth(entries:UserDefinedLink[],categories:readonly ExpenseCategoryDetails[],envelopes:BudgetEnvelope[]=[],sourceMonth?:string,allowSameMonth?:boolean):string {
 const sources=new Set(entries.map(entry=>entry.source));
 return JSON.stringify({app:'easy-sankey',version:1,type:'month',sourceMonth,allowSameMonth,entries,envelopes,categories:categories.filter(category=>sources.has(category.value))});
}
export function readMonth(text:string):MonthTransfer {
 const payload=readTransfer(text,'month');
 const sourceMonth=payload['sourceMonth'];
 if(sourceMonth!==undefined&&(typeof sourceMonth!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(sourceMonth)))throw new Error('Invalid source month.');
 const allowSameMonth=payload['allowSameMonth'] === true;
 const entries=payload['entries'];const categories=payload['categories'];
 if(!Array.isArray(entries)||!entries.length||!Array.isArray(categories))throw new Error('Invalid month data.');
 validateEntries(entries);canonical('expenseCategories',categories);
 const envelopes=payload['envelopes']??[];validateEnvelopes(envelopes);
 const ids=new Set((envelopes as BudgetEnvelope[]).map(item=>item.id));
 if(entries.some(item=>item.envelopeId&&!ids.has(item.envelopeId)))throw new Error('Missing envelope in copied month.');
 return {entries:entries as UserDefinedLink[],categories:categories as ExpenseCategoryDetails[],envelopes:envelopes as BudgetEnvelope[],sourceMonth,allowSameMonth};
}
