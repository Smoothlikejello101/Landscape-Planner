// Help (⋮ → Help; Jason, Nov 2, from the UI review: "'Show me around' becomes Help: 'How do I…' print, get a plant
// list, back up, undo, add my own plant, take the tour"). A short "How do I…" list, each answer two or three plain
// lines: where it is and what it does, in the app's own names for things. src/ui/help-sheet.ts draws it, with a button
// that goes there, the tour and Send feedback.
//
// The words fit the device (src/ui/help-sheet.ts reads it): the keys for Undo and Redo on a computer (⌘ on a Mac);
// where Redo is at the text size chosen; Share or Copy for the plant list, as its own button says; Share backup where
// the device can share a file; sign-in where the app has it (not on Next). No "tap" or "click": the answers say where
// a thing is and what it's called, which reads the same on a phone and a computer.

import { ANDROID_STEPS, INSTALL_MEANS, IPHONE_STEPS } from './install';

export interface HelpDevice {
  /** A keyboard and a mouse or trackpad (src/dom.ts hasKeyboard). */
  keyboard: boolean;
  /** A Mac, for ⌘ in place of Ctrl (src/sync/sync.ts deviceName). */
  mac: boolean;
  /** Medium text or larger: Redo is in ⋮, not beside Undo (src/text-size.ts roomyText). */
  roomy: boolean;
  /** The plant list's button says "Share as text" (it can share words, without a keyboard), else "Copy as text". */
  shareWords: boolean;
  /** The device can share a file: Plans and backup has "Share backup to Drive, email…". */
  shareFiles: boolean;
  /** Sign-in and sync are offered (not on Next: src/channel.ts). */
  signIn: boolean;
  /** Running installed, from its own icon (src/ui/install-card.ts runningInstalled). */
  installed?: boolean;
}

export type HelpId = 'print' | 'list' | 'backup' | 'undo' | 'own-plant' | 'location' | 'protect' | 'install';
export interface HelpAnswer { id: HelpId; q: string; lines: string[] }

/** The "How do I…" list, in its order, worded for `d`. */
export function helpAnswers(d: HelpDevice): HelpAnswer[] {
  return [
    {
      id: 'print', q: 'Print my plan, or one bed',
      lines: [
        '⋮ → Print or save as PDF. Under What to print, choose the whole plan, what’s on screen, or one bed.',
        'Create PDF draws it as big as fits on the page, to print or keep.',
      ],
    },
    {
      id: 'list', q: 'Get a plant list',
      lines: [
        '⋮ → Plant list, or its button down the side of the plan: the plan’s plants by kind, under To buy, Planted and Existing. Tick each kind as you buy it.',
        `${d.shareWords ? 'Share as text sends it to a note or a message' : 'Copy as text copies it, to paste into a note or an email'}; Print list makes a PDF of what’s to buy, to take to the nursery.`,
      ],
    },
    {
      id: 'backup', q: 'Back up my plans, and restore them on another device',
      lines: [
        `⋮ → Plans and backup (the plan’s name at the top opens it too). Back up all projects saves one file with every plan${d.shareFiles ? '; Share backup to Drive, email… sends it there' : ''}.`,
        'On the other device, Import from file, in the same place, brings them in. A new device offers Restore a backup on its first screen.',
        ...(d.signIn ? ['Or sign in under Account, in the same place, and turn on sync to keep your plans the same on every device.'] : []),
      ],
    },
    {
      id: 'undo', q: 'Undo, and redo',
      lines: [
        d.roomy
          ? 'Undo is the curved arrow at the top of the screen: one change back at a time. Redo is in ⋮, and just under Undo while there’s something to redo.'
          : 'Undo and Redo are the curved arrows at the top of the screen: one change back, or forward again, at a time.',
        'They’re grayed while a sheet like this one is open. Some changes also show a notice with an Undo of its own.',
        ...(d.keyboard ? [d.mac ? 'Keys: ⌘Z to undo, ⌘⇧Z to redo.' : 'Keys: Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo.'] : []),
      ],
    },
    {
      id: 'own-plant', q: 'Add my own plant',
      lines: [
        'In the plant picker (Plant, at the bottom of the screen), search for it; below the list, Add your own plant.',
        'It needs a name and its width when grown; start from a similar plant to fill in the rest. It’s kept under My plants in the picker, for all your plans.',
      ],
    },
    {
      id: 'location', q: 'Set my garden’s location',
      lines: [
        '⋮ → Garden location. Its ZIP code gives the garden’s USDA hardiness zone, typical frost dates and the state’s plant laws.',
        'Each plan keeps its own. The picker then shows plants the state bans only when searched by name, and can keep to what’s hardy there; Warnings checks hardiness.',
      ],
    },
    {
      id: 'protect', q: 'Mark what’s dangerous to my kids or pets',
      lines: [
        'In the plant picker, “Hide plants rated toxic to:” People, Dogs, Cats or Horses (first among its filters until you answer it, then under Filters). Warnings → Poison has the same choice.',
        'Plants rated toxic to them are then hidden in the picker, and any already on the plan are flagged in Warnings. A plant not rated still shows: that isn’t the same as safe. It’s kept with the plan.',
      ],
    },
    // (Jason, Nov 4, from the beta testers: Kayla "didn't know what it meant to install it on her home screen".)
    {
      id: 'install', q: 'Install the app on my phone',
      lines: [
        `Installed, FullGrown ${INSTALL_MEANS.replace(/^It /, '')}`,
        d.installed ? 'It’s installed: you’re using it now.' : `On an iPhone, in Safari: ${IPHONE_STEPS} On Android, in Chrome: ${ANDROID_STEPS}`,
      ],
    },
  ];
}

/** Guided start, in a line under its button. */
export const GUIDED_START_LINE = 'Eight short steps on this plan, from where the garden is to a first plant in a bed. Leave any time: it keeps your place.';
