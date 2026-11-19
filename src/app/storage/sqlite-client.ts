import { DatabaseApi } from './database-api';
let client: DatabaseClient | undefined;
export function getDatabaseClient(): DatabaseClient {
    if (!client)
        throw new Error('Desktop database is not initialized.');
    return client;
}
/** Coordinates commands, without retaining financial data or silently retrying conflicts. */
export class DatabaseClient {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(readonly api: DatabaseApi) { }
    command<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.tail.then(operation);
        this.tail = result.catch(() => { });
        return result;
    }
    async exportBackup() { await this.tail; return this.api.state.exportBackup(); }
    restore(text: string) { return this.command(async () => this.api.state.restore({ text, revision: (await this.api.status()).revision })); }
    reset() { return this.command(async () => this.api.state.reset((await this.api.status()).revision)); }
}
/** Connect to the database created by the desktop process. */
export async function initializeSqlite(): Promise<void> {
    const api = window.electronAPI?.database;
    if (!api)
        throw new Error('Open Easy Sankey in the desktop application to use its local database.');
    const status=await api.status();
    if(!status.initialized&&!status.recoveryRequired) {
        const legacy:Record<string,string>={};
        for(let index=0;index<localStorage.length;index++) {
            const key=localStorage.key(index)!;legacy[key]=localStorage.getItem(key)!;
        }
        await api.state.initialize(legacy);
    }
    if((await api.status()).recoveryRequired)throw new Error('Database is missing. Restore a full backup to recover your data.');
    client = new DatabaseClient(api);
    const { initializeRepositories } = await import('./repositories');
    await initializeRepositories(client);
    await api.history.cleanup({});
}
