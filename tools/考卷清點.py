#!/usr/bin/env python3
"""考卷清點：掃描考選部「考畢題答」zip，列出法學／憲法／英文相關考卷，
並與刷題本（exam-drill）已收的考卷比對，再對照年度應有清單找出缺漏。

用法：python3 -I 考卷清點.py <zip資料夾> [exam-drill 資料夾]
"""
import sys, re, glob, zipfile, html, os
from collections import defaultdict

KEY = re.compile(r'法學|憲法|英文|法政')
# 每年應有的考試（類科：要有的部分）。法＝憲法／法緒等法學題；英＝英文。可依需要增修。
CHECK = [
    ('初等', '法英', r'初等'),
    ('關務三等', '法', r'關務三等'), ('關務四等', '法英', r'關務四等'),
    ('身障三等', '法', r'身障三等'), ('身障四等', '法', r'身障四等'), ('身障五等', '法', r'身障五等'),
    ('警察三等', '法英', r'警察人員考試三等|警察三等'), ('警察四等', '法', r'警察人員考試四等|警察四等'),
    ('國安三等', '法英', r'國家安全情報人員考試三等|國安三等'), ('國安五等', '法', r'國家安全情報人員考試五等|國安五等'),
    ('移民三等', '法英', r'移民行政人員考試三等|移民三等'), ('移民四等', '法英', r'移民行政人員考試四等|移民四等'),
    ('高考三級', '法英', r'高考三級'), ('普考', '法英', r'普通考試|普考'),
    ('司法三等', '法英', r'司法三等'), ('司法四等', '法英', r'司法四等'), ('司法五等', '法', r'司法五等'),
    ('調查三等', '法英', r'調查(人員)?三等'), ('民航三等', '法', r'民航'),
    ('原民三等', '法英', r'原住民族考試三等|原民三等'), ('原民四等', '法英', r'原住民族考試四等|原民四等'),
    ('原民五等', '法英', r'原住民族考試五等|原民五等'),
    ('升官等薦任', '法英', r'升官等公務薦任|薦任'), ('警察升官等警正', '法英', r'警正'),
    ('地特三等', '法英', r'地方政府公務人員(考試)?三等|地特三等'), ('地特四等', '法英', r'地方政府公務人員(考試)?四等|地特四等'),
    ('離島三等', '法英', r'離島地區公務人員考試三等|離島三等'), ('離島四等', '法英', r'離島地區公務人員考試四等|離島四等'),
]
# 不一定每年舉辦、或與上面共用同一份卷的：只列出、不算缺
OPTIONAL = r'退除役|海巡|郵政|關務薦任'

# 共用同一份卷、刷題本只記一個名稱的情形：(類科, 同卷的類科)。'*'＝每年。
SHARE = {'*': [('移民三等', '警察三等')],
         '113': [('國安三等', '警察三等')]}   # 113 國安三等英文與警察三等相同

def kinds(subj):
    k = ''
    if re.search(r'法學|憲法|法政', subj): k += '法'
    if '英文' in subj: k += '英'
    return k

def zname(i):
    n = i.filename
    if not i.flag_bits & 0x800:
        try: n = n.encode('cp437').decode('cp950')
        except Exception: pass
    return n

def parse(zpath):
    z = zipfile.ZipFile(zpath)
    names = {os.path.basename(zname(i)): i for i in z.infolist()}
    out = []
    for base, info in names.items():
        if not base.endswith('.html'): continue
        b = z.read(info)
        t = b.decode('utf-8', 'replace')
        exam = cat = None
        # 依序讀：考試名稱（level1）→ 類科（level2）→ 科目列（科目名稱＋試題／答案連結）
        for m in re.finditer(r"(<tr><td class='level1'.*?</tr>)|(<tr><td class='level2'.*?</tr>)|<td><div>([^<]+)</div></td>(.*?)</tr>", t, re.S):
            if m.group(1): exam = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip(); continue
            if m.group(2): cat = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip(); continue
            subj = html.unescape(m.group(3)).strip()
            hrefs = re.findall(r"href='([^']+)'", m.group(4))
            q = [h for h in hrefs if re.match(r'\d{6}_\d{4}_', h)]
            a = [h for h in hrefs if '_ANS' in h]
            mod = [h for h in hrefs if '_MOD' in h]
            if not q: continue
            code = q[0][:11]
            out.append(dict(zip=os.path.basename(zpath), exam=exam, cat=cat, subj=subj, code=code,
                            has_q=q[0] in names, has_a=bool(a) and a[0] in names,
                            has_mod=bool(mod) and mod[0] in names, need_mod=bool(mod)))
    return out

