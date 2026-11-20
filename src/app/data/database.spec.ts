import {DatabaseClient} from './database';
import {DatabaseApi} from './database';

describe('database command coordinator',()=>{
 it('serializes commands and continues after a rejected operation',async()=>{
  const client=new DatabaseClient({} as DatabaseApi);const events:string[]=[];
  let release!:()=>void;
  const first=client.command(async()=>{events.push('first');await new Promise<void>(resolve=>release=resolve);throw new Error('Disk full');});
  const rejected=expectAsync(first).toBeRejectedWithError('Disk full');
  const second=client.command(async()=>{events.push('second');return 2;});
  await Promise.resolve();expect(events).toEqual(['first']);release();
  await rejected;expect(await second).toBe(2);expect(events).toEqual(['first','second']);
 });
 it('waits for pending writes before exporting a backup',async()=>{
  const events:string[]=[];
  const client=new DatabaseClient({state:{exportBackup:async()=>{events.push('export');return 'backup';}}} as DatabaseApi);
  const save=client.command(async()=>{events.push('save');});
  const backup=client.exportBackup();await save;
  expect(await backup).toBe('backup');expect(events).toEqual(['save','export']);
 });
});
