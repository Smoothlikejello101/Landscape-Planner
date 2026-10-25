// Names for controls, for screen readers (TalkBack, VoiceOver) and voice control: a field's label names the control
// it sits over, as a sighted person reads it.

let nextId = 0;
const CONTROL = 'input, select, textarea';
const named = (c: Element) => c.id && c.ownerDocument.querySelector(`label[for="${CSS.escape(c.id)}"]`)
  || c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby') || !!c.closest('label');

/**
 * In each `.field`, a label with no control of its own names the first unnamed control after it, up to the next
 * label ("Opacity" its slider; "Custom:" the color picker, not "Color" above the swatches). Attributes only:
 * nothing is rebuilt, so a field being typed in keeps its focus and keyboard.
 */
export function labelFields(root: ParentNode): void {
  for (const field of root.querySelectorAll('.field')) {
    const labels = [...field.querySelectorAll('label')].filter((l) => !l.htmlFor && !l.querySelector(CONTROL));
    for (const label of labels) {
      for (const c of field.querySelectorAll(CONTROL)) {
        if (!(label.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const next = labels.find((l) => l !== label && (label.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (next && (next.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) break; // (past the next label)
        if (named(c) || (c as HTMLInputElement).type === 'hidden') continue;
        if (!c.id) c.id = `fld-${++nextId}`;
        label.htmlFor = c.id;
        break;
      }
    }
  }
}

/** The swatch colors, by name (src/constants.ts SWATCHES). */
export const SWATCH_NAMES: Record<string, string> = {
  '#16a34a': 'Green', '#65a30d': 'Olive green', '#84cc16': 'Lime', '#14b8a6': 'Teal',
  '#0ea5e9': 'Sky blue', '#6366f1': 'Indigo', '#a855f7': 'Purple', '#ec4899': 'Pink',
  '#ef4444': 'Red', '#f97316': 'Orange', '#f59e0b': 'Amber', '#fbbf24': 'Yellow',
  '#78350f': 'Brown', '#57534e': 'Dark gray', '#94a3b8': 'Slate', '#ffffff': 'White',
};
