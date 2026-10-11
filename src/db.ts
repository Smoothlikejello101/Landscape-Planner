// Minimal key-value persistence over IndexedDB, with an in-memory fallback
// for browsers where IndexedDB is unavailable (some private modes).

export type StoreName = 'meta' | 'projects' | 'images' | 'kv';
const STORES: StoreName[] = ['meta', 'projects', 'images', 'kv'];
export const DB_NAME = 'landscape-planner';
const DB_VERSION = 1;

/** One write in an atomic batch: a put, or a delete when `value` is undefined. */
export interface WriteOp { store: StoreName; key: string; value?: unknown }

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Keys in `store` that start with `prefix`. */
  keys(store: StoreName, prefix?: string): Promise<string[]>;
  /** Apply several puts/deletes, across stores, all-or-nothing. */
  write(ops: WriteOp[]): Promise<void>;
  /** True when data survives a reload. */
  readonly durable: boolean;
}
export const put = (store: StoreName, key: string, value: unknown): WriteOp => ({ store, key, value });
export const del = (store: StoreName, key: string): WriteOp => ({ store, key });

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

class IdbKV implements KV {
  readonly durable = true;
  constructor(private db: IDBDatabase) {}
  async get<T>(store: StoreName, key: string) {
    return req<T | undefined>(this.db.transaction(store).objectStore(store).get(key));
  }
  async getAll<T>(store: StoreName) {
    return req<T[]>(this.db.transaction(store).objectStore(store).getAll());
  }
  async keys(store: StoreName, prefix?: string) {
    const os = this.db.transaction(store).objectStore(store);
    const range = prefix ? IDBKeyRange.bound(prefix, prefix + '\uffff') : undefined;
    return (await req(os.getAllKeys(range))).map(String);
  }
  async write(ops: WriteOp[]) {
    if (!ops.length) return;
    const stores = [...new Set(ops.map((o) => o.store))];
    const tx = this.db.transaction(stores, 'readwrite');
    for (const o of ops) {
      const os = tx.objectStore(o.store);
      if (o.value === undefined) os.delete(o.key);
      else os.put(o.value, o.key);
    }
    await done(tx);
  }
}

export class MemoryKV implements KV {
  readonly durable = false;
  private data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  async get<T>(store: StoreName, key: string) { return structuredClone(this.data.get(store)!.get(key)) as T | undefined; }
  async getAll<T>(store: StoreName) { return [...this.data.get(store)!.values()].map((v) => structuredClone(v)) as T[]; }
  async keys(store: StoreName, prefix = '') {
    return [...this.data.get(store)!.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async write(ops: WriteOp[]) {
    for (const o of ops) {
      const m = this.data.get(o.store)!;
      if (o.value === undefined) m.delete(o.key);
      else m.set(o.key, structuredClone(o.value));
    }
  }
}

export async function openKV(name = DB_NAME): Promise<KV> {
  if (typeof indexedDB === 'undefined') return new MemoryKV();
  try {
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    const db = await req(open);
    // Another tab upgraded the schema: close so it isn't blocked.
    db.onversionchange = () => db.close();
    return new IdbKV(db);
  } catch (e) {
    console.warn('IndexedDB unavailable; using memory only', e);
    return new MemoryKV();
  }
}
