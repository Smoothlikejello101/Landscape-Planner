// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { account } from '../src/account';
import { openKV } from '../src/db';
import { _resetStorageForTests, createProject, initStorage, resetSyncState, setSyncRecord } from '../src/storage';
import { deleteNote } from '../src/sync/sync';

// What the delete dialog says happens to a project: only "Recently deleted"
// when sync will really take it there.

let synced = '', local = '';
beforeEach(async () => {
  localStorage.clear();
  _resetStorageForTests();
  globalThis.indexedDB = new IDBFactory();
  await initStorage(await openKV('note'));
  await resetSyncState('u-1');
  synced = await createProject('Synced');
  local = await createProject('Only here');
  await setSyncRecord(synced, { revision: 1, hash: 'h' });
  Object.assign(account, { status: 'signedIn', userId: 'u-1', plan: { plan: 'beta', trialEnds: null, paidUntil: null, trialStarted: null } });
});

describe('the delete dialog', () => {
  it('a synced project, sync running: it goes to Recently deleted', () => {
    expect(deleteNote(synced)).toContain('Recently deleted (Projects → Account) for 30 days');
  });
  it('never synced: cannot be undone', () => {
    expect(deleteNote(local)).toBe('This cannot be undone.');
  });
  it('signed out, or another account’s sync state: cannot be undone', () => {
    Object.assign(account, { status: 'signedOut', userId: undefined });
    expect(deleteNote(synced)).toBe('This cannot be undone.');
    Object.assign(account, { status: 'signedIn', userId: 'u-2' });
    expect(deleteNote(synced)).toBe('This cannot be undone.');
  });
  it('sync paused, or off here: the account keeps it until sync runs', () => {
    Object.assign(account, { plan: { plan: 'trial', trialEnds: '2020-01-01T00:00:00Z', paidUntil: null, trialStarted: '2019-12-01T00:00:00Z' } });
    expect(deleteNote(synced)).toContain('when sync resumes');
    Object.assign(account, { plan: { plan: 'beta', trialEnds: null, paidUntil: null, trialStarted: null } });
    localStorage.setItem('lp-sync-device', 'off');
    expect(deleteNote(synced)).toContain('until sync is turned back on here');
  });
});
