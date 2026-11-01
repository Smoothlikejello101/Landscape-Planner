import { describe, expect, it } from 'vitest';
import { importTooBig, MAX_IMPORT_BYTES } from '../src/backup';

// Import refuses a file too big to be a plan or backup before reading it into memory (weekly security check, Nov 1).
describe('a file too big to import', () => {
  it('goes ahead up to the limit, which leaves room for a backup of many plans with photos', () => {
    expect(MAX_IMPORT_BYTES).toBe(100 * 1024 * 1024);
    expect(importTooBig(0)).toBeNull();
    expect(importTooBig(40 * 1024 * 1024)).toBeNull();
    expect(importTooBig(MAX_IMPORT_BYTES)).toBeNull();
  });
  it('says how big it is, and what to pick instead', () => {
    expect(importTooBig(MAX_IMPORT_BYTES + 1)).toBe(
      "That file is 101 MB, too big to be a FullGrown plan or backup (they're well under 100 MB). Pick the .json file you saved from FullGrown.");
    expect(importTooBig(312 * 1024 * 1024)).toContain('That file is 312 MB');
  });
});
