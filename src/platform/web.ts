import type { KeyValueStorage, Platform } from './types';

const DB = 'bloomgrid';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IndexedDbStorage implements KeyValueStorage {
  private db = openDb();

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.tx('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
  async keys(): Promise<string[]> {
    return (await this.tx('readonly', (s) => s.getAllKeys())).map(String);
  }
}

export function createWebPlatform(): Platform {
  return {
    name: 'web',
    storage: new IndexedDbStorage(),
    async exportFile(name, data) {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
