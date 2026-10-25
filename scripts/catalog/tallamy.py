# Shropshire & Tallamy (2025), "Lepidoptera of North America, north of
# Mexico" (ZooKeys 1261; CC0, https://zenodo.org/records/17747343), as an
# index by host plant genus:
#   python3 -I scripts/catalog/tallamy.py <the .xlsx> <genera.json>
# For each genus: how many native caterpillar species are recorded on it, and
# how many of those live in each state or province; and the butterflies among
# them by name, with the states each lives in (scripts/catalog/wild.mjs puts a
# state's own in its file).
# Only established ranges count (strays are a column of their own), and only
# host genera the authors resolved ("[unresolved]" is left out).
import json
import os
import re
import sys

import openpyxl

src, out = sys.argv[1], sys.argv[2]
ws = openpyxl.load_workbook(src, read_only=True).worksheets[0]
rows = ws.iter_rows(values_only=True)
next(rows)  # (the notes above the headers)
head = [str(h or '').strip() for h in next(rows)]
col = {h: i for i, h in enumerate(head) if h}
need = ['LEP_COMMON_NAME', 'SPECIES_COMPLETE_BINOMIAL_NOMENCLATURE', 'RANGE _STATE_&_PROVINCE', 'HOST_GENERA', 'HIGHER_CATEGORY', 'EXOTIC_STATUS']
missing = [h for h in need if h not in col]
if missing:
    sys.exit(f'columns not found: {missing}')

genera = {}
lep_genera = set()
for r in rows:
    get = lambda h: (r[col[h]] if col[h] < len(r) else None) or ''
    hosts = str(get('HOST_GENERA')).strip()
    m0 = re.match(r'\s*([A-Z][a-z]+) [a-z]', str(get('SPECIES_COMPLETE_BINOMIAL_NOMENCLATURE')))
    if m0:
        lep_genera.add(m0.group(1))
    if not hosts or hosts == 'NULL' or str(get('EXOTIC_STATUS')).strip().lower() != 'native':
        continue
    # The binomial without its authority ("Papilio glaucus Linnaeus, 1758"); the common name's first spelling.
    m = re.match(r'\s*([A-Z][a-z]+ [a-z][a-z-]+)', str(get('SPECIES_COMPLETE_BINOMIAL_NOMENCLATURE')))
    name = m.group(1) if m else ''
    common = str(get('LEP_COMMON_NAME')).split(',')[0].strip()
    common = '' if common in ('X', 'x') else common
    states = set(re.split(r'[\s,;]+', str(get('RANGE _STATE_&_PROVINCE'))))
    butterfly = str(get('HIGHER_CATEGORY')).strip() == 'Butterfly'
    gs = {tok.split('[')[0] for tok in re.findall(r'[A-Z][a-z]+(?:\[[^\]]*\])?', hosts)
          if not any(x in tok for x in ('[unresolved', '[Algae', '[Lichen', '[Fung')) and not tok.split('[')[0].endswith('aceae')}
    for g in sorted(gs):
        e = genera.setdefault(g, {'species': 0, 'states': {}, 'butterflies': []})
        e['species'] += 1
        here = sorted(st for st in states if re.fullmatch(r'[A-Z]{2}', st))
        for st in here:
            e['states'][st] = e['states'].get(st, 0) + 1
        if butterfly and common and name and here:
            e['butterflies'].append([f'{common} ({name})', here])

for e in genera.values():
    e['butterflies'].sort()
    e['states'] = dict(sorted(e['states'].items()))
# Sanity, before anything is written: a misread state column would leave Arkansas empty everywhere.
in_ar = sum(1 for e in genera.values() if e['states'].get('AR'))
if not in_ar or len(lep_genera) < 500:
    sys.exit(f'looks misread: {in_ar} host genera with Arkansas records, {len(lep_genera)} caterpillar genera; nothing written')
with open(out + '.tmp', 'w') as f:
    json.dump({'source': 'Shropshire & Tallamy 2025, ZooKeys 1261, CC0', 'genera': genera, 'lep_genera': sorted(lep_genera)}, f, indent=0, sort_keys=True)
os.replace(out + '.tmp', out)
print(f'{len(genera)} host genera ({in_ar} with Arkansas records), {len(lep_genera)} caterpillar genera -> {out}')
