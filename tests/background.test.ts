import { describe, expect, it } from 'vitest';
import { calibrationScale, imagePxToWorld, worldToImagePx } from '../src/background';
import { angleFrom, normalizeDeg } from '../src/gestures';
import type { BgImage } from '../src/types';

const bg: BgImage = { dataUrl: '', naturalWidth: 400, naturalHeight: 200, ftPerPx: 0.25, cx: 10, cy: -5, rotation: 30, opacity: 1, visible: true };

describe('background image math', () => {
  it('round-trips image pixels through world coordinates', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 400, y: 200 }, { x: 123, y: 45 }]) {
      const back = worldToImagePx(bg, imagePxToWorld(bg, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });
  it('maps the image center pixel to the stored center', () => {
    const c = imagePxToWorld(bg, { x: 200, y: 100 });
    expect(c.x).toBeCloseTo(10, 6); expect(c.y).toBeCloseTo(-5, 6);
  });
  it('computes feet per pixel from two points and a distance', () => {
    expect(calibrationScale({ x: 0, y: 0 }, { x: 30, y: 40 }, 25)).toBeCloseTo(0.5, 9);
  });
  it('rejects points too close together or a bad distance', () => {
    expect(typeof calibrationScale({ x: 0, y: 0 }, { x: 1, y: 0 }, 10)).toBe('string');
    expect(typeof calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBe('string');
    expect(typeof calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, NaN)).toBe('string');
  });
});

describe('rotation gesture math', () => {
  it('measures angles with 0° pointing up, clockwise positive', () => {
    expect(angleFrom({ x: 0, y: 0 }, 0, -10)).toBeCloseTo(0, 9);
    expect(angleFrom({ x: 0, y: 0 }, 10, 0)).toBeCloseTo(90, 9);
  });
  it('normalizes degrees into [-180, 180)', () => {
    expect(normalizeDeg(190)).toBe(-170);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(180)).toBe(-180);
    expect(normalizeDeg(45)).toBe(45);
    expect(normalizeDeg(720 + 10)).toBe(10);
  });
});
