// 憲法分階段選題：node tools/stage-con.js        只輸出 tools/憲法階段選題.tsv
//                 node tools/stage-con.js 1      把階段一寫進 data/constitution.js（"st":1）
//                 node tools/stage-con.js 1 2    連題庫精選也寫入（"st":2）
// 選題不用亂數，同樣的資料挑出同樣的題。已有 st 的題會被重設成本次結果。
const fs = require("fs"), vm = require("vm");
const FILE = "data/constitution.js", OUT = "tools/憲法階段選題.tsv";
const CORE = ["111190_0206", "112200_0206", "113080_0113", "114080_0402", "115080_0114"];   // 整份進階段一：111、112 地特四等，113–115 普考
const MOCK = ["113200_0206", "114190_0206"];   // 113、114 地特四等留給模擬考，不標
const HOT = { c1: ["c1s6", "c1s3"], c2: ["c2s4", "c2s1"], c3: ["c3s2"], c4: ["c4s3"], c5: ["c5s1", "c5s3", "c5s4"], c6: ["c6s2", "c6s3"], c7: ["c7s6", "c7s4"], c8: ["c8s2", "c8s1"], c9: ["c9s1"], c10: ["c10s2", "c10s1"], c11: ["c11s2", "c11s1"], c12: ["c12s2", "c12s1"], c13: ["c13s1", "c13s2"], c14: ["c14s1"] };
const HOTN = { c7: 20, c11: 20 };   // 其餘每章 10 題
const BANK = { c1: 35, c2: 35, c3: 10, c4: 25, c5: 45, c6: 15, c7: 70, c8: 40, c9: 35, c10: 40, c11: 30, c12: 25, c13: 25, c14: 35 };

function load(src) { const D = []; vm.runInNewContext(src, { KS: { add: (o) => { if (o.exams) D.push(...o.exams); } } }); return D; }
const src = fs.readFileSync(FILE, "utf8"), exams = load(src);
const isBank = (e) => e.id.indexOf("bank") === 0, real = exams.filter((e) => !isBank(e)), bank = exams.filter(isBank);
const norm = (s) => s.replace(/[\s，。、；：？！「」（）()『』,.;:?!]/g, "");
const grams = (s) => { const a = new Set(), t = norm(s); for (let i = 0; i < t.length - 1; i++) a.add(t.slice(i, i + 2)); return a; };
const sim = (a, b) => { let n = 0; a.forEach((x) => { if (b.has(x)) n++; }); return n / (a.size + b.size - n || 1); };
// 依權重分配 total 題（最大餘數），不超過各項上限；多的往下一項補
function alloc(items, total) {
  const W = items.reduce((s, x) => s + x.w, 0) || 1, r = items.map((x) => { const f = total * x.w / W; return { x, n: Math.min(x.cap, Math.floor(f)), f: f - Math.floor(f) }; });
  let left = total - r.reduce((s, y) => s + y.n, 0);
  r.slice().sort((a, b) => b.f - a.f || b.x.w - a.x.w).forEach((y) => { if (left > 0 && y.n < y.x.cap) { y.n++; left--; } });
  while (left > 0 && r.some((y) => y.n < y.x.cap)) r.slice().sort((a, b) => (b.x.cap - b.n) - (a.x.cap - a.n)).forEach((y) => { if (left > 0 && y.n < y.x.cap) { y.n++; left--; } });
  return r;
}
const pick = {}, rows = [];   // pick["卷id#序號"]＝階段
const key = (e, i) => e.id + "#" + (i + 1), year = (e) => +e.short.slice(0, 3);
function take(e, i, st, why) { pick[key(e, i)] = st; const q = e.questions[i]; rows.push([st, q.ch, q.sec, e.short, q.no, why, q.q.replace(/\s+/g, " ")]); }

