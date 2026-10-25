// Pinch-zoom, where it helps and nowhere it traps. A sheet or menu can be zoomed to read it. With the last one
// closed, a page left zoomed in is set back to its normal size: zoomed in with the sheet gone, the top and
// bottom bars sat off screen, and a pinch on the plan zoomed the plan, not the page, so there was no way back.
// The viewport tag brings it back (maximum-scale=1 for a moment, then zoomable again); and while the page is
// still zoomed, a pinch on the plan goes to the page (CSS: .page-zoomed; the plan's own pinch steps aside).
let wasOpen = false;
let resetting = false;

const zoomedIn = () => { const vv = window.visualViewport; return !!vv && vv.scale > 1.01; };
/** After each render: when the last sheet, dialog or menu has just closed with the page zoomed in, zoom it out. */
export function syncPageZoom() {
  const open = !!document.querySelector('.sheet, .modal, .menu');
  if (wasOpen && !open && zoomedIn()) resetPageZoom();
  wasOpen = open;
}
/** The page back to its normal size (the plan's own zoom is untouched). */
export function resetPageZoom() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  if (!meta || resetting) return;
  resetting = true;
  const was = meta.content;
  meta.content = `${was}, maximum-scale=1`;
  setTimeout(() => { meta.content = was; resetting = false; notePageZoom(); }, 400);
}
/** Whether the page itself is zoomed in (kept as a class, for the plan to let a pinch through). */
export function notePageZoom() {
  document.documentElement.classList.toggle('page-zoomed', zoomedIn());
}
export const pageZoomed = () => document.documentElement.classList.contains('page-zoomed');
