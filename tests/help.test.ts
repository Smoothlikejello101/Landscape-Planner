import { describe, expect, it } from 'vitest';
import { helpAnswers, TOUR_LINE, type HelpDevice, type HelpId } from '../src/help';

// Help's "How do I…" answers (src/help.ts), worded for the device: Jason, Nov 2, from the UI review.

const PHONE: HelpDevice = { keyboard: false, mac: false, roomy: true, shareWords: true, shareFiles: true, signIn: true };
const PC: HelpDevice = { keyboard: true, mac: false, roomy: true, shareWords: false, shareFiles: false, signIn: true };
const MAC: HelpDevice = { ...PC, mac: true };
const said = (d: HelpDevice, id: HelpId) => helpAnswers(d).find((a) => a.id === id)!.lines.join(' ');

describe('Help: "How do I…"', () => {
  it('asks the seven questions, in order, each answered in two or three lines', () => {
    for (const d of [PHONE, PC, MAC, { ...PHONE, roomy: false, signIn: false, shareFiles: false }]) {
      const list = helpAnswers(d);
      expect(list.map((a) => a.id)).toEqual(['print', 'list', 'backup', 'undo', 'own-plant', 'location', 'protect']);
      for (const a of list) {
        expect(a.lines.length).toBeGreaterThanOrEqual(2);
        expect(a.lines.length).toBeLessThanOrEqual(3);
      }
    }
  });
  it('never says tap or click, on a phone or a computer, and spells it the American way', () => {
    for (const d of [PHONE, PC, MAC]) {
      const words = [TOUR_LINE, ...helpAnswers(d).flatMap((a) => [a.q, ...a.lines])].join(' ');
      expect(words).not.toMatch(/\b(tap|click)/i);
      expect(words).not.toMatch(/colour|grey|favour|organis|recognis|centre/i);
    }
  });
  it('gives the keys for Undo and Redo only with a keyboard: Ctrl, or ⌘ on a Mac', () => {
    expect(said(PHONE, 'undo')).not.toMatch(/Ctrl|⌘/);
    expect(said(PC, 'undo')).toContain('Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo');
    expect(said(MAC, 'undo')).toContain('⌘Z to undo, ⌘⇧Z to redo');
    expect(said(MAC, 'undo')).not.toContain('Ctrl');
  });
  it('says where Redo is at the text size: beside Undo at Small, in ⋮ above it', () => {
    expect(said({ ...PHONE, roomy: false }, 'undo')).toContain('Undo and Redo are the curved arrows at the top');
    expect(said(PHONE, 'undo')).toContain('Redo is in ⋮, and just under Undo while there’s something to redo');
  });
  it('names the plant list\'s button as it shows: Share as text, or Copy as text', () => {
    expect(said(PHONE, 'list')).toContain('Share as text');
    expect(said(PC, 'list')).toContain('Copy as text');
  });
  it('offers Share backup only where a file can be shared, and sync only where sign-in is (not on Next)', () => {
    expect(said(PHONE, 'backup')).toContain('Share backup to Drive, email…');
    expect(said(PC, 'backup')).not.toContain('Share backup');
    expect(said(PHONE, 'backup')).toContain('turn on sync');
    expect(said({ ...PHONE, signIn: false }, 'backup')).not.toMatch(/sign in|sync/i);
  });
  it('uses the names the app shows: Print\'s What to print, ⋮\'s items, the picker\'s question', () => {
    expect(said(PHONE, 'print')).toContain('⋮ → Print or save as PDF. Under What to print, choose the whole plan, what’s on screen, or one bed.');
    expect(said(PHONE, 'backup')).toContain('⋮ → Plans and backup');
    expect(said(PHONE, 'backup')).toContain('Back up all projects');
    expect(said(PHONE, 'backup')).toContain('Import from file');
    expect(said(PHONE, 'own-plant')).toContain('Add your own plant');
    expect(said(PHONE, 'own-plant')).toContain('My plants');
    expect(said(PHONE, 'location')).toContain('⋮ → Garden location');
    expect(said(PHONE, 'protect')).toContain('“Anyone you need to protect?”');
    expect(said(PHONE, 'protect')).toContain('Filters → Poison & pets');
  });
});
