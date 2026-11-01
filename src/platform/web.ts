import type { DocStore, KeyValueStorage, Platform } from './types';

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

/** Seedvault's journal in its own database, so the save store's schema never has to change for it. */
class IndexedDbDocs implements DocStore {
  readonly where = 'this browser (IndexedDB)';
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('bloomgrid-knowledge', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('docs');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('docs', mode).objectStore('docs'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async list(): Promise<{ id: string; text: string }[]> {
    const [keys, values] = await Promise.all([this.run('readonly', (s) => s.getAllKeys()), this.run('readonly', (s) => s.getAll() as IDBRequest<string[]>)]);
    return keys.map((k, i) => ({ id: String(k), text: String(values[i] ?? '') }));
  }
  async put(id: string, text: string): Promise<void> {
    await this.run('readwrite', (s) => s.put(text, id));
  }
  async remove(id: string): Promise<void> {
    await this.run('readwrite', (s) => s.delete(id));
  }
}

export function createWebPlatform(): Platform {
  return {
    name: 'web',
    storage: new IndexedDbStorage(),
    knowledge: new IndexedDbDocs(),
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