// 階段一－1：整份
const seen = [];
real.filter((e) => MOCK.some((m) => e.id.indexOf(m) === 0)).forEach((e) => e.questions.forEach((q) => seen.push(grams(q.q))));
real.filter((e) => CORE.some((m) => e.id.indexOf(m) === 0)).forEach((e) => e.questions.forEach((q, i) => { take(e, i, 1, "地特／普考"); seen.push(grams(q.q)); }));
// 階段一－2：每章熱門節。同等級同科優先、新的優先，和已選題目太像的跳過
const rank = (e) => (/地特四等|司法四等|移民四等/.test(e.short) ? 0 : /四等/.test(e.short) ? 1 : /地特三等|高考三級|司法三等|警察三等/.test(e.short) ? 2 : /三等/.test(e.short) ? 3 : /升官等/.test(e.short) ? 4 : 5) * 10 - year(e);
const papersBySec = {}, dtBySec = {};
real.forEach((e) => e.questions.forEach((q, i) => { (papersBySec[q.sec] = papersBySec[q.sec] || []).push({ e, i, q }); if (/地特四等/.test(e.short)) dtBySec[q.sec] = (dtBySec[q.sec] || 0) + 1; }));
const hotSummary = [];
Object.keys(HOT).forEach((ch) => {
  const a = alloc(HOT[ch].map((s) => ({ s, w: papersBySec[s].length + 5 * (dtBySec[s] || 0), cap: papersBySec[s].length })), HOTN[ch] || 10);
  a.forEach((y) => {
    const c = papersBySec[y.x.s].filter((o) => pick[key(o.e, o.i)] == null && !MOCK.some((m) => o.e.id.indexOf(m) === 0)).sort((p, r) => rank(p.e) - rank(r.e));
    let n = 0;
    for (const o of c) { if (n >= y.n) break; const g = grams(o.q.q); if (seen.some((t) => sim(g, t) > 0.7)) continue; take(o.e, o.i, 1, "熱門節"); seen.push(g); n++; }
    hotSummary.push(y.x.s + "=" + n + (n < y.n ? "(缺" + (y.n - n) + ")" : ""));
  });
});
// 階段二：題庫精選。章內按該節考卷題數分配，和考卷太像的不選，其餘平均取樣
const allPaper = []; real.forEach((e) => e.questions.forEach((q) => allPaper.push(grams(q.q))));
const bankSummary = [];
bank.forEach((e) => {
  const ch = e.id.split("-").pop(), bySec = {};
  e.questions.forEach((q, i) => { const g = grams(q.q); (bySec[q.sec] = bySec[q.sec] || { all: 0, ok: [] }).all++; if (!allPaper.some((t) => sim(g, t) > 0.6)) bySec[q.sec].ok.push({ i, g }); });
  const secs = Object.keys(bySec), a = alloc(secs.map((s) => ({ s, w: (papersBySec[s] || []).length, cap: bySec[s].ok.length })), BANK[ch]);
  a.forEach((y) => {
    const ok = bySec[y.x.s].ok, got = [], step = ok.length / (y.n || 1), first = []; let n = 0;
    for (let j = 0; j < y.n; j++) first.push(ok[Math.floor(j * step)]);
    first.concat(ok.filter((z) => first.indexOf(z) < 0)).forEach((o) => { if (n >= y.n || got.some((t) => sim(o.g, t) > 0.7)) return; take(e, o.i, 2, "題庫精選"); got.push(o.g); n++; });
    bankSummary.push(y.x.s + "=" + n + "/" + bySec[y.x.s].all);
  });
});
rows.sort((a, b) => a[0] - b[0] || +a[1].slice(1) - +b[1].slice(1) || a[2].localeCompare(b[2]));
fs.writeFileSync(OUT, "﻿階段\t章\t節\t考卷\t題號\t來源\t題目\n" + rows.map((r) => r.join("\t")).join("\n") + "\n");
const cnt = (st) => rows.filter((r) => r[0] === st).length, byCh = (st) => Object.keys(HOT).map((c) => c + ":" + rows.filter((r) => r[0] === st && r[1] === c).length).join(" ");
console.log("階段一", cnt(1), byCh(1)); console.log("熱門節", hotSummary.join(" "));
console.log("題庫精選", cnt(2), byCh(2)); console.log("題庫各節", bankSummary.join(" "));

const apply = process.argv.slice(2).map(Number);
if (apply.length) {
  let out = src, miss = 0;
  exams.forEach((e) => {
    const at = out.indexOf('{"id":"' + e.id + '"'); let pos = at;
    e.questions.forEach((q, i) => {
      const s = JSON.stringify(q), j = out.indexOf(s, pos); if (j < 0) { miss++; return; }
      const base = Object.assign({}, q); delete base.st;
      const st = pick[key(e, i)], nq = st && apply.indexOf(st) >= 0 ? Object.assign(base, { st }) : base, ns = JSON.stringify(nq);
      out = out.slice(0, j) + ns + out.slice(j + s.length); pos = j + ns.length;
    });
  });
  if (miss) { console.log("找不到的題目", miss, "，不寫入"); process.exit(1); }
  const strip = (x) => JSON.stringify(x.map((e) => Object.assign({}, e, { questions: e.questions.map((q) => { const c = Object.assign({}, q); delete c.st; return c; }) })));
  if (strip(load(out)) !== strip(exams)) { console.log("比對失敗，不寫入"); process.exit(1); }
  fs.writeFileSync(FILE, out); console.log("已寫入");
}
