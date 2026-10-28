#!/usr/bin/env python3
"""清理 parse.py 的輸出：英文空格補 _____、短文重組段落、題組 g、答案轉 0–3。"""
import sys, re, json, glob, os
sys.path.insert(0, os.path.dirname(__file__))
from parse import join

d = json.load(open(sys.argv[1]))
folder = sys.argv[2]
L = 'ABCD'

def blanks(s):
    s = re.sub(r'(?<=\S)\s{4,}(?=\S)', ' _____ ', s)
    s = re.sub(r'^\s{4,}(?=\S)', '_____ ', s)
    s = re.sub(r'(?<=\S)\s{4,}$', ' _____', s)
    s = s.replace('_____ ,', '_____,').replace('_____ .', '_____.')
    return s

def raw_passages(code):
    y, n = code.split('_')
    f = glob.glob(os.path.join(folder, f'{y}_{n}_*.txt'))[0]
    lines = open(f, encoding='utf-8').read().split('\n')
    res = {}
    i = 0
    while i < len(lines):
        m = re.search(r'請依下文回答第\s*(\d+)\s*題[至到]第?\s*(\d+)\s*題', lines[i])
        if not m: i += 1; continue
        st, en = int(m.group(1)), int(m.group(2))
        head = lines[i].strip().rstrip('：:')
        i += 1
        paras, cur = [], []
        while i < len(lines) and not re.match(r'^\s{0,3}%d\s+' % st, lines[i]):
            s = lines[i]
            if re.match(r'^\s*(代號|頁次)', s) or re.match(r'^\s*\d{4,5}\s*$', s) or not s.strip():
                i += 1; continue
            s = re.sub(r'\s{6,}(代號|頁次)[:：].*$', '', s)
            if re.match(r'^\s{3,}\S', s) and cur:
                paras.append(cur); cur = []
            cur.append(s)
            i += 1
        if cur: paras.append(cur)
        res[st] = (en, head, paras)
    return res

out = {}
for code, v in d.items():
    qs = v['questions']
    rp = raw_passages(code)
    passages = {}
    for st, (en, head, paras) in rp.items():
        cloze = all(len(q['q']) < 3 for q in qs if st <= q['no'] <= en)
        texts = []
        for p in paras:
            line = ' '.join(x.strip() for x in p)
            if not re.search(r'[a-zA-Z]', line):
                line = join(p)
            line = re.sub(r'\s{2,}', ' ', line)
            texts.append(line)
        body = '\n'.join(texts)
        if cloze:
            for n in range(st, en + 1):
                body = re.sub(r'\s*\b%d\b\s*' % n, ' _____ %d ' % n, body, count=1)
            body = re.sub(r' +([.,;:!?’”)])', r'\1', body)
            body = re.sub(r' {2,}', ' ', body)
        passages[str(st)] = head + '\n' + body.strip()
        for q in qs:
            if st <= q['no'] <= en: q['g'] = st
    for q in qs:
        q['q'] = blanks(q['q']).strip()
        q['o'] = [o.strip() for o in q['o']]
        a = q['ans']
        if a in ('#', '＃'): q['a'] = [0, 1, 2, 3]
        elif len(a) == 1 and a in L: q['a'] = L.index(a)
        else: q['a'] = [L.index(c) for c in a if c in L]
    out[code] = dict(v, questions=qs, passages=passages)
json.dump(out, open(sys.argv[3], 'w'), ensure_ascii=False, indent=0)
