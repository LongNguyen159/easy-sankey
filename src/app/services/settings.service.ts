import {inject,Injectable} from '@angular/core';
import {DATABASE_CLIENT,CONFIGURATION,Settings} from '../data/database';
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private client = inject(DATABASE_CLIENT);
  private values: Partial<Settings> = structuredClone(
    inject(CONFIGURATION).settings,
  );
  read<K extends keyof Settings>(key: K): Settings[K] | null {
    return structuredClone(this.values[key] ?? null) as Settings[K] | null;
  }
  async write<K extends keyof Settings>(key: K, value: Settings[K]) {
    const input = structuredClone(value);
    await this.client.command(() =>
      this.client.api.settings.set({ key, value: input }),
    );
    this.values[key] = input;
  }
  async reload() {
    this.values = (await this.client.api.settings.list()).value;
  }
}
