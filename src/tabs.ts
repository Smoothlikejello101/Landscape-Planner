// Other tabs and windows of FullGrown on this device (Jason, Nov 6, from the bug hunt: a bed drawn in one tab was lost
// when the tab opened first saved its older copy of the plan over it). They share the plans: two browser tabs, or the
// installed app and a tab of it in the browser.
//
// - Each page tells the others when it has saved a plan, or changed the list of plans (src/storage.ts onSavedHere), on a
//   BroadcastChannel. A page showing that plan takes the newer copy in at once, unless it has changes of its own not
//   saved yet: their save keeps them apart (src/storage.ts catchUpWithOtherTabs). A page back in view checks too, since
//   one frozen in the background, as a phone does, hears nothing meanwhile.
// - Whatever is heard or missed, a save never goes over a copy another page saved since this page read it: the check is
//   in the save's own transaction (src/storage.ts writeCurrentKnowing).
// - A page opened while another is open is told so once (Jason, Nov 6: "it looks like you have multiple tabs open"),
//   since a change taken in from the other can't be undone here.
// Only this device's tabs and windows: other devices' changes come by sync (src/sync).

import { catchUpWithOtherTabs, pageId, setSavedHereListener } from './storage';

const CHANNEL_NAME = 'fullgrown-tabs';
/** `hello`: a page just opened; `here`: an open page's answer to it; `saved`: a plan saved (`id`); `plans`: the list changed. */
type Message = { kind: 'hello' | 'here' | 'saved' | 'plans'; page: string; id?: string };

let channel: BroadcastChannel | null = null;
let toldAlsoOpen = false;
let catching: Promise<void> | null = null;
let again = false;

/**
 * Start listening. `changed`: something shown here changed (draw again); `alsoOpen`: another page is open too (said once
 * per page).
 */
export function installTabs(on: { changed: () => void; alsoOpen: () => void }): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  const me = pageId();
  const post = (m: Omit<Message, 'page'>) => { try { channel?.postMessage({ ...m, page: me }); } catch { /* closed */ } };
  // One catch-up at a time; one more after it if another message came meanwhile.
  const catchUp = () => {
    if (catching) { again = true; return; }
    catching = catchUpWithOtherTabs().then((changed) => { if (changed) on.changed(); }, (e) => console.warn('could not catch up with another tab', e))
      .finally(() => { catching = null; if (again) { again = false; catchUp(); } });
  };
  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || m.page === me) return;
    if (m.kind === 'hello') post({ kind: 'here' });
    else if (m.kind === 'here') { if (!toldAlsoOpen) { toldAlsoOpen = true; on.alsoOpen(); } }
    else if (m.kind === 'saved' || m.kind === 'plans') catchUp();
  };
  setSavedHereListener((id) => post(id ? { kind: 'saved', id } : { kind: 'plans' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') catchUp(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) catchUp(); });
  post({ kind: 'hello' });
}
