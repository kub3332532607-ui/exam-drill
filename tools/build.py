#!/usr/bin/env python3
"""把 clean.json + suggest.json + fix.txt 組成各科 KS.add 區塊（JSON 一行一份考卷）。"""
import json, re, sys
from collections import defaultdict

d = json.load(open('/tmp/claude-0/clean.json'))
sug = json.load(open('/tmp/claude-0/suggest.json'))
fix = {}
for l in open('/tmp/claude-0/fix.txt', encoding='utf-8'):
    p = l.split()
    if len(p) == 3: fix[f'{p[0]}#{p[1]}'] = p[2]
SKIP_EASY = {'114140_0613#7', '114040_0309#1'}

SHORT = {
 '113040_0308': '113 身障五等', '113120_0310': '113 調查三等', '113140_0605': '113 民航三等', '113140_0611': '113 原民五等',
 '113170_0102': '113 警正升官等', '113200_0105': '113 離島三等', '113200_0106': '113 離島四等', '113200_0205': '113 地特三等', '113200_0206': '113 地特四等',
 '114010_0202': '114 初等', '114040_0103': '114 身障三等', '114040_0104': '114 身障四等', '114040_0305': '114 關務三等', '114040_0306': '114 關務四等', '114040_0309': '114 身障五等',
 '114060_0204': '114 移民四等', '114060_0503': '114 警察三等', '114060_0504': '114 國安三等', '114060_0506': '114 警察四等', '114060_0508': '114 國安五等',
 '114080_0401': '114 高考三級', '114080_0402': '114 普考',
 '114120_0204': '114 司法四等', '114120_0309': '114 司法三等', '114120_0310': '114 調查三等', '114120_0312': '114 司法五等',
 '114140_0607': '114 民航三等', '114140_0613': '114 原民五等', '114160_0105': '114 升官等薦任', '114160_0404': '114 關務升官等',
 '114190_0105': '114 離島三等', '114190_0106': '114 離島四等', '114190_0205': '114 地特三等', '114190_0206': '114 地特四等',
 '115040_0305': '115 關務三等', '115060_0204': '115 移民四等', '115060_0503': '115 警察三等', '115060_0504': '115 國安三等',
 '115120_0204': '115 司法四等', '115120_0312': '115 司法三等', '115120_0313': '115 調查三等', '115120_0315': '115 司法五等', '115140_0607': '115 民航三等',
}
TITLE = {
 '113040': '113年特種考試關務、身心障礙人員考試', '113120': '113年特種考試司法人員、調查人員及海岸巡防人員考試',
 '113140': '113年特種考試外交、民航人員及原住民族考試', '113170': '113年警察人員升官等考試', '113200': '113年特種考試地方政府公務人員考試',
 '114010': '114年公務人員初等考試', '114040': '114年特種考試關務、身心障礙人員考試',
 '114060': '114年特種考試警察人員、一般警察人員、國家安全情報人員、移民行政人員及退除役軍人轉任考試',
 '114080': '114年公務人員高等考試三級考試暨普通考試', '114120': '114年特種考試司法人員、調查人員及海岸巡防人員考試',
 '114140': '114年特種考試外交、民航人員及原住民族考試', '114160': '114年公務人員、關務人員升官等考試', '114190': '114年特種考試地方政府公務人員考試',
 '115040': '115年特種考試關務、身心障礙人員考試', '115060': '115年特種考試警察人員、一般警察人員、國家安全情報人員及移民行政人員考試',
 '115120': '115年特種考試司法人員、調查人員及海岸巡防人員考試', '115140': '115年特種考試外交、民航人員及原住民族考試',
}
SUBNAME = {'con': '憲法', 'jur': '法學緒論', 'alaw': '行政法', 'eng': '英文'}
L = 'ABCD'

def subj_short(fname):
    s = fname.split('_', 2)[2].replace('.txt', '')
    s = re.split(r'[（(]', s)[0]
    return s

def clean_text(s):
    s = re.sub(r'\s*\d{5}-\d{5}\s*$', '', s)
    return s.strip()

STEMFIX = {
 '113200_0106#4': '_____ can result from a diet that is rich in fat and sugar.',
 '115060_0503#31': 'The preservation of the natural ecology requires collective action to combat pollution and promote _____ practices.',
 '115060_0504#31': 'The preservation of the natural ecology requires collective action to combat pollution and promote _____ practices.',
}

def zh(s):
    return len(re.findall(r'[一-鿿]', s)) >= 3

out = defaultdict(list)
stats = defaultdict(int)
for code in sorted(d):
    v = d[code]
    total = len(v['questions'])
    note_all = v['note']
    per = defaultdict(list)
    for q in v['questions']:
        key = f'{code}#{q["no"]}'
        cls = fix.get(key, sug.get(key))
        if cls == 'x' or key in SKIP_EASY: stats['skip'] += 1; continue
        qq = {'no': q['no']}
        stem = q['q']
        if zh(stem):
            stem = stem.replace(' _____ ', '').replace('_____', '')
        if key in STEMFIX: stem = STEMFIX[key]
        qq['q'] = clean_text(stem)
        qq['o'] = [clean_text(o) for o in q['o']]
        if zh(qq['q'] + ''.join(qq['o'])):
            qq['q'] = re.sub(r'\s{3,}', '', qq['q']); qq['o'] = [re.sub(r'\s{3,}', '', o) for o in qq['o']]
        a = q['a']
        if isinstance(a, list) and len(a) == 4:
            m = re.search(r'第%d題答(.+?)(?:者均給分|給分)' % q['no'], note_all)
            if not m:
                print('!! 無法處理均給分', key, note_all, file=sys.stderr); a = [0, 1, 2, 3]; note = '本題一律給分'
            else:
                letters = [x for x in m.group(1).split('或') if len(x) == 1 and x in L]
                if len(letters) == 1:
                    a = L.index(letters[0]); note = f'考選部更正答案為{letters[0]}'
                else:
                    a = [L.index(x) for x in letters]; note = '本題' + '或'.join(letters) + '均給分'
            qq['note'] = note
        qq['a'] = a
        if cls == 'eng':
            if q.get('g'): qq['g'] = q['g']
            per['eng'].append(qq)
        else:
            s, sec = cls.split(':')
            qq['ch'] = sec.split('s')[0]
            qq['sec'] = sec
            per[s].append(qq)
    for s, qs in per.items():
        e = {'id': f'{code}-{s}-{SUBNAME[s]}', 'subject': s, 'short': SHORT[code], 'title': TITLE[code[:6]],
             'name': f'{subj_short(v["file"])}｜{SUBNAME[s]}', 'perScore': None, 'questions': qs}
        if s == 'eng':
            used = sorted({q['g'] for q in qs if q.get('g')})
            if used: e['passages'] = {str(g): v['passages'][str(g)] for g in used}
        e['part'] = f'選錄 {len(qs)} 題（原卷 {total} 題）'
        out[s].append(e)
        stats[s] += len(qs)
json.dump(out, open('/tmp/claude-0/built.json', 'w'), ensure_ascii=False)
print(dict(stats), {s: len(v) for s, v in out.items()})
