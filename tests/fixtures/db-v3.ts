// The database layer of a page at database version 3 (fruit-dismiss-one, #208, Nov 2): copied verbatim from
// `origin/statelaws-11` at a68711b, src/db.ts, below this comment. It has no imports. Tests open the database as a
// version-3 page, still open or opened later, would, against this version's (tests/storage.test.ts). Not to be edited:
// it stands for code already out.
// Minimal key-value persistence over IndexedDB, with an in-memory fallback
// for browsers where IndexedDB is unavailable (some private modes).

export type StoreName = 'meta' | 'projects' | 'images' | 'kv';
const STORES: StoreName[] = ['meta', 'projects', 'images', 'kv'];
export const DB_NAME = 'landscape-planner';
/**
 * The database's version, and the guard against an older version of the app saving over newer data.
 *
 * THE RULE: DB_VERSION goes up whenever what's stored changes in a way an older version would lose data saving over
 * it: a field it doesn't know (it drops it, as a plan is read through its sanitizeProjectData), a record it would read
 * wrongly. A new optional field, a new part of a plan, a new record in kv: all of these. (docs/storage.md)
 *
 * Why that guards: once a page opens the database at a higher version, no page of an older version can use it.
 * - One open already (another tab or window) is told, and has to close it before the newer one can go on: every
 *   version since Oct 11 (the first to use IndexedDB) does, and reloads (onversionchange, below).
 * - One that opens after (a stale cached copy, a tab restored from long ago) is refused (VersionError): it says a
 *   newer version has the plans, and writes nothing (NewerVersionError; src/main.ts).
 * Left at the same version, an older page goes on saving its copy of a plan over the newer one, dropping what it
 * doesn't know (Nov 1: a buried line lost its role and became a plain shape).
 *
 * - 1 (Oct 11): the four stores.
 * - 2 (Nov 1): no store or record changed by the upgrade. Release 3 (#190: each plan's bought, household and switches;
 *   sync records' core and parts) changed what's stored at 1, so an older page still open could save over it. From 2,
 *   each plan record and each journal carries the version that wrote it (src/storage.ts dbVersion).
 * - 3 (Nov 2): no store or record changed by the upgrade. Plant shapes' fruitDismissed (a fruit-partner warning
 *   dismissed for one plant), which a version-2 page would drop, saving or syncing a plan, and whose journals, written
 *   without it, are kept apart from a plan saved at 3 rather than put over it (src/storage.ts replayJournals).
 *
 * onupgradeneeded only adds what's missing: it never deletes, clears or rewrites a store or a record. A change that
 * must rewrite records does it after the open, in one transaction (KV.changeAllOnce; src/storage.ts takeFromDevice).
 * Never lower it, and never deploy a build with a lower one (a rollback): every device that opened the newer one
 * would find its plans refused.
 */
export const DB_VERSION = 3;

/**
 * The database is at a higher version than this one's: a newer version of the app has opened it on this device. This
 * page must not read or write it (it would save over the newer one's data): never retried, never memory in its place.
 * Also what any read or write throws once a newer version, in another tab or window, has taken the database.
 */
export class NewerVersionError extends Error {
  constructor() { super('A newer version of the app has the database'); this.name = 'NewerVersionError'; }
}

