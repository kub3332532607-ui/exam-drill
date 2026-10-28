#!/usr/bin/env python3
"""以既有已分類題目做字元 bigram TF-IDF 最近鄰，替新題目建議 科目:節。輸出審閱用文字檔。"""
import json, re, math, sys
from collections import Counter

ex = json.load(open('/tmp/claude-0/existing.json'))
d = json.load(open('/tmp/claude-0/clean.json'))

def grams(t):
    t = re.sub(r'[\s，。、；：？！「」（）()0-9A-Za-z]', '', t)
    return Counter(t[i:i+2] for i in range(len(t) - 1))

df = Counter()
docs = []
for e in ex:
    g = grams(e['t']); docs.append(g); df.update(g.keys())
N = len(docs)
idf = {k: math.log(N / (1 + v)) + 1 for k, v in df.items()}
def vec(g):
    v = {k: c * idf.get(k, math.log(N)) for k, c in g.items()}
    n = math.sqrt(sum(x * x for x in v.values())) or 1
    return {k: x / n for k, x in v.items()}
V = [vec(g) for g in docs]

def isEng(q):
    t = q['q'] + ''.join(q['o'])
    return len(re.findall(r'[一-鿿]', t)) < 3

res = {}
lines = []
for code, v in d.items():
    lines.append(f'##### {code} {v["file"]} 備註:{v["note"]}')
    for q in v['questions']:
        if isEng(q):
            res[f'{code}#{q["no"]}'] = 'eng'
            continue
        qv = vec(grams(q['q'] + ' ' + ' '.join(q['o'])))
        sims = []
        for i, w in enumerate(V):
            s = sum(x * w.get(k, 0) for k, x in qv.items())
            sims.append((s, i))
        sims.sort(reverse=True)
        votes = Counter()
        for s, i in sims[:5]: votes[ex[i]['s'] + ':' + ex[i]['sec']] += s
        sug = votes.most_common(1)[0][0]
        res[f'{code}#{q["no"]}'] = sug
        L = 'ABCD'
        a = q['a']; al = L[a] if isinstance(a, int) else ''.join(L[x] for x in a)
        opts = ' '.join(f'{L[k]}){o}' for k, o in enumerate(q['o']))
        lines.append(f'{q["no"]}[{al}]<{sug}> {q["q"]} || {opts}')
json.dump(res, open('/tmp/claude-0/suggest.json', 'w'), ensure_ascii=False)
open('/tmp/claude-0/review.txt', 'w').write('\n'.join(lines))
print(len(res), sum(1 for x in res.values() if x == 'eng'))
