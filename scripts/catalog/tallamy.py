# Shropshire & Tallamy (2025), "Lepidoptera of North America, north of
# Mexico" (ZooKeys 1261; CC0, https://zenodo.org/records/17747343), as an
# index by host plant genus:
#   python3 -I scripts/catalog/tallamy.py <the .xlsx> <genera.json>
# For each genus: how many native caterpillar species are recorded on it,
# how many of those live in Arkansas, and the butterflies among them by name.
# Only established ranges count (strays are a column of their own), and only
# host genera the authors resolved ("[unresolved]" is left out).
import json
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
for r in rows:
    get = lambda h: (r[col[h]] if col[h] < len(r) else None) or ''
    hosts = str(get('HOST_GENERA')).strip()
    if not hosts or hosts == 'NULL' or str(get('EXOTIC_STATUS')).strip().lower() != 'native':
        continue
    # The binomial without its authority ("Papilio glaucus Linnaeus, 1758"); the common name's first spelling.
    m = re.match(r'\s*([A-Z][a-z]+ [a-z][a-z-]+)', str(get('SPECIES_COMPLETE_BINOMIAL_NOMENCLATURE')))
    name = m.group(1) if m else ''
    common = str(get('LEP_COMMON_NAME')).split(',')[0].strip()
    common = '' if common in ('X', 'x') else common
    states = set(str(get('RANGE _STATE_&_PROVINCE')).split())
    butterfly = str(get('HIGHER_CATEGORY')).strip() == 'Butterfly'
    gs = {tok.split('[')[0] for tok in re.findall(r'[A-Z][a-z]+(?:\[[^\]]*\])?', hosts)
          if not any(x in tok for x in ('[unresolved', '[Algae', '[Lichen', '[Fung'))}
    for g in sorted(gs):
        e = genera.setdefault(g, {'species': 0, 'ar': 0, 'ar_butterflies': []})
        e['species'] += 1
        if 'AR' in states:
            e['ar'] += 1
            if butterfly and common and name:
                e['ar_butterflies'].append(f'{common} ({name})')

for e in genera.values():
    e['ar_butterflies'].sort()
with open(out, 'w') as f:
    json.dump({'source': 'Shropshire & Tallamy 2025, ZooKeys 1261, CC0', 'genera': genera}, f, indent=0, sort_keys=True)
print(f'{len(genera)} host genera -> {out}')
