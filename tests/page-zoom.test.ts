// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notePageZoom, pageZoomed, syncPageZoom } from '../src/page-zoom';

const BASE = 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';
function setup(scale: number) {
  document.head.innerHTML = `<meta name="viewport" content="${BASE}">`;
  Object.defineProperty(window, 'visualViewport', { value: { scale }, configurable: true });
}
const meta = () => document.querySelector('meta[name=viewport]')!.getAttribute('content');

describe('a page left zoomed in when its sheet closes', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });
  it('is set back to its size (a moment of maximum-scale=1), then zoomable again', () => {
    vi.useFakeTimers();
    setup(2.2);
    document.body.innerHTML = '<div class="sheet"></div>';
    syncPageZoom(); // (a sheet open: zoom freely)
    expect(meta()).toBe(BASE);
    document.body.innerHTML = '';
    syncPageZoom(); // (closed, still zoomed in)
    expect(meta()).toBe(`${BASE}, maximum-scale=1`);
    vi.advanceTimersByTime(500);
    expect(meta()).toBe(BASE);
  });
  it('is left alone when it isn’t zoomed; while zoomed, the plan lets a pinch through to the page', () => {
    setup(1);
    document.body.innerHTML = '<div class="menu"></div>';
    syncPageZoom();
    document.body.innerHTML = '';
    syncPageZoom();
    expect(meta()).toBe(BASE);
    notePageZoom();
    expect(pageZoomed()).toBe(false);
    setup(1.8);
    notePageZoom();
    expect(pageZoomed()).toBe(true);
  });
});
