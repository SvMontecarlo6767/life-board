#!/usr/bin/env python3
"""Erzeugt rules/v1.json aus tools/e_rows.json (geparste Teil-E-Tabelle des Planungsdokuments).
Aufruf: python3 tools/build_rules.py"""
import json, re, math, html, os
here = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(here, 'e_rows.json')))

CATS = [  # (Präfix, Name) in Reihenfolge des Dokuments; SOZ/KRE/FIN absichtlich nicht vorhanden
 ('MOR','Morgenroutine'),('SLP','Schlaf'),('REC','Recovery'),('STR','Strain-Logik'),
 ('SPK','Sport: Krafttraining'),('ISO','Sport: Isometrie und Waden'),('SPS','Sport: Sprint und Schnelligkeit'),
 ('SPA','Sport: Ausdauer und Laufen'),('SPB','Sport: Spinning-Bike'),('SPU','Sport: Schulsport und weitere Bewegung'),
 ('SPP','PRs und Bestzeiten'),('MOB','Mobilität und Regeneration'),('ERN','Ernährung'),('ALK','Alkohol'),
 ('LRN','Lernen'),('WDH','Wiederholen und Quiz'),('LES','Lesen'),('HND','Handyzeit'),('PUZ','Puzzles'),
 ('ABD','Abendritual'),('FOK','Fokus und Pausen'),('ORD','Ordnung und Haushalt'),
 ('GES','Gesundheit und Körper'),('PLN','Planung und Reflexion'),('SON','Sonstiges und Modi')]
REMOVED_CATS = {'SOZ':'Sozial','KRE':'Kreatives und Projekte','FIN':'Finanzen'}
SPORT = ['SPK','ISO','SPS','SPA','SPB','SPU']   # Kategorien, auf die Sport-Multiplikatoren (STR-xx) wirken

SRC = {'Tap':'tap','Whoop auto':'whoop','Kurzbefehl':'shortcut','Kurzbefehl (Tap als Ersatz)':'shortcut',
       'Whoop + Tap':'whoop+tap','Notion':'notion','Notion + Tap':'notion+tap'}

def clean(t):
    t = html.unescape(t).replace('\\[','[').replace('\\]',']').replace('\\','')
    t = t.replace(' ',' ').strip()
    return re.sub(r'\s+',' ',t)

def pts(raw):
    s = raw.replace('−','-').replace('+','').strip()
    if re.fullmatch(r'-?[\d.]+', s): return int(s.replace('.',''))
    return None

MAX_EXPL = {'ERN-02':3,'ERN-03':3,'ERN-19':3,'SON-10':2}
MAX_ASSUMED = {'MOB-13':6,'WDH-03':20,'WDH-04':20,'WDH-05':20}   # im Dokument ohne Maximum -> vorläufig, markiert
MODS = {'STR-07':('mult',0.6),'STR-08':('mult',0.3),'STR-09':('cap',0.5),'STR-10':('mult',0.7),'STR-11':('override',1.0)}
MODE = {'GES-09':'sick','GES-10':'injury','SON-01':'travel'}

def period(i, text):
    t = text
    if re.match(r'^(Woche(?!nend)|Schlafwochen|Wochenumfang|Wochenmix|Wochenplanung|Wochenrückblick|Strafkasse: Woche)', t): return 'week'
    if i in ('SPK-18','GES-08'): return 'week'
    if re.match(r'^(Monat|Monatsziele)', t) or 'monatlich' in t: return 'month'
    return None

