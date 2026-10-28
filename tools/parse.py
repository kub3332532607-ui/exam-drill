#!/usr/bin/env python3
"""把考選部試題 txt（pdftotext -layout）與答案 txt 解析為 JSON。
用法：python3 -I parse.py <pdf-txt資料夾> <代碼...> > out.json
"""
import sys, re, json, os, glob

OPT = ''
FW = str.maketrans('ＡＢＣＤ', 'ABCD')

def cjk(c):
    return '⺀' <= c <= '鿿' or '＀' <= c <= '￯' or c in '，。、；：？！「」（）'

def join(lines):
    out = ''
    for l in lines:
        l = l.strip()
        if not l: continue
        if out and not (cjk(out[-1]) or cjk(l[0])):
            out += ' '
        out += l
    return out

def read_ans(folder, code):
    y, n = code.split('_')
    res = {}
    note = ''
    for kind in ('ANS', 'MOD'):
        fs = glob.glob(os.path.join(folder, f'{y}_{kind}{n}_*.txt'))
        if not fs: continue
        t = open(fs[0], encoding='utf-8').read().translate(FW)
        lines = t.split('\n')
        for i, l in enumerate(lines):
            if l.strip().startswith('題號'):
                nums = [int(x) for x in re.findall(r'第(\d+)題', l)]
                j = i + 1
                while j < len(lines) and not lines[j].strip(): j += 1
                if j < len(lines) and lines[j].strip().startswith('答案'):
                    vals = lines[j].strip()[2:].split()
                    for k, v in zip(nums, vals): res[k] = v
        m = re.search(r'備\s*註[:：](.*)', t, re.S)
        if kind == 'MOD' and m: note = re.sub(r'\s+', '', m.group(1))
        elif kind == 'ANS' and m and not note: note = re.sub(r'\s+', '', m.group(1))
    return res, note

def parse_q(folder, code):
    y, n = code.split('_')
    f = glob.glob(os.path.join(folder, f'{y}_{n}_*.txt'))[0]
    t = open(f, encoding='utf-8').read()
    raw = t.split('\n')
    lines = []
    for l in raw:
        s = l.strip()
        if re.match(r'^(代號|頁次)[:：]', s) or re.match(r'^頁次', s): continue
        if re.match(r'^\d{4,5}$', s): continue
        l = re.sub(r'\s{6,}(代號|頁次)[:：].*$', '', l)
        lines.append(l)
    # 找到第一個有選項符號的題目前的起點
    head = []
    qs = []
    passages = {}
    cur = None
    pending_passage = None
    expect = 1
    i = 0
    buf = []
    def flush():
        if cur is None: return
        txt = cur['raw']
        parts = re.split('([' + OPT + '])', txt)
        stem = parts[0]
        opts = ['', '', '', '']
        for k in range(1, len(parts) - 1, 2):
            opts[OPT.index(parts[k])] += parts[k + 1]
        cur['q'] = stem
        cur['o'] = opts
    for l in lines:
        m = re.match(r'^\s{0,3}(\d{1,2})\s+(\S.*)$', l)
        if m and int(m.group(1)) == expect and (OPT[0] in l or True):
            # 確認後面一定會出現選項：先接受
            flush()
            if cur: qs.append(cur)
            cur = {'no': expect, 'raw_lines': [m.group(2)]}
            expect += 1
            if pending_passage is not None:
                passages[pending_passage[0]] = pending_passage[1]
                cur['g'] = pending_passage[0]
                pending_passage = None
            cur['raw'] = ''
            continue
        pm = re.search(r'請依下文回答第\s*(\d+)\s*題[至到]第?\s*(\d+)\s*題', l)
        if pm:
            flush()
            if cur: qs.append(cur); cur = None
            pending_passage = [int(pm.group(1)), [l.strip()], int(pm.group(2))]
            continue
        if pending_passage is not None:
            pending_passage[1].append(l)
            continue
        if cur is not None:
            cur['raw_lines'].append(l)
    flush()
    if cur: qs.append(cur)
    # 組裝
    out = []
    for q in qs:
        rl = q.pop('raw_lines')
        # 依選項符號切行
        segs = []
        for l in rl:
            pieces = re.split('([' + OPT + '])', l)
            segs.append(pieces)
        stem, opts, which = [], [[], [], [], []], -1
        for pieces in segs:
            first = True
            k = 0
            while k < len(pieces):
                p = pieces[k]
                if len(p) == 1 and p in OPT:
                    which = OPT.index(p); k += 1
                    opts[which].append(pieces[k] if k < len(pieces) else ''); k += 1
                else:
                    (stem if which < 0 else opts[which]).append(p); k += 1
        q['q'] = join(stem)
        q['o'] = [join(o) for o in opts]
        q.pop('raw', None)
        out.append(q)
    # 短文
    ps = {}
    for q in out:
        pass
    return out, f

def passages_of(folder, code):
    y, n = code.split('_')
    f = glob.glob(os.path.join(folder, f'{y}_{n}_*.txt'))[0]
    t = open(f, encoding='utf-8').read()
    res = {}
    for m in re.finditer(r'(請依下文回答第\s*(\d+)\s*題[至到]第?\s*(\d+)\s*題.*?)\n\s{0,3}' , t, re.S):
        pass
    lines = t.split('\n')
    i = 0
    while i < len(lines):
        m = re.search(r'請依下文回答第\s*(\d+)\s*題[至到]第?\s*(\d+)\s*題', lines[i])
        if m:
            st = int(m.group(1))
            body = [lines[i].strip()]
            i += 1
            while i < len(lines) and not re.match(r'^\s{0,3}%d\s+' % st, lines[i]):
                s = lines[i]
                if not (re.match(r'^\s*(代號|頁次)', s.strip()) or re.match(r'^\s*\d{4,5}\s*$', s)):
                    s = re.sub(r'\s{6,}(代號|頁次)[:：].*$', '', s)
                    body.append(s.strip())
                i += 1
            # 段落：空行分段；其餘接起來
            paras, curp = [], []
            for b in body[1:]:
                if not b:
                    if curp: paras.append(join(curp)); curp = []
                else: curp.append(b)
            if curp: paras.append(join(curp))
            res[st] = body[0] + '\n' + '\n'.join(paras)
        else:
            i += 1
    return res

if __name__ == '__main__':
    folder = sys.argv[1]
    allout = {}
    for code in sys.argv[2:]:
        qs, f = parse_q(folder, code)
        ans, note = read_ans(folder, code)
        for q in qs:
            q['ans'] = ans.get(q['no'], '?')
        allout[code] = {'file': os.path.basename(f), 'note': note, 'questions': qs,
                        'passages': passages_of(folder, code)}
    json.dump(allout, sys.stdout, ensure_ascii=False, indent=0)