def done_info(repo):
    """回傳 {代碼: (簡稱, 部分)}，部分：con/jur/alaw＝法、eng＝英。"""
    d = {}
    for f in glob.glob(os.path.join(repo, 'data', '*.js')):
        t = open(f, encoding='utf-8').read()
        for m in re.finditer(r'"id":\s*"(\d{6}_\d{4})-?([a-z]*)[^"]*"(.{0,300})', t, re.S):
            sh = re.search(r'"short":\s*"([^"]*)"', m.group(3))
            k = '英' if m.group(2) == 'eng' else ('法' if m.group(2) in ('con', 'jur', 'alaw') else '')
            old = d.get(m.group(1), ('', ''))
            d[m.group(1)] = (old[0] or (sh.group(1) if sh else ''), ''.join(sorted(set(old[1] + k))))
    return d

def main():
    folder = sys.argv[1]
    repo = sys.argv[2] if len(sys.argv) > 2 else None
    info = done_info(repo) if repo else {}
    done = {c for c, v in info.items() if v[1]}
    zips = sorted(glob.glob(os.path.join(folder, '*.zip')),
                  key=lambda f: int(re.search(r'\((\d+)\)', f).group(1)) if '(' in f else -1)
    papers = defaultdict(list)
    for z in zips:
        for r in parse(z):
            if KEY.search(r['subj']): papers[r['code']].append(r)
    allcodes = set(papers) | done
    for yr in sorted({c[:3] for c in allcodes}):
        print(f'\n===== {yr} 年 =====')
        for c in sorted(x for x in allcodes if x.startswith(yr)):
            rs = papers.get(c, [])
            st = '已收' if c in done else ('新' if rs else '')
            if rs:
                r = rs[0]
                miss = []
                if not r['has_q']: miss.append('缺試題')
                if not r['has_a']: miss.append('缺答案')
                if r['need_mod'] and not r['has_mod']: miss.append('缺更正')
                cats = '、'.join(sorted({x['cat'] for x in rs}))
                zs = '、'.join(sorted({x['zip'].replace('考畢題答', '').replace('.zip', '') or '(無編號)' for x in rs}))
                print(f'[{st}] {c} {r["subj"][:14]}｜{cats}｜zip{zs} {" ".join(miss)}')
            else:
                print(f'[{st}] {c}（只在刷題本，不在這批 zip）')
        got = defaultdict(set)   # 類科 → 已有的部分
        for c in allcodes:
            if not c.startswith(yr): continue
            names = [(x['cat'], kinds(x['subj'])) for x in papers.get(c, [])]
            if c in info and info[c][0]: names.append((info[c][0], info[c][1]))
            for nm, k in names:
                for lab, need, rx in CHECK:
                    if re.search(rx, nm): got[lab] |= set(k)
        for a, b in SHARE.get('*', []) + SHARE.get(yr, []):
            if not got[a] - set('x') and got[b]: got[a] |= got[b]; print(f'  （{a}視為與{b}同卷）')
            elif got[b]: got[a] |= got[b] & set('英')
        lack = []
        for lab, need, rx in CHECK:
            miss = ''.join(x for x in need if x not in got[lab])
            if miss: lack.append(f'{lab}（缺{"、".join("法學" if x == "法" else "英文" for x in miss)}）')
        print('  ▶ 未見：' + ('、'.join(lack) if lack else '無'))

if __name__ == '__main__':
    main()
