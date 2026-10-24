import { describe, expect, it } from 'vitest';
import { feedbackLink } from '../src/feedback';

describe('feedbackLink', () => {
  it('opens an email to us, with the version and device under room for their words', () => {
    const url = new URL(feedbackLink('0.2.081', 'Android phone'));
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('hello@fullgrown.garden');
    expect(url.searchParams.get('subject')).toBe('FullGrown feedback');
    expect(url.searchParams.get('body')).toBe('\n\n\n---\nFullGrown 0.2.081 · Android phone');
  });
  it('encodes what a mail app would misread', () => {
    const link = feedbackLink('1.0 & more', 'iPhone');
    expect(link).toContain('subject=FullGrown%20feedback');
    expect(link).not.toMatch(/ /); // no raw spaces
    expect(link.split('?')[1].split('&')).toHaveLength(2); // the & in the version is encoded, not a new field
    expect(new URL(link).searchParams.get('body')).toContain('FullGrown 1.0 & more · iPhone');
  });
});
