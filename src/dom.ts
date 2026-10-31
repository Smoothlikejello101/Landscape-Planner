// Tiny DOM builders. `el` and `svgEl` create elements with attributes and
// children in one call so panels can be written declaratively.

export type Child = Node | string | number | null | undefined | false | Child[];
type StyleObject = { [K in keyof CSSStyleDeclaration]?: string | number };
export type Attrs = { [key: string]: unknown; style?: StyleObject | string; className?: string; html?: string };

const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
/** Where there's a keyboard and a mouse or trackpad (a laptop or desktop), not a touch screen's pop-up keyboard. */
export function hasKeyboard(): boolean {
  return !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Words for a touch, as the device does it: "Tap where the note goes" on a phone; "Click where the note goes" with a
 * mouse or trackpad (round 3, Alex: prompts said "Tap" on a computer). Tap, taps, tapped, tapping; a double tap is a
 * double-click.
 */
export function tapSaid(text: string, mouse = hasKeyboard()): string {
  if (!mouse) return text;
  return text.replace(/\b([Dd]ouble[ -])?([Tt])ap(s|ped|ping)?\b/g, (_m, dbl: string | undefined, t: string, end: string | undefined) => {
    const word = 'lick' + (end === 'ped' ? 'ed' : end === 'ping' ? 'ing' : end ?? '');
    if (dbl) return (dbl[0] === 'D' ? 'Double-c' : 'double-c') + word;
    return (t === 'T' ? 'C' : 'c') + word;
  });
}

export function escapeHtml(s: unknown): string {
  return String(s).replace(/[<>&"']/g, (c) => ESCAPES[c]);
}

function appendChildren(e: Element, children: Child[]) {
  for (const c of (children as unknown[]).flat(Infinity) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : (c as Node));
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (k === 'className') e.className = String(v);
      else if (k === 'style' && typeof v === 'object' && v) Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (v === false || v === null || v === undefined) continue;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  }
  appendChildren(e, children);
  return e;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else e.setAttribute(k, String(v));
    }
  }
  appendChildren(e, children);
  return e;
}

/** A text size in an element's style: `px` at Small, scaled with the text size like every size in styles.css. */
export const ts = (px: number): string => `calc(${px}px * var(--ts))`;
