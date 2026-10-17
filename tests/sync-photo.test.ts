import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256 } from '../src/sync/photo';
it('sha', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 100000]) {
    const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
    expect(sha256(b)).toBe(createHash('sha256').update(b).digest('hex'));
  }
});
