// Мини-обёртка над IndexedDB: key-value хранилища без зависимостей.

const DB_NAME = 'kartu-grades';
const STORES = ['queue', 'cache', 'demo', 'demo-files'] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const r = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(r.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const idbSet = (store: StoreName, key: string, value: unknown) =>
  run<void>(store, 'readwrite', (s) => s.put(value, key));
export const idbDel = (store: StoreName, key: string) => run<void>(store, 'readwrite', (s) => s.delete(key));
export const idbAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll());
export const idbKeys = (store: StoreName) => run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());