actions=[]; removed=[]
for r in rows:
    pre = r['id'][:3]
    if pre in REMOVED_CATS: removed.append((r['id'],'Kategorie '+REMOVED_CATS[pre])); continue
    if r['urteil'].strip().lower() in ('ne','n','✗','x'): removed.append((r['id'],'Dein Urteil: '+r['urteil'])); continue
    text = clean(r['text']); group=None
    m = re.match(r'^\[([^\]]+)\]\s*(.*)$', text)
    if m:
        tag, text = m.group(1), m.group(2)
        if tag.startswith('Stufe'): group='ALK:Stufe'; text = tag+': '+text
        else: group = pre+':'+tag
    a = {'id':r['id'],'cat':pre,'text':text}
    p = pts(r['pts_raw'])
    if r['id']=='PUZ-01':
        a.update(points=None, kind='puzzle', text='Puzzle-Tracker (Tageswert 1:1 aus dem Tracker)')
    else:
        a['points']=p
    a['capture']=r['cap']; a['src']=SRC[r['cap']]
    if group: a['group']=group
    per = period(r['id'], text)
    if per: a['period']=per
    if r['id'] in MAX_EXPL: a['max']=MAX_EXPL[r['id']]
    elif r['id'] in MAX_ASSUMED: a['max']=MAX_ASSUMED[r['id']]; a['maxAssumed']=True
    if r['id']=='MOB-13': a['unit']='pro 10 Min'
    if r['id'] in MODS: a['kind']='modifier'; a['mod']={'type':MODS[r['id']][0],'factor':MODS[r['id']][1]}
    if r['id'] in MODE: a['kind']='mode'; a['mode']=MODE[r['id']]
    if r['id']=='SPP-17': a['kind']='rule'; a['rule']={'prMaxPerDay':2}
    actions.append(a)

# Level-Kurve
def f(n): return 1.025+0.475*0.81**(n-3)
c=[0,0,6000,9000]; 
for n in range(4,101): c.append(c[-1]*f(n))
costs=[round(x) for x in c[1:]]      # Index 0 = Level 1 (Start, 0)
cum=[]; s=0
for x in c[1:]:
    s+=x; cum.append(round(s))
rules = {
 'version':1, 'name':'Regelwerk v1', 'created':'2026-10-15',
 'source':'Planungsdokument "Life Board – Vorbereitung für morgen früh" (14.10.2026), Teil E (Dein Urteil angewandt) und Teil F',
 'day':{'timezone':'Europe/Berlin','changeHour':4},
 'dopamine':{'dailyCap':None,'note':'Kein Tagesdeckel; nur Maxima pro Aktion.'},
 'ranks':[{'id':'S','min':18000},{'id':'A','min':11000},{'id':'B','min':5000},{'id':'C','min':None}],
 'level':{'formula':'c(2)=6000, c(3)=9000, c(n)=c(n-1)*f(n), f(n)=1.025+0.475*0.81^(n-3)',
          'maxLevel':100,'costs':costs,'cumulative':cum,
          'note':'costs[n-1] = Kosten, um von Level n-1 auf n zu kommen (Level 1 = Start = 0); cumulative[n-1] = Dopamin-Summe bis Level n.'},
 'streak':{'formula':'M(n)=1+0.5*(1-exp(-n/12))','maxBonus':0.5,'tau':12,
           'habits':['Schlafziel','Sport','Lernen','Handy unter Limit','Tagesabschluss'],
           'milestones':{'7':1000,'14':2000,'30':5000,'60':10000,'100':16000,'200':30000,'365':60000},
           'onBreak':'halve','sickPauses':True,'phase':5},
 'drops':{'chance':0.18,'maxPerDay':2,'pityDays':7,'tiers':[{'id':'klein','weight':0.60,'value':100},{'id':'mittel','weight':0.28,'value':300},
          {'id':'selten','weight':0.10,'value':700},{'id':'episch','weight':0.02,'value':1800}],
          'triggers':['Training','Lernblock','Wiederholungsrunde','Tagesabschluss','Streak-Meilenstein'],'phase':5},
 'levelLoss':{'maxDailyDropShareOfLevelCost':0.40,'graceDays':3,'maxLevelsPerDay':1,'checkpointEvery':10,'sickPauses':True,'phase':5},
 'inflation':{'prLimitPerWeekPerExercise':1,'prMaxPerDay':2,'recalibrateEveryWeeks':8,'recalibrateIfAvgAbove':12000,'habitGraduationFactor':0.5},
 'sport':{'categories':SPORT,'note':'Multiplikatoren (kind=modifier) wirken auf die positiven Punkte dieser Kategorien.'},
 'categories':[{'id':p,'name':n} for p,n in CATS],
 'actions':actions,
}
out=os.path.join(here,'..','rules','v1.json')
json.dump(rules, open(out,'w'), ensure_ascii=False, indent=1)
json.dump(removed, open(os.path.join(here,'removed.json'),'w'), ensure_ascii=False)
print(len(actions),'Aktionen,',len(removed),'entfernt')
