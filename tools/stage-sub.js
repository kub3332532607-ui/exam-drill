// 各科重點題（每節 10–15 題，仿憲法階段一）：
//   node tools/stage-sub.js adm alaw pol jur        只輸出 tools/重點題選題.tsv 與統計
//   node tools/stage-sub.js --write adm alaw ...    寫進 data/<科目>.js（"st":1）
// 規則：113、114 地特四等留給模擬考不選；同等級、新的優先（地特四等、普考 → 其他四等 → 三等 → 其他）；
// 和本節已選題太像（雙字相似度 > 0.6）的跳過。每節取 round(題數×0.35)，限 10–15；不到 10 題就全收。
// 選題不用亂數，同樣的資料挑出同樣的題。已有 st 的題會被重設成本次結果。
const fs = require("fs"), vm = require("vm");
const FILES = { adm: "data/adm.js", alaw: "data/alaw.js", pol: "data/pol.js", jur: "data/jur.js" }, OUT = "tools/重點題選題.tsv";
const args = process.argv.slice(2), write = args.includes("--write"), subs = args.filter((a) => FILES[a]);
const isMock = (e) => /^11[34] 地特四等/.test(e.short);
const norm = (s) => String(s || "").replace(/[\s，。、；：？！「」（）()『』,.;:?!]/g, "");
const grams = (s) => { const a = new Set(), t = norm(s); for (let i = 0; i < t.length - 1; i++) a.add(t.slice(i, i + 2)); return a; };
const sim = (a, b) => { let n = 0; a.forEach((x) => { if (b.has(x)) n++; }); return n / (a.size + b.size - n || 1); };
const year = (e) => +(e.short.match(/^\d+/) || [0])[0];
const tier = (e) => e.id.indexOf("bank") === 0 ? 9 : /地特四等|普考/.test(e.short) ? 0 : /四等/.test(e.short) ? 1 : /三等|高考/.test(e.short) ? 2 : 3;
const rank = (e) => tier(e) * 1000 - year(e);
const load = (src) => { const D = []; vm.runInNewContext(src, { KS: { add: (o) => { if (o.exams) D.push(...o.exams); } } }); return D; };
const rows = [];
subs.forEach((sid) => {
  const FILE = FILES[sid], src = fs.readFileSync(FILE, "utf8"), exams = load(src), pick = {};
  const bySec = {};
  exams.forEach((e) => e.questions.forEach((q, i) => { if (q.sec && !isMock(e) && q.q) (bySec[q.sec] = bySec[q.sec] || []).push({ e, i, q, g: grams(q.q + (q.o || []).join("")) }); }));
  let tot = 0, nsec = 0; const short = [];
  Object.keys(bySec).forEach((sec) => {
    const c = bySec[sec].sort((a, b) => rank(a.e) - rank(b.e) || a.e.id.localeCompare(b.e.id) || a.i - b.i), got = [];
    const uniq = []; c.forEach((o) => { if (!uniq.some((u) => sim(u.g, o.g) > 0.6)) uniq.push(o); });
    const want = uniq.length < 10 ? uniq.length : Math.min(15, Math.max(10, Math.round(uniq.length * 0.35)));
    for (const o of uniq) { if (got.length >= want) break; got.push(o); }
    got.forEach((o) => { pick[o.e.id + "#" + o.i] = 1; rows.push([sid, o.q.ch, sec, o.e.short, o.q.no, o.q.q.replace(/\s+/g, " ")]); });
    tot += got.length; nsec++; if (got.length < 10) short.push(sec + "=" + got.length);
  });
  console.log(sid, "重點題", tot, "／節", nsec, "；不到 10 題的節", short.length, short.join(" "));
  if (!write) return;
  let out = src, miss = 0;
  exams.forEach((e) => {
    let pos = out.indexOf('{"id":"' + e.id + '"');
    e.questions.forEach((q, i) => {
      const s = JSON.stringify(q), j = out.indexOf(s, pos); if (j < 0) { miss++; return; }
      const base = Object.assign({}, q); delete base.st; if (pick[e.id + "#" + i]) base.st = 1;
      const ns = JSON.stringify(base); out = out.slice(0, j) + ns + out.slice(j + s.length); pos = j + ns.length;
    });
  });
  if (miss) { console.log(sid, "找不到的題目", miss, "，不寫入"); return; }
  const strip = (x) => JSON.stringify(x.map((e) => Object.assign({}, e, { questions: e.questions.map((q) => { const c = Object.assign({}, q); delete c.st; return c; }) })));
  if (strip(load(out)) !== strip(exams)) { console.log(sid, "比對失敗，不寫入"); return; }
  fs.writeFileSync(FILE, out); console.log(sid, "已寫入");
});
rows.sort((a, b) => a[0].localeCompare(b[0]) || +a[1].slice(1) - +b[1].slice(1) || a[2].localeCompare(b[2], "en", { numeric: true }));
fs.writeFileSync(OUT, "﻿科目\t章\t節\t考卷\t題號\t題目\n" + rows.map((r) => r.join("\t")).join("\n") + "\n");
