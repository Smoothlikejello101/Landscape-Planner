"""Read the Arkansas atlas's county dot maps: which counties each species is recorded in.

    python3 -I scripts/catalog/atlas_counties.py <atlas.pdf> <counties.json> <out.json>

<atlas.pdf>: the Atlas of the Vascular Plants of Arkansas (2013, the free download edition, as fetched into
catalog-src/arkatlas/). <counties.json>: from scripts/catalog/counties.mjs (Census county centers).
Writes {"Genus species": [county FIPS, ...]} (five-digit codes as numbers: Clark County is 5019): the counties with a dot on the species' map (a map of a species
drawn more than once, as its varieties, counts each).

How it reads them: every map is the same county base map, and each dot is a small image placed at its
county's spot, so the PDF says exactly where each dot is. The dot spots, gathered from every map, are the
75 counties; they're matched to the counties' real centers by the best affine fit (the match is checked:
no spot may sit more than MAX_FIT points from its county's fitted center, on a map 189 points wide). A dot
that isn't on a county spot stops the run. The species is the bold name under its map. Only facts are taken
(which counties): no map, image or text of the atlas is stored.

Needs pdfplumber, numpy and scipy.
"""
import json
import re
import sys

import numpy as np
import pdfplumber
from scipy.optimize import linear_sum_assignment

MAP_W, MAP_H = 188.9, 165.0  # (the atlas's species maps; a few larger maps in its introduction are left out)
DOT_MAX = 10                 # dots are 5 points across
SAME_SPOT = 3.0              # dot spots this close are one county's (the atlas shifts a few by a point or two)
MAX_FIT = 5.0
ARKANSAS = 5                 # (state FIPS)


def is_map(img):
    return abs(img['width'] - MAP_W) < 1 and abs(img['height'] - MAP_H) < 1


def maps_on(page):
    imgs = page.images
    maps = [i for i in imgs if is_map(i)]
    dots = [i for i in imgs if i['width'] <= DOT_MAX]
    for m in maps:
        inside = []
        for d in dots:
            cx, cy = d['x0'] + d['width'] / 2, d['top'] + d['height'] / 2
            if m['x0'] <= cx <= m['x1'] and m['top'] <= cy <= m['bottom']:
                inside.append((cx - m['x0'], cy - m['top']))
        yield m, inside


def name_under(page, words, m):
    """The bold botanical name under a map ("Quercus muehlenbergii Engelm." → "Quercus muehlenbergii")."""
    # (A long name wraps: the genus can sit a line above the rest, just under the map's family line.)
    # (and a long one, centered, runs wider than its map: its column is its half of the page.)
    left = (m['x0'] + m['x1']) / 2 < page.width / 2
    bold = [w for w in words if m['bottom'] + 4 < w['top'] < m['bottom'] + 45 and 'Bold' in w['fontname']
            and ((w['x0'] + w['x1']) / 2 < page.width / 2) == left]
    if not bold:
        return None
    text = ' '.join(w['text'] for w in sorted(bold, key=lambda w: (round(w['top']), w['x0'])))
    text = re.sub(r'\s+', ' ', text.replace('×', ' × '))
    m_ = re.search(r'\b([A-Z][a-zë-]+) (× )?([a-zë][a-zë-]+)\b', text)
    if not m_ or m_.group(1).isupper():
        return None
    return f'{m_.group(1)} × {m_.group(3)}' if m_.group(2) else f'{m_.group(1)} {m_.group(3)}'


def main(pdf_path, counties_path, out_path):
    counties = [c for c in json.load(open(counties_path)) if c['fips'] // 1000 == ARKANSAS]
    pages = []
    spots = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            found = list(maps_on(page))
            if not found:
                continue
            words = page.extract_words(extra_attrs=['fontname'])
            entries = []
            for m, dots in found:
                entries.append((name_under(page, words, m), dots))
                for x, y in dots:
                    k = (round(x, 1), round(y, 1))
                    spots[k] = spots.get(k, 0) + 1
            pages.append((page.page_number, entries))

    # The county spots: dot positions, the most used first, a nearby one joining it.
    centers = []
    for (x, y), n in sorted(spots.items(), key=lambda kv: -kv[1]):
        near = [c for c in centers if (c[0] - x) ** 2 + (c[1] - y) ** 2 <= SAME_SPOT ** 2]
        if not near:
            centers.append([x, y, n])
    if len(centers) != len(counties):
        sys.exit(f'{len(centers)} dot spots, not one per county ({len(counties)}): the maps changed?')

    # Match spots to counties: an affine map from lon/lat (lon scaled for latitude) to map points, refined
    # with a one-to-one assignment until it settles.
    lat0 = np.radians(np.mean([c['lat'] for c in counties]))
    G = np.array([[c['lon'] * np.cos(lat0), c['lat']] for c in counties])
    P = np.array([[c[0], c[1]] for c in centers])

    def fit(src, dst):
        A = np.hstack([src, np.ones((len(src), 1))])
        M, *_ = np.linalg.lstsq(A, dst, rcond=None)
        return M

    corners_g = np.array([[G[:, 0].min(), G[:, 1].max()], [G[:, 0].max(), G[:, 1].min()], [G[:, 0].min(), G[:, 1].min()]])
    corners_p = np.array([[P[:, 0].min(), P[:, 1].min()], [P[:, 0].max(), P[:, 1].max()], [P[:, 0].min(), P[:, 1].max()]])
    M = fit(corners_g, corners_p)
    for _ in range(10):
        Q = np.hstack([G, np.ones((len(G), 1))]) @ M
        rows, cols = linear_sum_assignment(((Q[:, None, :] - P[None, :, :]) ** 2).sum(-1))
        M = fit(G[rows], P[cols])
    Q = np.hstack([G, np.ones((len(G), 1))]) @ M
    err = np.sqrt(((Q[rows] - P[cols]) ** 2).sum(-1))
    if err.max() > MAX_FIT:
        sys.exit(f'county spots fit their counties only to within {err.max():.1f} points: not trusted')
    spot_fips = {cols[i]: counties[rows[i]]['fips'] for i in range(len(rows))}

    def county_at(x, y):
        d = [(cx - x) ** 2 + (cy - y) ** 2 for cx, cy, _ in centers]
        i = int(np.argmin(d))
        return spot_fips[i] if d[i] <= SAME_SPOT ** 2 else None

    out, unnamed, stray = {}, 0, 0
    for _, entries in pages:
        for name, dots in entries:
            if not name:
                unnamed += 1
                continue
            got = set(out.get(name, []))
            for x, y in dots:
                f = county_at(x, y)
                if f is None:
                    stray += 1
                else:
                    got.add(f)
            out[name] = sorted(got)
    if stray:
        sys.exit(f'{stray} dots not on any county spot: not trusted')
    json.dump(out, open(out_path, 'w'), indent=0, sort_keys=True)
    print(f'{len(out)} species from {sum(len(e) for _, e in pages)} maps ({unnamed} without a name read); '
          f'county fit within {err.max():.1f} pt (mean {err.mean():.1f}) → {out_path}')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
