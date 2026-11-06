// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { el } from '../src/dom';

// An element's markup, read once and copied after (the audit of Nov 6: the plant picker's icons and spots parsed anew
// for every row, each letter typed in its search): the same elements as setting it would make, each its own.
describe('an element\'s markup', () => {
  it('makes what setting innerHTML would, every time, each copy its own', () => {
    const html = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#16a34a"></circle></svg><span class="x">Hi &amp; bye</span>';
    const a = el('button', { html }), b = el('button', { html });
    const plain = document.createElement('button');
    plain.innerHTML = html;
    expect(a.innerHTML).toBe(plain.innerHTML);
    expect(b.innerHTML).toBe(plain.innerHTML);
    expect(a.querySelector('circle')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(a.ownerDocument).toBe(document);
    a.querySelector('circle')!.setAttribute('r', '1'); // (a change to one is to it alone)
    expect(b.querySelector('circle')!.getAttribute('r')).toBe('4');
    expect(el('div', { html }).innerHTML).toBe(plain.innerHTML); // (and on another kind of element)
  });
  it('words with no tag in them are set as they are; children still follow', () => {
    expect(el('span', { html: 'Bed &amp; border' }).textContent).toBe('Bed & border');
    expect(el('p', { html: '<b>A</b>' }, ' and B').innerHTML).toBe('<b>A</b> and B');
  });
});
