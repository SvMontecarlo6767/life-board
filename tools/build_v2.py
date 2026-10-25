#!/usr/bin/env python3
"""Erzeugt rules/v2.json: gleiche Punkte wie v1, aber mit Oberfläche aus tools/buttons_v2.json
(höchstens 30 Tipp-Knöpfe) und Whoop-Automatik. v1.json bleibt unverändert."""
import json, os
here=os.path.dirname(os.path.abspath(__file__))
v1=json.load(open(os.path.join(here,'..','rules','v1.json')))
cfg=json.load(open(os.path.join(here,'buttons_v2.json')))
ids={a['id'] for a in v1['actions']}
manual=set()
for b in cfg['buttons']:
    for i in b.get('ids',[]): manual.add(i)
    for t in b.get('tiers',[]): manual.update(t['ids'])
    for o in b.get('options',[]): manual.update(o['ids'])
auto=set(cfg['autoIds']); close=set(cfg['closeIds'])
missing=(manual|auto|close)-ids
assert not missing, missing
assert len(cfg['buttons'])<=30
v2=dict(v1)
v2.update(version=2,name='Regelwerk v2',created='2026-10-15',
  source='v1 (Punkte unverändert) + Oberfläche mit höchstens 30 Tipp-Knöpfen, Whoop-Automatik für Schlaf/Recovery/Strain/Workouts',
  ui={'groups':cfg['groups'],'buttons':cfg['buttons'],'maxButtons':30})
acts=[]
for a in v1['actions']:
    a=dict(a)
    if a['id'] in manual: a['use']='button'
    elif a['id'] in auto: a['use']='whoop'
    elif a['id'] in close: a['use']='abschluss'
    elif a['id']=='PUZ-01': a['use']='puzzle'
    else: a['use']='inaktiv'
    if a['id'] in ('WDH-01','WDH-13'): a['max']=3   # bis zu 3 volle Lernrunden pro Tag (Lernen-Seite)
    acts.append(a)
# Check-in (checkin.html): Stimmung, Gedanken, 3 gute Dinge – kommen als Zähler wie die Lernrunden
MEN=[
  {'id':'MEN-01','cat':'MEN','text':'Morgen-Check (Stimmung und Energie vor dem Blick auf Whoop)','points':400},
  {'id':'MEN-02','cat':'MEN','text':'Abend-Check mit 3 guten Dingen','points':500},
  {'id':'MEN-03','cat':'MEN','text':'Stimmung oder Gedanke über den Tag notiert','points':100,'max':3},
  {'id':'MEN-04','cat':'MEN','text':'Eigene Tracker ausgefüllt','points':150},
  {'id':'MEN-05','cat':'MEN','text':'Alle Tagesziele erreicht','points':300},
]
for a in MEN: acts.append(dict(a,capture='Check-in',src='checkin',use='checkin'))
v2['categories']=v1['categories']+[{'id':'MEN','name':'Mental und Check-in'}]
v2['actions']=acts
v2['whoopAuto']={'ids':cfg['autoIds'],'finalIds':cfg['finalIds'],'note':'finalIds zählen erst, wenn der Tag vorbei oder abgeschlossen ist.'}
json.dump(v2,open(os.path.join(here,'..','rules','v2.json'),'w'),ensure_ascii=False,indent=1)
from collections import Counter
print(len(cfg['buttons']),'Knöpfe;',Counter(a['use'] for a in acts))
