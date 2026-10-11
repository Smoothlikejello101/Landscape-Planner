// Tiny DOM builders. `el` and `svgEl` create elements with attributes and
// children in one call so panels can be written declaratively.

export type Child = Node | string | number | null | undefined | false | Child[];
type StyleObject = { [K in keyof CSSStyleDeclaration]?: string | number };
export type Attrs = { [key: string]: unknown; style?: StyleObject | string; className?: string; html?: string };

const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
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