/** One write in an atomic batch: a put, or a delete when `value` is undefined. */
export interface WriteOp { store: StoreName; key: string; value?: unknown }

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Keys in `store` that start with `prefix`. */
  keys(store: StoreName, prefix?: string): Promise<string[]>;
  /** Apply several puts/deletes, across stores, all-or-nothing. */
  write(ops: WriteOp[]): Promise<void>;
  /**
   * Once: unless kv/`flag` is set already, `change` each record of `store` (a new value, or undefined to leave it) and
   * set the flag to `value`, in one transaction, so nothing written meanwhile (another tab) is put back as it was read.
   * The flag's value if it was set already (and nothing changed), else undefined.
   */
  changeAllOnce(flag: string, value: unknown, store: StoreName, change: (v: unknown) => unknown): Promise<unknown>;
  /** True when data survives a reload. */
  readonly durable: boolean;
  /**
   * What to do when a newer version of the app, in another tab or window, needs the database: `last` first, which
   * may start one last write (at once, synchronously: it goes in before the newer version's upgrade, which waits for
   * this page to close the database); then the database is closed, and every later read or write throws
   * NewerVersionError; then `closed`. (IndexedDB only: memory has no other pages.)
   */
  onNewerVersion?(last: () => void, closed: () => void): void;
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
  /** Set once a newer version of the app, in another tab or window, needed the database: it's closed for good here. */
  private gone = false;
  private newer: { last?: () => void; closed?: () => void } = {};
  constructor(private db: IDBDatabase) {
    // (Every version since Oct 11 closes the database when a newer one needs it: this one, its last write first.)
    db.onversionchange = () => this.closeForNewer();
  }
  onNewerVersion(last: () => void, closed: () => void) { this.newer = { last, closed }; }
  private closeForNewer() {
    if (this.gone) return;
    // Edits not saved yet: their write is started now, so it goes in before the newer version's upgrade (that waits
    // for this connection to close, and closing waits for the write).
    try { this.newer.last?.(); } catch (e) { console.error('last write before a newer version failed', e); }
    this.gone = true;
    this.db.close();
    this.newer.closed?.();
  }
  /** A transaction, unless a newer version has taken the database. */
  private tx(stores: StoreName | StoreName[], mode?: IDBTransactionMode): IDBTransaction {
    if (this.gone) throw new NewerVersionError();
    return this.db.transaction(stores, mode);
  }
  async get<T>(store: StoreName, key: string) {
    return req<T | undefined>(this.tx(store).objectStore(store).get(key));
  }
  async getAll<T>(store: StoreName) {
    return req<T[]>(this.tx(store).objectStore(store).getAll());
  }
  async keys(store: StoreName, prefix?: string) {
    const os = this.tx(store).objectStore(store);
    const range = prefix ? IDBKeyRange.bound(prefix, prefix + '\uffff') : undefined;
    return (await req(os.getAllKeys(range))).map(String);
  }
  async write(ops: WriteOp[]) {
    if (!ops.length) return;
    const stores = [...new Set(ops.map((o) => o.store))];
    const tx = this.tx(stores, 'readwrite');
    for (const o of ops) {
      const os = tx.objectStore(o.store);
      if (o.value === undefined) os.delete(o.key);
      else os.put(o.value, o.key);
    }
    await done(tx);
  }
  async changeAllOnce(flag: string, value: unknown, store: StoreName, change: (v: unknown) => unknown) {
    const tx = this.tx([store, 'kv'], 'readwrite');
    const finished = done(tx);
    let was: unknown;
    const flagged = tx.objectStore('kv').get(flag);
    flagged.onsuccess = () => {
      was = flagged.result;
      if (was !== undefined) return;
      const cursor = tx.objectStore(store).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) { tx.objectStore('kv').put(value, flag); return; }
        const next = change(c.value);
        if (next !== undefined) c.update(next);
        c.continue();
      };
    };
    await finished;
    return was;
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
  async changeAllOnce(flag: string, value: unknown, store: StoreName, change: (v: unknown) => unknown) {
    const kv = this.data.get('kv')!, m = this.data.get(store)!;
    if (kv.get(flag) !== undefined) return structuredClone(kv.get(flag));
    for (const [k, v] of m) { const next = change(structuredClone(v)); if (next !== undefined) m.set(k, structuredClone(next)); }
    kv.set(flag, structuredClone(value));
    return undefined;
  }
}

/**
 * Told when this page's open has to wait for another page that still has the database open at an older version and
 * hasn't closed it (true), and when the wait is over (false). Every version since Oct 11 closes it when asked, so this
 * is a page that can't answer just now: frozen in the background, or stopped in a debugger.
 */
let onBlocked: ((blocked: boolean) => void) | null = null;
export function setOpenBlockedListener(fn: ((blocked: boolean) => void) | null) { onBlocked = fn; }

function openOnce(name: string): Promise<KV> {
  return (async () => {
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      // Only what's missing is added: every store, and every record in it, is kept as it is (DB_VERSION).
      const db = open.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    // (The open goes on by itself once the other page closes it.)
    let blocked = false;
    open.onblocked = () => { blocked = true; onBlocked?.(true); };
    try {
      return new IdbKV(await req(open)) as KV;
    } catch (e) {
      if ((e as { name?: unknown } | null)?.name === 'VersionError') throw new NewerVersionError();
      throw e;
    } finally {
      if (blocked) onBlocked?.(false);
    }
  })();
}

/**
 * Every record of every store, as stored, whatever the database's version: for a page that can't open the plans (a
 * newer version has them, src/main.ts) to save them as a file all the same. Opened with no version, so it's never
 * upgraded or changed, and closed after (at once if another page needs it meanwhile). Null when there's no database.
 */
export async function rawCopy(name = DB_NAME): Promise<{ version: number; stores: Record<string, Record<string, unknown>> } | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const open = indexedDB.open(name);
    // (None here: opening made an empty one. Not kept.)
    open.onupgradeneeded = () => open.transaction?.abort();
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { if (open.error?.name === 'AbortError') resolve(null); else reject(open.error); };
  });
  if (!db) return null;
  db.onversionchange = () => db.close();
  try {
    const stores: Record<string, Record<string, unknown>> = {};
    for (const s of Array.from(db.objectStoreNames)) {
      const os = db.transaction(s).objectStore(s);
      const [keys, values] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
      stores[s] = Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
    }
    return { version: db.version, stores };
  } finally {
    db.close();
  }
}

/**
 * Open the database, retrying once (Android occasionally fails a first open). Throws NewerVersionError, at once, when
 * a newer version of the app has opened it.
 */
export async function openKV(name = DB_NAME): Promise<KV> {
  if (typeof indexedDB === 'undefined') return new MemoryKV();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await openOnce(name);
    } catch (e) {
      // (Never memory in its place: the plans would look gone, and edits made there would be lost. src/main.ts says so.)
      if (e instanceof NewerVersionError) throw e;
      console.warn('IndexedDB open failed', e);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return new MemoryKV();
}
