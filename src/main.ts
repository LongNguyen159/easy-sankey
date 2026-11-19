import { initializeSqlite } from './app/storage/sqlite-client';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

initializeSqlite().then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => {
    console.error(err);
    document.body.textContent = `Could not open local database: ${err.message}. Your existing data has been retained.`;
    const api=window.electronAPI?.database?.state;
    if(!api)return;
    const restore=document.createElement('input');restore.type='file';restore.accept='.json,application/json';
    const label=document.createElement('p');label.textContent='Restore a full backup to recover:';
    document.body.append(label,restore);
    restore.addEventListener('change',async()=>{
      const file=restore.files?.[0];if(!file)return;
      try {
        const snapshot=await api.snapshot();
        await api.restore({text:await file.text(),revision:snapshot.revision});
        location.reload();
      } catch(error) { label.textContent=`Could not restore backup: ${(error as Error).message}`; }
    });
  });
window.addEventListener('unhandledrejection', event => { console.error(event.reason); alert(`The operation could not be saved: ${event.reason?.message ?? event.reason}`); });
