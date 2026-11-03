#!/usr/bin/env python3
"""Checks SF prerequisites (Wege der Helden, 4.1) for all blocks in umwandeln.py."""
import importlib.util, re, sys
import yaml  # PyYAML
spec = importlib.util.spec_from_file_location('u', 'tools/nsc-umwandlung/umwandeln.py'); u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)

R = lambda x: int(x + 0.5)
def basis(a):
    return dict(AT=R((a['MU']+a['GE']+a['KK'])/5), PA=R((a['IN']+a['GE']+a['KK'])/5), INI=R((2*a['MU']+a['IN']+a['GE'])/5))
# name -> (attribute minimums, base minimums, required SF, required talents)
RULES = {
 'Klingentänzer': ({'GE':15},{},['Kampfgespür','Klingensturm','Klingenwand'],{}),
 'Todesstoß': ({'MU':15},{},['Gezielter Stich'],{}), 'Gezielter Stich': ({},{},['Finte'],{}),
 'Hammerschlag': ({'MU':15},{},['Niederwerfen'],{}), 'Meisterparade': ({},{'PA':8},[],{}),
 'Kampfreflexe': ({},{'INI':10},[],{}), 'Beidhändiger Kampf I': ({'GE':12},{},['Linkhand'],{}),
 'Niederwerfen': ({},{},['Wuchtschlag'],{}), 'Wuchtschlag': ({'KK':12},{},[],{}), 'Ausweichen I': ({'GE':10},{},[],{}),
 'Ausweichen II': ({'GE':12},{},['Ausweichen I','Aufmerksamkeit'],{}), 'Rüstungsgewöhnung I': ({'KK':10},{},[],{}),
 'Rüstungsgewöhnung II': ({'KK':12},{},['Rüstungsgewöhnung I'],{}), 'Entwaffnen': ({'KK':12},{},['Binden'],{}),
 'Binden': ({'IN':12,'GE':12},{},[],{}), 'Parierwaffen I': ({'GE':12},{},['Linkhand'],{}), 'Finte': ({'GE':12},{},[],{}),
 'Meister der Improvisation': ({'IN':12,'FF':12},{},[],{}), 'Geschützmeister': ({'FF':12},{},[],{'Belagerungswaffen':10,'Mechanik':7}),
 'Kampfgespür': ({'IN':15},{},['Aufmerksamkeit','Kampfreflexe'],{}), 'Aufmerksamkeit': ({'IN':12},{},[],{}), 'Standfest': ({'GE':12},{},[],{}),
 'Klingenwand': ({},{'PA':9},['Defensiver Kampfstil','Kampfreflexe'],{}), 'Klingensturm': ({},{'AT':9},['Ausfall','Kampfreflexe'],{}),
 'Defensiver Kampfstil': ({'GE':12},{},['Meisterparade'],{}), 'Astrale Meditation': ({'IN':13},{},[],{}), 'Druidenrache': ({'MU':15},{},[],{}),
 'Karmalqueste': ({},{},[],{'Götter/Kulte':7}), 'Scharfschütze (Armbrust)': ({},{},[],{'Armbrust':7}), 'Scharfschütze (Bogen)': ({},{},[],{'Bogen':7}),
 'Schnellladen (Armbrust)': ({'FF':12,'KK':12},{},[],{'Armbrust':7}),
}
bad = 0
for name, val in vars(u).items():
    if not name.isupper() or not isinstance(val, str) or 'name:' not in val: continue
    d = yaml.safe_load(val); a = d.get('eigenschaften')
    if not a: continue
    b = basis(a); sfs = [s if isinstance(s, str) else next(iter(s)) for s in d.get('sonderfertigkeiten', [])]; tal = d.get('talente', {})
    for sf in sfs:
        if sf not in RULES: continue
        att, bas, req, tw = RULES[sf]
        miss = [f'{k} {v}' for k, v in att.items() if a[k] < v] + [f'{k}-Basis {v}' for k, v in bas.items() if b[k] < v] \
             + [f'SF {r}' for r in req if r not in sfs] + [f'TaW {k} {v}' for k, v in tw.items() if (tal.get(k) or 0) < v]
        if miss: bad += 1; print(f'✗ {d["name"]}: {sf} braucht {", ".join(miss)}')
print('alle Voraussetzungen erfüllt' if not bad else f'{bad} Verstöße')
