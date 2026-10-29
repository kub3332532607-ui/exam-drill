(function () {
  "use strict";
  var KS = window.KS, LET = ["A", "B", "C", "D"];
  var app = document.getElementById("app");
  // 版本號：和 sw.js 的 VER 保持一致，改程式時兩邊一起加一
  var APP_VER = "ks-v32", APP_DATE = "2026-10-29";

  // ---------- 儲存 ----------
  var KEY = "ks_v1";
  // marks：課文畫線 {節id: [{id,p,q,o,note,rep,sent,ts}]}；repq：題目訂正要回報 {題id: {sent,ts}}；read：閱讀設定
  // qm：題目劃記與訂正畫線、qx：刪去法（見「題目劃記」）；nts：題目訂正的修改時間；del：已刪除畫線的墓碑 {畫線id: 時間}（同步時避免已刪的畫線復活）
  var S = { stats: {}, attempts: [], notes: {}, nts: {}, essay: {}, theme: "", print: {}, marks: {}, repq: {}, read: {}, del: {}, qm: {}, qx: {}, pos: {}, plan: {}, vw: {}, tl: {}, run: null };
  function load() {
    try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) S = Object.assign(S, j); } catch (e) {}
    migrate();
  }
  function migrate() {
    S.attempts.forEach(function (a) { if (!a.set && a.exam) a.set = "e:" + a.exam; });
    S.essay = S.essay || {}; S.print = S.print || {}; S.marks = S.marks || {}; S.repq = S.repq || {}; S.read = S.read || {}; S.nts = S.nts || {}; S.del = S.del || {}; S.qm = S.qm || {}; S.qx = S.qx || {}; S.pos = S.pos || {}; S.plan = S.plan || {}; S.vw = S.vw || {}; S.tl = S.tl || {};
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function applyTheme() { if (S.theme) document.documentElement.setAttribute("data-theme", S.theme); else document.documentElement.removeAttribute("data-theme"); }

  // ---------- 工具 ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    var kids = [].concat.apply([], [].slice.call(arguments, 2));   // 子節點可傳陣列
    kids.forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function show() { app.replaceChildren.apply(app, [].slice.call(arguments).filter(Boolean)); }
  function go(hash) { location.hash = hash; }
  function toast(t) { var el = h("div", { class: "toast", text: t }); document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1800); }
  function subj(id) { return KS.subjects.filter(function (s) { return s.id === id; })[0]; }
  function exam(id) { return KS.exams.filter(function (e) { return e.id === id; })[0]; }
  function chapters(sid) { return KS.chapters[sid] || []; }
  function chapter(sid, cid) { return chapters(sid).filter(function (c) { return c.id === cid; })[0]; }
  function section(sid, cid, xid) { var c = chapter(sid, cid); return c ? c.sections.filter(function (x) { return x.id === xid; })[0] : null; }
  function essay(id) { return KS.essays.filter(function (e) { return e.id === id; })[0]; }
  function qid(e, n) { return e.id + "#" + n; }
  // 答案可為單一索引或陣列（更正答案「均給分」）
  function ok(q, i) { return Array.isArray(q.a) ? q.a.indexOf(i) >= 0 : i === q.a; }
  function ansText(q) { return (Array.isArray(q.a) ? q.a : [q.a]).map(function (i) { return LET[i]; }).join(" 或 "); }
  function qno(it) { return it.q.no || it.n; }
  function passage(it) { return it.q.g && it.e.passages ? it.e.passages[it.q.g] : null; }
  function stat(e, n) { return S.stats[qid(e, n)]; }
  function record(e, n, ok) {
    var k = qid(e, n), s = S.stats[k] || { w: 0, c: 0 };
    if (ok) s.c++; else s.w++; s.last = ok ? "c" : "w"; s.ts = Date.now(); S.stats[k] = s;
  }
  function search(q) { return "https://www.google.com/search?q=" + encodeURIComponent("阿摩 " + q.q.slice(0, 40)); }
  function topbar(back, label) {
    var next = S.theme === "dark" ? "light" : S.theme === "light" ? "" : "dark";
    return h("div", { class: "bar" },
      back ? h("a", { class: "back", href: back, text: "‹ " + (label || "返回") }) : h("span", { class: "brand", text: "國考刷題本" }),
      h("button", { class: "link", text: S.theme === "dark" ? "☀︎ 日間" : S.theme === "light" ? "跟隨系統" : "☾ 夜間", onclick: function () { S.theme = next; save(); applyTheme(); route(); } }));
  }

  // ---------- 題組（考卷、章節、錯題共用） ----------
  // key 形式：e:考卷id ｜ c:科目:章id（_none＝未分章）｜ w:科目
  function getSet(key) {
    var p = key.split(":"), items = [], title = "", sid, back;
    if (p[0] === "e") {
      var e = exam(p[1]); if (!e) return null;
      e.questions.forEach(function (q, i) { items.push({ e: e, n: i + 1, q: q }); });
      title = e.short + " " + e.name; sid = e.subject; back = "#/x/" + e.id;
      return { key: key, title: title, sid: sid, items: items, back: back, perScore: e.perScore, exam: e };
    }
    sid = p[1];
    KS.exams.filter(function (e) { return e.subject === sid; }).forEach(function (e) {
      e.questions.forEach(function (q, i) {
        var hit = p[0] === "c" ? (p[2] === "_none" ? !q.ch : q.ch === p[2] && (!p[3] || q.sec === p[3])) : (stat(e, i + 1) && stat(e, i + 1).last === "w");
        if (hit) items.push({ e: e, n: i + 1, q: q });
      });
    });
    if (p[0] === "c" && p[3]) { var sc = section(sid, p[2], p[3]); if (!sc) return null; title = sc.title; back = "#/rd/" + sid + "/" + p[2] + "/" + p[3]; }
    else if (p[0] === "c") { var c = chapter(sid, p[2]); title = c ? c.title : "尚未分章的題目"; back = "#/c/" + sid + "/" + p[2]; }
    else { title = subj(sid).name + " 錯題"; back = "#/s/" + sid + "/wr"; }
    return { key: key, title: title, sid: sid, items: items, back: back };
  }
  // 作答中把題組固定住，避免錯題答對後順序跑掉
  var frozen = {};
  function useSet(key) { if (!frozen[key]) { var s = getSet(key); if (s) frozen[key] = s; } return frozen[key]; }
  function itemsFromIds(ids) {
    return ids.map(function (k) { var i = k.lastIndexOf("#"), e = exam(k.slice(0, i)), n = +k.slice(i + 1); return e && e.questions[n - 1] ? { e: e, n: n, q: e.questions[n - 1] } : null; }).filter(Boolean);
  }
  function setEssays(key) {
    var p = key.split(":");
    if (p[0] !== "c") return [];
    return KS.essays.filter(function (x) { return x.subject === p[1] && (p[2] === "_none" ? !x.ch : x.ch === p[2]) && (!p[3] || x.sec === p[3]); });
  }
  function lastAttempt(key) { for (var i = S.attempts.length - 1; i >= 0; i--) if (S.attempts[i].set === key) return S.attempts[i]; return null; }
  function counts(items) {
    var done = 0, wrong = 0;
    items.forEach(function (it) { var s = stat(it.e, it.n); if (s) { done++; if (s.last === "w") wrong++; } });
    return { done: done, wrong: wrong, total: items.length };
  }

  // ---------- 讀到哪（自動記憶） ----------
  // S.pos（會同步）：「rd:科目:節」{p:段落序號, pc:讀到百分比, done:停在節末, fin:曾讀完, ts}；「pr:題組」{n:第幾題, a:{題id:選項}, done, ts}；「last」{href, label, sub, ts}
  function setPos(k, v) { v.ts = Date.now(); S.pos[k] = v; save(); }
  function setLast(href, label, sub) { var o = S.pos.last; if (o && o.href === href && o.sub === sub && Date.now() - o.ts < 3e4) return; setPos("last", { href: href, label: label, sub: sub }); }
  function resumeN(key, total) { var r = S.pos["pr:" + key]; return r && !r.done && r.n > 1 && r.n <= total ? r.n : 0; }
  // 線上作答按鈕：做到一半就顯示「接續第 N 題」＋「從頭」
  function pracBtns(key, total, main) {
    var n = key.charAt(0) === "w" ? 0 : resumeN(key, total);
    if (!n) return [h("a", { class: main ? "btn" : "btn soft", href: "#/p/" + key + "/1", text: "線上作答" })];
    return [h("a", { class: "btn", href: "#/p/" + key + "/" + n, text: "接續第 " + n + " 題" }),
      h("a", { class: "btn soft", href: "#/p/" + key + "/1", text: "從頭作答", onclick: function () { setPos("pr:" + key, { n: 1, done: true }); delete frozen[key]; Object.keys(picked).forEach(function (x) { delete picked[x]; }); } })];
  }


  // ---------- 今日任務（倒數＋每日清單） ----------
  // S.plan（會同步）：{ "YYYY-MM-DD": { 任務id: 完成時間 } }。任務內容依日期與階段自動產生，只存打勾。
  var EXAMS = [{ name: "地特四等", d: "2026-12-05" }, { name: "高普考", d: "2027-07-02" }];
  var VOCAB = "https://claude.ai/artifact/WFkk5GwjDHk7HbVjvNf4MG";
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function daysTo(ds) { var t = new Date(), a = new Date(t.getFullYear(), t.getMonth(), t.getDate()), p = ds.split("-"); return Math.round((new Date(+p[0], +p[1] - 1, +p[2]) - a) / 864e5); }
  function nextSec(sid) {
    var cs = chapters(sid);
    for (var i = 0; i < cs.length; i++) for (var j = 0; j < (cs[i].sections || []).length; j++) {
      var x = cs[i].sections[j], r = S.pos["rd:" + sid + ":" + x.id];
      if (!(r && r.fin)) return { sid: sid, cid: cs[i].id, x: x, pc: r && r.pc };
    }
    return null;
  }
  // 當天要讀的節第一次排定後就固定（存在 S.plan[日期]._sec），讀完打勾也不會跳到下一節
  function daySec(today, sid) {
    var pl = S.plan[today] = S.plan[today] || {}, f = pl._sec && pl._sec.split(":");
    if (f && f[0] === sid) {
      var c = chapters(sid).filter(function (c) { return c.id === f[1]; })[0], x = c && (c.sections || []).filter(function (x) { return x.id === f[2]; })[0];
      if (x) { var r = S.pos["rd:" + sid + ":" + x.id]; return { sid: sid, cid: c.id, x: x, pc: r && !r.fin && r.pc, fin: r && r.fin }; }
    }
    var ns = nextSec(sid);
    if (ns) { pl._sec = sid + ":" + ns.cid + ":" + ns.x.id; save(); }
    return ns;
  }
  function wrongBySubject() {
    var m = {}, tot = 0;
    KS.exams.forEach(function (e) { e.questions.forEach(function (q, i) { var st = stat(e, i + 1); if (st && st.last === "w") { m[e.subject] = (m[e.subject] || 0) + 1; tot++; } }); });
    return { m: m, tot: tot };
  }
  function planTasks() {
    var d0 = new Date(), dow = d0.getDay(), today = ymd(d0), T = [];
    var wb = wrongBySubject(), top = Object.keys(wb.m).sort(function (a, b) { return wb.m[b] - wb.m[a]; })[0];
    function add(id, t, sub, href, min, tier, sid, ext) { T.push({ id: id, t: t, sub: sub, href: href, min: min, tier: tier, sid: sid, ext: ext }); }
    function vocab0(min) { add("voc", "單字", "先背考卷單字，再寫那份題", VOCAB, min, 0, "eng", true); }
    function readSec(sid, min, qmin) {
      var s = subj(sid), ns = daySec(today, sid);
      if (!ns) { add("qs", s.name + "：刷 30 題", "課文已讀完一輪", "#/s/" + sid + "/ex", qmin + 15, 0, sid); return; }
      add("rd", s.name + "：讀一節", ns.x.title + (ns.fin ? "（已讀完）" : ns.pc ? "（讀到 " + ns.pc + "%）" : ""), "#/rd/" + sid + "/" + ns.cid + "/" + ns.x.id, min, 0, sid);
      var key = "c:" + sid + ":" + ns.cid + ":" + ns.x.id, st = getSet(key);
      add("qs", s.name + "：本節題目", st && st.items.length ? "共 " + st.items.length + " 題，做完看解析" : "本節沒有題目，改做考卷 15 題", st && st.items.length ? "#/p/" + key + "/1" : "#/s/" + sid + "/ex", qmin, 0, sid);
    }
    var phase = today < "2026-11-23" ? "A" : today < "2026-12-02" ? "B" : today < "2026-12-05" ? "C" : today === "2026-12-05" ? "X" : daysTo("2027-04-01") > 0 ? 2 : 3;
    if (phase === "A") {
      // 地特前補強：保底＝單字＋英文＋一科讀一節＋本節題目；加碼＝第二科刷題、錯題、週六作文
      var ROT = { 1: ["con", "alaw"], 2: ["adm", "pol"], 3: ["jur", "alaw"], 4: ["adm", "con"], 5: ["con", "jur"], 6: ["adm", "alaw"], 0: [null, "pol"] }[dow];
      vocab0(20);
      add("eng", "英文 10 題", "英文占法學知識與英文 20/50 題", "#/s/eng/ex", 20, 0, "eng");
      if (ROT[0]) readSec(ROT[0], 40, 25);
      else {
        add("wk", "錯題總複習", wb.tot ? "本週錯題回頭看，" + subj(top).name + " 最多" : "挑本週最弱的一科回頭看", wb.tot ? "#/s/" + top + "/wr" : "#/", 40, 0, top || "");
        add("chn", "國文測驗 15 題", "字音字形、成語、閱讀", "#/s/chn/ex", 25, 0, "chn");
      }
      add("q2", subj(ROT[1]).name + "：刷 30 題", ROT[1] === "alaw" ? "行政法課文還沒寫，先以題目熟悉考點" : "做完看解析，錯的加訂正", "#/s/" + ROT[1] + "/ex", 45, 1, ROT[1]);
      if (dow === 6) add("es", "國文作文一篇", "限時 50 分鐘，寫完拍照或打字存下", "#/s/chn", 50, 1, "chn");
      if (wb.tot && ROT[0]) add("wr", "錯題複習", "共 " + wb.tot + " 題，" + subj(top).name + " 最多", "#/s/" + top + "/wr", 20, 1, top);
    } else if (phase === "B") {
      // 模擬期：每天一份考卷計時寫，寫完檢討
      var M = [["con", "法學知識與英文", "憲法、法緒、英文各一份歷屆卷", 60], ["adm", "行政學", "一份地特四等或普考", 60], ["alaw", "行政法", "一份地特四等或普考", 60], ["pol", "政治學", "一份歷屆卷", 60], ["chn", "國文", "測驗＋作文", 90]];
      var m = M[Math.round((new Date(today) - new Date("2026-11-23")) / 864e5) % M.length];
      vocab0(20);
      add("mk", m[1] + " 模擬考", m[2] + "，計時寫完再對答案", "#/s/" + m[0] + "/ex", m[3], 0, m[0]);
      add("rv", "檢討今天的錯題", "看解析、寫訂正", "#/s/" + m[0] + "/wr", 40, 0, m[0]);
      add("eng", "英文 10 題", "保持手感", "#/s/eng/ex", 20, 1, "eng");
      if (wb.tot) add("wr", "其他科錯題", "共 " + wb.tot + " 題", "#/s/" + top + "/wr", 30, 1, top);
    } else if (phase === "C") {
      // 收尾：不做新題
      vocab0(20);
      add("wr", "錯題重看", wb.tot ? "共 " + wb.tot + " 題，" + subj(top).name + " 最多" : "看易錯框與畫線", wb.tot ? "#/s/" + top + "/wr" : "#/", 60, 0, top || "");
      add("hl", "課文易錯框與畫線", "只看不做新題", "#/s/con", 40, 1, "con");
    } else if (phase !== "X") {
      // 地特後：專業科目輪讀＋申論骨架（之後再細排）
      var sid = { 1: "con", 2: "adm", 3: "pol", 4: "jur", 5: "alaw", 6: "chn", 0: "" }[dow];
      vocab0(phase === 3 ? 10 : 20);
      if (sid) {
        if (phase === 3) add("rev", subj(sid).name + " 重複複習", "只看錯題、法條、時事", "#/s/" + sid, 60, 0, sid);
        else readSec(sid, 40, 25);
        if (phase === 2 && (sid === "pol" || sid === "adm")) add("es", subj(sid).name + " 申論 1 題", "寫骨架或默寫架構", "#/s/" + sid, 40, 1, sid);
      } else add("wk", "週日總複習", "挑本週最弱的一科回頭看", "#/", 60, 0, "");
      if (wb.tot) add("wr", "錯題複習", "共 " + wb.tot + " 題", "#/s/" + top + "/wr", 20, 1, top);
    }
    return { date: today, phase: phase, tasks: T };
  }
  function streak(todayDone) {
    var n = todayDone ? 1 : 0, d = new Date();
    for (var i = 1; i < 400; i++) {
      d.setDate(d.getDate() - 1);
      var p = S.plan[ymd(d)];
      if (p && p._ok) n++; else if (i === 1 && !todayDone) continue; else break;
    }
    return n;
  }

  // ---------- 計時（類似 ATracker） ----------
  // S.run（只存本機）：正在計時的任務 {k, t, sid, min, d, href, acc:已累計毫秒, t0:這段開始時間, away:離開時間, hb:心跳}
  // S.tl（會同步）：計時紀錄 {id: {d:日期, k:任務id, t:名稱, sid, m:分鐘, ts, del?}}
  var COL = { chn: "#d0412f", con: "#3b55c4", jur: "#7a4cc4", eng: "#e08a1e", adm: "#1e8558", alaw: "#0d8aa8", pol: "#b0458a", pub: "#6a7284", "": "#9aa1b2" };
  function fmtM(m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? m % 60 + "m" : "") : m + "m"; }
  function runMs() { var r = S.run; return r ? r.acc + (r.t0 ? Date.now() - r.t0 : 0) : 0; }
  function mmss(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function dayMin(d) { var m = 0; Object.keys(S.tl).forEach(function (i) { var x = S.tl[i]; if (!x.del && x.d === d) m += x.m; }); return m; }
  function taskMin(d, k) { var m = 0; Object.keys(S.tl).forEach(function (i) { var x = S.tl[i]; if (!x.del && x.d === d && x.k === k) m += x.m; }); return m; }
  function tStart(t, date) {
    if (S.run && S.run.k === t.id && S.run.d === date) { if (!S.run.t0) tResume(); return; }
    if (S.run) tStop(true);
    S.run = { k: t.id, t: t.t, sid: t.sid || "", min: t.min, d: date, href: t.href, ext: !!t.ext, acc: 0, t0: Date.now(), hb: Date.now() };
    save(); runBar();
  }
  function tPause() { var r = S.run; if (!r || !r.t0) return; r.acc += Date.now() - r.t0; r.t0 = null; r.p = 1; save(); runBar(); }
  function tResume() { var r = S.run; if (!r) return; r.t0 = Date.now(); r.p = 0; r.away = null; save(); runBar(); }
  function tStop(quiet) {
    var r = S.run; if (!r) return;
    var m = Math.round(runMs() / 6e4);
    S.run = null;
    if (m >= 1) {
      var id = "t" + Date.now().toString(36);
      S.tl[id] = { d: r.d, k: r.k, t: r.t, sid: r.sid, m: m, ts: Date.now() };
      var pl = S.plan[r.d] = S.plan[r.d] || {};
      if (!pl[r.k] && taskMin(r.d, r.k) >= r.min * 0.8) { pl[r.k] = Date.now(); pl._t = Date.now(); }
    }
    save(); runBar();
    if (!quiet) { toast(m >= 1 ? "記下 " + m + " 分鐘" : "不到 1 分鐘，不記"); if (!location.hash || location.hash === "#/") route(); }
  }
  // 離開畫面（切程式、關螢幕、被叫走）就先停，回來再問要不要算進去
  function tAway() { var r = S.run; if (!r || !r.t0) return; r.acc += Date.now() - r.t0; r.t0 = null; r.away = Date.now(); save(); }
  function tBack() {
    var r = S.run; if (!r || !r.away) return;
    var gap = Date.now() - r.away;
    if (gap < 9e4) { r.acc += gap; r.away = null; r.t0 = Date.now(); save(); }
    runBar();
  }
  var rbar = null, rtick = null;
  function runBar() {
    var r = S.run;
    if (!r) { if (rbar) { rbar.remove(); rbar = null; } clearInterval(rtick); rtick = null; document.body.classList.remove("has-run"); return; }
    if (!rbar) { rbar = h("div", { class: "runbar", role: "status" }); document.body.appendChild(rbar); document.body.classList.add("has-run"); }
    rbar.style.setProperty("--c", COL[r.sid] || COL[""]);
    if (r.away) {
      var g = Math.round((Date.now() - r.away) / 6e4);
      rbar.replaceChildren(h("div", { class: "rb-q", text: (r.ext ? "剛剛 " + g + " 分鐘都在背單字嗎？" : "剛剛離開 " + g + " 分鐘，要算進去嗎？") }),
        h("button", { class: "rb-b", text: "算進去", onclick: function () { r.acc += Date.now() - r.away; tResume(); } }),
        h("button", { class: "rb-b soft", text: "不算", onclick: tResume }));
      return;
    }
    var tm = h("span", { class: "rb-t" });
    function upd() { var ms = runMs(); tm.textContent = mmss(ms) + " / " + r.min + "m"; if (r.t0 && Date.now() - (r.hb || 0) > 15e3) { r.hb = Date.now(); save(); } }
    rbar.replaceChildren(h("span", { class: "rb-dot" + (r.t0 ? " on" : "") }),
      h("a", { class: "rb-n", href: r.href, target: r.ext ? "_blank" : null, rel: r.ext ? "noopener" : null, text: r.t }), tm,
      h("button", { class: "rb-b soft", "aria-label": r.t0 ? "暫停" : "繼續", text: r.t0 ? "❚❚" : "▶", onclick: function () { if (S.run.t0) tPause(); else tResume(); } }),
      h("button", { class: "rb-b", "aria-label": "結束並記錄", text: "■", onclick: function () { tStop(); } }));
    upd(); clearInterval(rtick); rtick = setInterval(upd, 1000);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) tAway(); else tBack(); });
  window.addEventListener("pagehide", tAway);
  function runInit() {
    var r = S.run; if (!r) return;
    // 上次計時中被關掉：從最後一次心跳算起當作離開
    if (r.t0) { var hb = Math.max(r.hb || r.t0, r.t0); r.acc += hb - r.t0; r.t0 = null; r.away = hb; save(); }
    if (r.away) tBack(); else runBar();
  }

  function planCard() {
    var P = planTasks(), pl = S.plan[P.date] = S.plan[P.date] || {};
    var base = P.tasks.filter(function (t) { return !t.tier; }), extra = P.tasks.filter(function (t) { return t.tier; });
    var bd = base.filter(function (t) { return pl[t.id]; }).length, ok = base.length && bd === base.length;
    if (ok && !pl._ok) { pl._ok = Date.now(); save(); } else if (!ok && pl._ok) { delete pl._ok; save(); }
    var cds = EXAMS.map(function (e) { var n = daysTo(e.d); return n >= 0 ? h("div", { class: "cd" }, h("div", { class: "cdn", text: String(n) }), h("div", { class: "cdl", text: "天・" + e.name })) : null; });
    function row(t) {
      var on = !!pl[t.id], used = taskMin(P.date, t.id), run = S.run && S.run.k === t.id && S.run.d === P.date;
      var box = h("button", { class: "tk-box" + (on ? " on" : ""), "aria-label": on ? "取消完成" : "完成", text: on ? "✓" : "", onclick: function () {
        if (pl[t.id]) delete pl[t.id]; else pl[t.id] = Date.now();
        pl._t = Date.now(); save(); route();
      } });
      var play = h("button", { class: "tk-play" + (run ? " on" : ""), "aria-label": "開始計時", style: "--c:" + (COL[t.sid] || COL[""]), onclick: function () {
        tStart(t, P.date);
        if (t.ext) window.open(t.href, "_blank", "noopener"); else go(t.href);
      } }, h("span", { text: run ? "●" : "▶" }), h("small", { text: (used ? used + "/" : "") + t.min + "m" }));
      return h("div", { class: "tk-row", style: "--c:" + (COL[t.sid] || COL[""]) }, box,
        h("a", { class: "tk-main", href: t.href, target: t.ext ? "_blank" : null, rel: t.ext ? "noopener" : null }, h("div", { class: "nm" + (on ? " off" : ""), text: t.t }), h("div", { class: "sub", text: t.sub })), play);
    }
    var sk = streak(ok), tot = dayMin(P.date);
    var bmin = base.reduce(function (a, t) { return a + t.min; }, 0);
    var tip = { A: "保底做完就算今天及格；有力氣再做加碼。", B: "模擬期：每天一份考卷計時寫，寫完一定要檢討。", C: "收尾：不做新題，只看錯題和易錯。", 2: "專業科目輪讀＋申論骨架。", 3: "衝刺：只重複、不練新題型。" }[P.phase];
    if (P.phase === "X") return h("div", { class: "card plan-card" }, h("div", { class: "cds" }, cds), h("div", { class: "h2", text: "今天考試，加油！" }), h("div", { class: "small", text: "看一眼易錯框就好，不做新題。" }));
    return h("div", { class: "card plan-card" },
      h("div", { class: "cds" }, cds),
      h("div", { class: "tk-head" }, h("span", { class: "eyebrow", text: "今日・已讀 " + fmtM(tot) }), sk ? h("span", { class: "pill blue", text: "連續 " + sk + " 天" }) : null),
      h("div", { class: "tk-sec", text: "保底 " + bd + "/" + base.length + "・約 " + fmtM(bmin) + (ok ? "　✓ 今天及格" : "") }),
      base.map(row),
      extra.length ? h("div", { class: "tk-sec", text: "加碼（有力氣再做）" }) : null,
      extra.map(row),
      weekChart(),
      h("div", { class: "small", text: ok ? "今天及格了，記得按一次雲端同步。" : tip }));
  }
  // 最近 7 天各科時數
  function weekChart() {
    var days = [], d = new Date(), max = 60, tot = 0;
    for (var i = 6; i >= 0; i--) { var x = new Date(d); x.setDate(d.getDate() - i); days.push({ d: ymd(x), w: "日一二三四五六".charAt(x.getDay()), s: {}, m: 0 }); }
    var idx = {}; days.forEach(function (x, i) { idx[x.d] = i; });
    var bySub = {};
    Object.keys(S.tl).forEach(function (id) {
      var x = S.tl[id]; if (x.del || idx[x.d] == null) return;
      var o = days[idx[x.d]]; o.s[x.sid] = (o.s[x.sid] || 0) + x.m; o.m += x.m; tot += x.m; bySub[x.sid] = (bySub[x.sid] || 0) + x.m;
    });
    days.forEach(function (x) { if (x.m > max) max = x.m; });
    var cols = days.map(function (x) {
      return h("div", { class: "wk-c" }, h("div", { class: "wk-v", text: x.m ? fmtM(x.m) : "" }),
        h("div", { class: "wk-bar" }, Object.keys(x.s).map(function (s) { return h("div", { style: "height:" + (x.s[s] / max * 100) + "%;background:" + (COL[s] || COL[""]) }); })),
        h("div", { class: "wk-d", text: x.w }));
    });
    var leg = Object.keys(bySub).sort(function (a, b) { return bySub[b] - bySub[a]; }).map(function (s) {
      return h("span", { class: "wk-lg" }, h("i", { style: "background:" + (COL[s] || COL[""]) }), (s && subj(s) ? subj(s).name : "其他") + " " + fmtM(bySub[s]));
    });
    var today = ymd(new Date()), logs = Object.keys(S.tl).filter(function (id) { return !S.tl[id].del && S.tl[id].d === today; }).sort(function (a, b) { return S.tl[a].ts - S.tl[b].ts; });
    var rows = logs.map(function (id) {
      var x = S.tl[id], t = new Date(x.ts);
      return h("div", { class: "wk-log" }, h("span", { text: ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2) + "　" + x.t + "　" + x.m + " 分" }),
        h("button", { class: "link", text: "刪除", onclick: function () { if (confirm("刪除這筆 " + x.m + " 分鐘的紀錄？")) { S.tl[id] = { del: 1, ts: Date.now() }; save(); route(); } } }));
    });
    return h("details", { class: "wk" }, h("summary", { text: "本週 " + fmtM(tot) + (tot ? "・看各科分布" : "") }),
      h("div", { class: "wk-g" }, cols), leg.length ? h("div", { class: "wk-lgs" }, leg) : null,
      rows.length ? h("div", { class: "wk-logs" }, h("div", { class: "small", text: "今天的紀錄" }), rows) : null);
  }

  // ---------- 首頁 ----------
  function viewHome() {
    var rows = h("div", { class: "rows" });
    KS.subjects.forEach(function (s) {
      var ex = KS.exams.filter(function (e) { return e.subject === s.id; });
      var chs = chapters(s.id), n = 0;
      ex.forEach(function (e) { n += e.questions.length; });
      var has = ex.length || chs.length;
      var sub = has ? [chs.length ? chs.length + " 章" : "", ex.length + " 份考卷", n + " 題選擇"].filter(Boolean).join("・") : "還沒有題目，傳考卷給 Claude";
      rows.appendChild(has ? h("a", { class: "row", href: "#/s/" + s.id }, h("div", null, h("div", { class: "nm", text: s.name }), h("div", { class: "sub", text: sub })), h("span", { class: "go", text: "›" }))
        : h("div", { class: "row off" }, h("div", null, h("div", { class: "nm", text: s.name }), h("div", { class: "sub", text: sub })), s.link ? h("a", { class: "pill blue", href: s.link, target: "_blank", rel: "noopener", text: s.linkText }) : h("span")));
    });
    var wr = 0; Object.keys(S.stats).forEach(function (k) { if (S.stats[k].last === "w") wr++; });
    var rp = pendingReports().length, vn = vwPending().length;
    var L = S.pos.last;
    show(topbar(),
      L && L.href ? h("a", { class: "card row cont-card", href: L.href }, h("div", null, h("div", { class: "eyebrow", text: "繼續上次" }), h("div", { class: "nm", text: L.label }), L.sub ? h("div", { class: "sub", text: L.sub }) : null), h("span", { class: "go", text: "›" })) : null,
      planCard(),
      h("div", { class: "card" }, h("div", { class: "eyebrow", text: "一般行政" }), h("div", { class: "title", text: "今天讀哪一科？" }), h("div", { class: "muted", text: wr ? "錯題本裡還有 " + wr + " 題等你回來。" : "先複習一章，再寫那一章的考古題。" })),
      h("div", { class: "card" }, rows),
      rp + vn ? h("a", { class: "card row rep-card", href: "#/rep" }, h("div", null, h("div", { class: "nm", text: "回報給 Claude" }), h("div", { class: "sub", text: [rp ? rp + " 則訂正等著補進課文" : "", vn ? vn + " 個生字等著補進單字程式" : ""].filter(Boolean).join("、") })), h("span", { class: "pill blue", text: String(rp + vn) })) : null,
      syncCard(),
      h("div", { class: "card" }, h("div", { class: "h2", text: "備份" }), h("div", { class: "small", text: "進度存在這個瀏覽器。也可以匯出成檔案，到另一台裝置匯入。" }),
        h("div", { class: "btns" }, h("button", { class: "btn soft", text: "匯出進度", onclick: exportData }), h("label", { class: "btn soft", for: "imp", text: "匯入進度" }),
          h("input", { id: "imp", type: "file", accept: "application/json", hidden: true, onchange: importData }))),
      verCard());
  }
  // ---------- 版本與更新 ----------
  function verNum(v) { var m = /ks-v(\d+)/.exec(v || ""); return m ? +m[1] : 0; }
  function latestVer() {
    return fetch("sw.js?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); })
      .then(function (t) { var m = /VER\s*=\s*"([^"]+)"/.exec(t); return m ? m[1] : ""; });
  }
  function forceUpdate() {
    toast("更新中…");
    var jobs = [];
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }
  function checkUpdate(btn, quiet) {
    if (btn) { btn.disabled = true; btn.textContent = "檢查中…"; }
    return latestVer().then(function (v) {
      if (btn) { btn.disabled = false; btn.textContent = "檢查更新"; }
      if (verNum(v) > verNum(APP_VER)) { if (quiet) showUpdBar(v); else forceUpdate(); }
      else if (!quiet) toast("已是最新版（v" + verNum(APP_VER) + "）");
    }).catch(function () { if (btn) { btn.disabled = false; btn.textContent = "檢查更新"; } if (!quiet) toast("連不到網路，稍後再試"); });
  }
  function showUpdBar(v) {
    if (document.getElementById("updbar")) return;
    document.body.appendChild(h("button", { id: "updbar", class: "upd-bar", onclick: forceUpdate, text: "有新版 v" + verNum(v) + "，點這裡更新" }));
  }
  function verCard() {
    var btn = h("button", { class: "btn soft", text: "檢查更新", onclick: function () { checkUpdate(btn, false); } });
    return h("div", { class: "card" }, h("div", { class: "h2", text: "版本" }),
      h("div", { class: "small", text: "目前版本 v" + verNum(APP_VER) + "（" + APP_DATE + "）。打開時會自動檢查，有新版會在畫面下方提示。" }),
      h("div", { class: "btns" }, btn));
  }
  // ---------- 雲端同步（私人 Gist） ----------
  var syncing = false;
  function syncErr(e) {
    if (e.status === 401) return "權杖無效或已過期，請重新貼上";
    if (e.status === 403 || e.status === 404) return "權杖沒有 gist 權限（要用 classic 權杖並勾 gist）";
    if (e.status === -1) return "雲端資料版本較新，請先重新整理網頁更新程式";
    if (e.status === 0) return "還沒設定權杖";
    return "同步失敗，請確認網路後再試";
  }
  function doSync(btn) {
    if (syncing) return; syncing = true;
    if (btn) { btn.disabled = true; btn.textContent = "同步中…"; }
    KSSync.sync(S, function (m) { KSSync.FIELDS.forEach(function (k) { S[k] = m[k]; }); migrate(); save(); })
      .then(function (r) { syncing = false; toast(r.up ? "已同步（有更新上傳）" : "已同步，雲端已是最新"); route(); })
      .catch(function (e) { syncing = false; toast(syncErr(e)); route(); });
  }
  function syncCard() {
    var c = KSSync.cfg();
    if (!c.token) {
      var inp = h("input", { type: "password", class: "tk", placeholder: "貼上權杖 ghp_…", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      return h("div", { class: "card" }, h("div", { class: "h2", text: "雲端同步" }),
        h("div", { class: "small", text: "手機和電腦的進度、畫線、備註存到你自己的私人 Gist。每台裝置只要貼一次權杖。" }),
        h("div", { class: "small" }, "① ", h("a", { href: "https://github.com/settings/tokens/new?scopes=gist&description=exam-drill-sync", target: "_blank", rel: "noopener", text: "建立權杖" }), "（Classic，只勾 gist，期限選「No expiration」）　② 複製貼到下面"),
        inp,
        h("div", { class: "btns" }, h("button", { class: "btn", text: "啟用並同步", onclick: function () {
          var t = inp.value.trim(); if (!/^(ghp_|github_pat_|gho_)/.test(t) && t.length < 30) return toast("權杖格式不對");
          KSSync.setCfg({ token: t }); doSync(null);
        } })));
    }
    var btn = h("button", { class: "btn", text: "立即同步", onclick: function () { doSync(btn); } });
    return h("div", { class: "card" }, h("div", { class: "h2", text: "雲端同步" }),
      h("div", { class: "small", text: c.last ? "上次同步：" + new Date(c.last).toLocaleString("zh-TW", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "尚未同步" }),
      h("div", { class: "small", text: "開始前、結束後各按一次。兩邊的進度會合併，不會互相覆蓋。" }),
      h("div", { class: "btns" }, btn, h("button", { class: "btn soft", text: "停用", onclick: function () {
        if (confirm("停用後這台裝置不再同步（雲端資料保留）。確定？")) { KSSync.setCfg({}); route(); }
      } })));
  }
  function exportData() {
    var a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(S)], { type: "application/json" })), download: "刷題本進度_" + new Date().toISOString().slice(0, 10) + ".json" });
    document.body.appendChild(a); a.click(); a.remove(); toast("已匯出");
  }
  function importData(ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { try { var j = JSON.parse(r.result); if (!j.stats) throw 0; S = Object.assign(S, j); migrate(); save(); applyTheme(); toast("已匯入"); route(); } catch (e) { toast("檔案格式不對"); } };
    r.readAsText(f);
  }

  // ---------- 科目 ----------
  function viewSubject(sid, tab) {
    var s = subj(sid), chs = chapters(sid), review = !s.noReview && chs.length;
    tab = tab || (review ? "ch" : "ex");
    var seg = h("div", { class: "seg" });
    if (review) seg.appendChild(h("a", { href: "#/s/" + sid + "/ch", "aria-current": String(tab === "ch"), text: "章節" }));
    seg.appendChild(h("a", { href: "#/s/" + sid + "/ex", "aria-current": String(tab === "ex"), text: "考卷" }));
    seg.appendChild(h("a", { href: "#/s/" + sid + "/wr", "aria-current": String(tab === "wr"), text: "錯題" }));
    var body = h("div", { class: "rows" });
    if (tab === "ch") {
      chs.forEach(function (c, i) {
        var set = getSet("c:" + sid + ":" + c.id), ct = counts(set.items), es = setEssays(set.key);
        var esDone = es.filter(function (x) { return S.essay[x.id] && S.essay[x.id].rate; }).length;
        body.appendChild(h("a", { class: "row", href: "#/c/" + sid + "/" + c.id },
          h("div", null, h("div", { class: "small", text: "第 " + (i + 1) + " 章" }), h("div", { class: "nm", text: c.title }),
            h("div", { class: "sub", text: "選擇 " + ct.done + "/" + ct.total + "・申論 " + esDone + "/" + es.length })),
          ct.wrong ? h("span", { class: "pill red", text: "錯 " + ct.wrong }) : h("span", { class: "go", text: "›" })));
      });
      var none = getSet("c:" + sid + ":_none");
      if (none.items.length) body.appendChild(h("a", { class: "row", href: "#/c/" + sid + "/_none" },
        h("div", null, h("div", { class: "nm", text: "尚未分章的題目" }), h("div", { class: "sub", text: none.items.length + " 題，等對應的筆記傳來再歸章" })), h("span", { class: "go", text: "›" })));
    } else if (tab === "ex") {
      var ex = KS.exams.filter(function (e) { return e.subject === sid; });
      if (!ex.length) body.appendChild(h("div", { class: "empty", text: "還沒有考卷。把考題和答案 PDF 傳給 Claude，就會出現在這裡。" }));
      ex.forEach(function (e) {
        var set = getSet("e:" + e.id), ct = counts(set.items), la = lastAttempt(set.key);
        body.appendChild(h("a", { class: "row", href: "#/x/" + e.id },
          h("div", null, h("div", { class: "nm", text: e.short }), h("div", { class: "small", text: e.name }), h("div", { class: "sub", text: e.questions.length + " 題・" + (la ? "上次 " + la.score + " 分" : "還沒對過答案") })),
          ct.wrong ? h("span", { class: "pill red", text: "錯 " + ct.wrong }) : h("span", { class: "go", text: "›" })));
      });
    } else {
      var w = getSet("w:" + sid);
      if (!w.items.length) body.appendChild(h("div", { class: "empty", text: "目前沒有錯題。" }));
      else {
        body.appendChild(h("div", { class: "btns" }, h("a", { class: "btn", href: "#/p/w:" + sid + "/1", text: "重做 " + w.items.length + " 題" }), h("a", { class: "btn soft", href: "#/print/w:" + sid, text: "列印錯題" })));
        w.items.forEach(function (it) { body.appendChild(wrongBlock(it, undefined)); });
      }
    }
    show(topbar("#/", "首頁"), h("div", { class: "card" }, h("div", { class: "title", text: s.name }),
      s.link ? h("a", { class: "link-out", href: s.link, target: "_blank", rel: "noopener", text: "開啟" + s.linkText + " ↗" }) : null, seg, body));
  }

  // ---------- 章節 ----------
  function viewChapter(sid, cid) {
    var s = subj(sid), c = chapter(sid, cid), key = "c:" + sid + ":" + cid, set = getSet(key), es = setEssays(key);
    var nodes = [topbar("#/s/" + sid + "/ch", s.name)];
    var idx = chapters(sid).indexOf(c);
    var head = h("div", { class: "card full" }, h("div", { class: "eyebrow", text: c ? "第 " + (idx + 1) + " 章" : s.name }), h("div", { class: "title", text: set.title }));
    if (c) head.appendChild(h("div", { class: "muted", text: "先讀完下面的重點，再寫本章考古題。" }));
    nodes.push(head);
    if (c) {
      var rv = h("div", { class: "card col-l" }, h("div", { class: "h2", text: "考點複習" })), rr = h("div", { class: "rows" });
      c.sections.forEach(function (sec, i) {
        var sq = set.items.filter(function (it) { return it.q.sec === sec.id; }), mq = sq.length, sc = counts(sq);
        var mk = (S.marks[mkey(sid, sec.id)] || []).length;
        var qs = !mq ? "" : sc.done === 0 ? "選擇題 " + mq + "・未作答" : sc.done >= mq ? "選擇題 " + mq + "・已做完" + (sc.wrong ? "（錯 " + sc.wrong + "）" : "") : "選擇題 " + sc.done + "/" + mq + " 已做";
        var rp = S.pos["rd:" + sid + ":" + sec.id], rs = !rp ? "" : rp.fin ? "已讀完" : rp.pc ? "讀到 " + rp.pc + "%" : "";
        var sub = [sec.text ? "課文" : "重點條列", rs, qs, mk ? "畫線 " + mk : ""].filter(Boolean).join("・");
        rr.appendChild(h("a", { class: "row", href: "#/rd/" + sid + "/" + cid + "/" + sec.id },
          h("div", null, h("div", { class: "small", text: (idx + 1) + "-" + (i + 1) }), h("div", { class: "nm", text: sec.title }), h("div", { class: "sub", text: sub })),
          mq && sc.done >= mq ? h("span", { class: "pill " + (sc.wrong ? "red" : "green"), text: sc.wrong ? "錯 " + sc.wrong : "✓" }) : h("span", { class: "go", text: "›" })));
      });
      rv.appendChild(rr);
      nodes.push(rv);
    }
    var ct = counts(set.items), la = lastAttempt(key);
    var mc = h("div", { class: "card" }, h("div", { class: "h2", text: "本章選擇題" }),
      h("div", { class: "muted", text: set.items.length ? set.items.length + " 題・已做 " + ct.done + "・錯 " + ct.wrong + (la ? "・上次紙本答對 " + la.correct + "/" + la.total : "") : "目前考卷裡還沒有對應這章的選擇題，傳更多考卷就會補上。" }));
    if (set.items.length) mc.appendChild(h("div", { class: "btns" }, pracBtns(key, set.items.length).concat([
      h("a", { class: resumeN(key, set.items.length) ? "btn soft" : "btn", href: "#/print/" + key, text: "列印本章" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" })])));
    nodes.push(mc);
    if (es.length) {
      var ec = h("div", { class: "card" }, h("div", { class: "h2", text: "本章申論題" }));
      var rows = h("div", { class: "rows" });
      es.forEach(function (x) {
        var r = S.essay[x.id] && S.essay[x.id].rate;
        rows.appendChild(h("a", { class: "row", href: "#/es/" + x.id }, h("div", null, h("div", { class: "sub", text: x.src }), h("div", { text: x.q.length > 46 ? x.q.slice(0, 46) + "…" : x.q })),
          r === "ok" ? h("span", { class: "pill green", text: "掌握" }) : r === "weak" ? h("span", { class: "pill red", text: "加強" }) : h("span", { class: "go", text: "›" })));
      });
      ec.appendChild(rows);
      ec.appendChild(h("div", { class: "btns" }, h("a", { class: "btn soft", href: "#/print/" + key + "/es", text: "列印本章申論題" })));
      nodes.push(ec);
    }
    show.apply(null, nodes);
  }

  // ---------- 考卷 ----------
  function viewExam(id) {
    var e = exam(id), key = "e:" + id, set = getSet(key), ct = counts(set.items), la = lastAttempt(key);
    show(topbar("#/s/" + e.subject + "/ex", subj(e.subject).name),
      h("div", { class: "card" }, h("div", { class: "eyebrow", text: e.title }), h("div", { class: "title", text: e.short + " " + e.name }),
        h("div", { class: "muted", text: e.questions.length + " 題・" + (e.perScore ? "每題 " + e.perScore + " 分" : (e.part || "以百分制計分")) + "・已做 " + ct.done + "・錯 " + ct.wrong }),
        la ? h("div", { style: "margin-top:10px" }, h("span", { class: "verdict " + (la.score >= 60 ? "ok" : "no"), text: "上次 " + la.score + " 分" })) : null,
        h("div", { class: "btns" }, pracBtns(key, set.items.length).concat([h("a", { class: resumeN(key, set.items.length) ? "btn soft" : "btn", href: "#/print/" + key, text: "列印試卷" }), h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" })]))));
  }

  // ---------- 題目劃記（作答時的鉛筆線、刪去法、訂正畫線） ----------
  // S.qm[容器] = [{id,f,o,q,ts}]：容器是題目 id「考卷#題」或短文 id「考卷@起始題號」；
  //   f：q 題幹、o0–o3 選項、g 短文、n 我的訂正；o 是該段文字裡的起點，q 是原句（文字改了以原句重新找位置）。
  // S.qx[題目 id] = {o:[被劃掉的選項序號], ts}（刪去法）。兩者都會雲端同步，刪除的線記在 S.del。
  var qmode = false, qshow = {};
  function pkey(it) { return it.q.g ? it.e.id + "@" + it.q.g : null; }
  function qxOf(k) { return (S.qx[k] && S.qx[k].o) || []; }
  function hasQm(it) {
    var k = qid(it.e, it.n), pk = pkey(it);
    return (S.qm[k] || []).filter(function (m) { return m.f !== "n"; }).length + (pk ? (S.qm[pk] || []).length : 0) + qxOf(k).length;
  }
  function toggleX(k, i) {
    var o = qxOf(k).slice(), at = o.indexOf(i);
    if (at >= 0) o.splice(at, 1); else o.push(i);
    S.qx[k] = { o: o, ts: Date.now() }; save();
  }
  // 把一段文字畫上線：on＝可以選字畫線；show＝顯示已畫的線
  // 克漏字空格「_____ 11」：保留原字（畫線位置不變），畫面上改顯示成方框題號；cur＝目前這題 {n, t}
  var BLANK = /_{3,}\s*(\d{1,2})/g;
  function blankNodes(s, cur) {
    if (!cur || s.indexOf("___") < 0) return [document.createTextNode(s)];
    var out = [], i = 0, m; BLANK.lastIndex = 0;
    while ((m = BLANK.exec(s))) {
      if (m.index > i) out.push(document.createTextNode(s.slice(i, m.index)));
      var on = +m[1] === cur.n;
      out.push(h("span", { class: "blank" + (on ? " cur" : ""), "data-n": on && cur.t ? m[1] + " " + cur.t : m[1] }, h("span", { class: "bt", text: m[0] })));
      i = m.index + m[0].length;
    }
    if (i < s.length) out.push(document.createTextNode(s.slice(i)));
    return out;
  }
  function mkText(tag, cls, text, c, f, on, show, cur) {
    var el = h(tag, { class: cls + (on ? " mk-on" : ""), "data-mc": c, "data-mf": f });
    text = text || "";
    var n = text.length, at = new Array(n), moved = false;
    if (show) (S.qm[c] || []).forEach(function (m) {
      if (m.f !== f) return;
      var p = nearest(text, m.q, m.o); if (p < 0) return;
      if (p !== m.o) { m.o = p; moved = true; }
      for (var j = p; j < p + m.q.length && j < n; j++) at[j] = m;
    });
    if (moved) save();
    var k = 0;
    while (k < n) {
      var j = k; while (j < n && at[j] === at[k]) j++;
      var t = blankNodes(text.slice(k, j), cur);
      if (at[k]) el.appendChild(h("mark", { class: f === "n" ? "qhl" : "qul", "data-id": at[k].id }, t));
      else t.forEach(function (x) { el.appendChild(x); });
      k = j;
    }
    return el;
  }
  function refreshFrom(el) { for (var e = el; e; e = e.parentElement) if (e._rf) return e._rf(); }
  var qbar = null, qsel = null, qtimer = null;
  function qBar(btns) {
    if (!qbar) { qbar = h("div", { class: "selbar" }); document.body.appendChild(qbar); }
    qbar.replaceChildren.apply(qbar, btns.map(function (b) {
      return h("button", { class: "btn" + (b[2] ? " soft" : ""), text: b[0], onpointerdown: function (ev) { ev.preventDefault(); }, onclick: b[1] });
    }));
    qbar.hidden = false;
  }
  function qHide() { if (qbar) qbar.hidden = true; qsel = null; }
  function qAdd() {
    var s = qsel; qHide(); if (!s) return;
    (S.qm[s.c] = S.qm[s.c] || []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), f: s.f, o: s.o, q: s.q, ts: Date.now() });
    save();
    var w = window.getSelection(); if (w) w.removeAllRanges();
    refreshFrom(s.el);
  }
  function qErase(el, c, id) {
    qHide();
    S.qm[c] = (S.qm[c] || []).filter(function (m) { return m.id !== id; });
    if (!S.qm[c].length) delete S.qm[c];
    S.del[id] = Date.now(); save(); refreshFrom(el);
  }
  document.addEventListener("selectionchange", function () {
    var w = window.getSelection();
    if (!w || w.isCollapsed || !w.rangeCount) { if (qsel && qsel.q) { clearTimeout(qtimer); qtimer = setTimeout(function () { if (qsel && qsel.q) qHide(); }, 350); } return; }
    var r = w.getRangeAt(0), sn = r.startContainer, se = sn.nodeType === 1 ? sn : sn.parentElement;
    var el = se && se.closest ? se.closest("[data-mf].mk-on") : null; if (!el) return;
    var e = r.endContainer, eo = r.endOffset;
    if (!el.contains(e)) { e = el; eo = el.childNodes.length; }   // 跨段時只取第一段
    var r0 = document.createRange(); r0.setStart(el, 0); r0.setEnd(sn, r.startOffset);
    var r1 = document.createRange(); r1.setStart(el, 0); r1.setEnd(e, eo);
    var st = r0.toString().length, txt = el.textContent.slice(st, r1.toString().length);
    var lead = txt.length - txt.replace(/^\s+/, "").length; txt = txt.trim(); st += lead;
    if (!txt) return;
    clearTimeout(qtimer);
    qsel = { el: el, c: el.getAttribute("data-mc"), f: el.getAttribute("data-mf"), o: st, q: txt };
    qBar([[el.getAttribute("data-mf") === "n" ? "畫重點" : "畫線", qAdd]]);
  });
  // 點已畫的線：可以擦掉（只在可畫線的區域）
  document.addEventListener("click", function (ev) {
    var mk = ev.target.closest ? ev.target.closest("mark[data-id]") : null;
    var el = mk && mk.closest("[data-mf].mk-on");
    if (!el) { if (qbar && !qbar.hidden && !(qsel && qsel.q) && !(qbar.contains(ev.target))) qHide(); return; }
    var w = window.getSelection(); if (w && !w.isCollapsed) return;
    ev.preventDefault(); ev.stopPropagation();
    var c = el.getAttribute("data-mc"), id = mk.getAttribute("data-id");
    qsel = { erase: true };
    qBar([["擦掉這條線", function () { qErase(el, c, id); }], ["取消", qHide, 1]]);
  }, true);

  // 選項：劃記模式時不是按鈕（點了不會作答），點字母可以劃掉選項
  function optEl(it, i, cls, fn, mode, show) {
    var k = qid(it.e, it.n), x = show && qxOf(k).indexOf(i) >= 0, q = it.q;
    var t = mkText("span", "t", q.o[i], k, "o" + i, mode, show);
    cls = "opt " + (cls || "") + (x ? " x" : "");
    if (mode) {
      var L = h("button", { class: "L", type: "button", "aria-label": (x ? "恢復選項 " : "劃掉選項 ") + LET[i], text: LET[i], onclick: function () { toggleX(k, i); refreshFrom(L); } });
      return h("div", { class: cls + " mk" }, L, t);
    }
    // 作答後不是按鈕：可以點選項裡的字查單字
    if (!fn) return h("div", { class: cls + " done" }, h("span", { class: "L", text: LET[i] }), t);
    return h("button", { class: cls, onclick: fn }, h("span", { class: "L", text: LET[i] }), t);
  }
  // 短文：手機上放在可捲動的框裡（題目留在下方），克漏字自動捲到目前的空格；「全文」可展開
  var psgTop = {}, psgFull = false;
  function psgEl(it, open, mode, show, done) {
    var t = passage(it); if (!t) return null;
    var pk = pkey(it), n = qno(it), q = it.q, cloze = !q.q;
    var cur = { n: n, t: done ? (Array.isArray(q.a) ? q.a : [q.a]).map(function (i) { return q.o[i]; }).join(" / ") : "" };
    var body = mkText("div", "psg-t", t, pk, "g", mode, show, cur);
    var box = h("div", { class: "psg-box" + (psgFull ? " full" : ""), onscroll: function () { psgTop[pk] = box.scrollTop; } }, body);
    var tg = h("button", { class: "link psg-tg", type: "button", text: psgFull ? "縮小" : "看全文", onclick: function () { psgFull = !psgFull; box.classList.toggle("full", psgFull); tg.textContent = psgFull ? "縮小" : "看全文"; } });
    var d = h("details", { class: "psg" }, h("summary", null, h("span", { text: (cloze ? "克漏字" : "短文") + "（第 " + q.g + " 題起）" })), box, tg);
    if (open || mode) d.open = true;
    requestAnimationFrame(function () {
      if (psgFull) return;
      var b = cloze && body.querySelector(".blank.cur");
      if (b) box.scrollTop = Math.max(0, b.offsetTop - box.clientHeight / 3);
      else if (psgTop[pk] != null) box.scrollTop = psgTop[pk];
    });
    return d;
  }
  function modeBtn(on, fn) {
    return h("button", { class: "chip qm-btn", "aria-pressed": String(on), text: on ? "✏️ 劃記中" : "✏️ 劃記", onclick: fn });
  }

  // ---------- 英文單字（data/vocab.js 由單字程式匯出，第一次用到英文題才載入） ----------
  // KS.vocab[字] = [詞性, 中文, 例句({}＝單字), 例句中文, 題庫, 題號, 答案標記]
  // S.vw[字] = {src, ts, sent?, del?}：讀題時加入的生字，回報給 Claude 補進單字程式（會雲端同步）
  var vocTag = null, vocWait = [], PHR = null, ANS = null;
  var SAME = { "113調查三等": "113司法三等", "114國安三等": "114警察三等", "114調查三等": "114司法三等", "115國安三等": "115警察三等", "115調查三等": "115司法三等" };
  var IRR = { sought: "seek", fled: "flee", froze: "freeze", frozen: "freeze", bought: "buy", caught: "catch", taught: "teach", thought: "think", brought: "bring", made: "make", left: "leave", felt: "feel", kept: "keep", held: "hold", told: "tell", found: "find", built: "build", spent: "spend", led: "lead", grew: "grow", grown: "grow", known: "know", shown: "show", taken: "take", given: "give", written: "write", chosen: "choose", children: "child", women: "woman", men: "man", lives: "life", arose: "arise", arisen: "arise", ran: "run", began: "begin", begun: "begin", fell: "fall", fallen: "fall", struck: "strike", sent: "send", sold: "sell", stood: "stand", understood: "understand", won: "win", wore: "wear", worn: "wear", hid: "hide", hidden: "hide", lay: "lie", laid: "lay", paid: "pay", met: "meet", lost: "lose", dealt: "deal", meant: "mean", sought: "seek", shook: "shake", rose: "rise", risen: "rise", broke: "break", broken: "break", spoke: "speak", spoken: "speak", drove: "drive", driven: "drive", ate: "eat", eaten: "eat", fought: "fight", forgot: "forget", forgotten: "forget", forbade: "forbid", forbidden: "forbid", bore: "bear", born: "bear", torn: "tear", swore: "swear", bent: "bend", wept: "weep", slept: "sleep", swept: "sweep", crept: "creep", bled: "bleed", fed: "feed", fled: "flee", bred: "breed", stuck: "stick", struck: "strike", dug: "dig", hung: "hang", wound: "wind", ground: "grind", bound: "bind", sank: "sink", sunk: "sink", shrank: "shrink", shrunk: "shrink" };
  function vocab(cb) {
    if (KS.vocab) return KS.vocab;
    if (cb) vocWait.push(cb);
    if (!vocTag) {
      vocTag = document.createElement("script"); vocTag.src = "data/vocab.js";
      vocTag.onload = function () { var w = vocWait; vocWait = []; w.forEach(function (f) { f(); }); };
      vocTag.onerror = function () { vocTag = null; vocWait = []; toast("單字庫載入失敗"); };
      document.head.appendChild(vocTag);
    }
    return null;
  }
  function bankOf(e) { var b = (e.short || "").replace(/\s+/g, ""); return SAME[b] || b; }
  function vIndex() {
    if (ANS || !KS.vocab) return;
    ANS = {}; PHR = [];
    Object.keys(KS.vocab).forEach(function (w) {
      var d = KS.vocab[w], f = d[6];
      if (/\s/.test(w)) PHR.push(w);
      if (f) (ANS[d[4] + "#" + (f === 1 ? d[5] : f)] = ANS[d[4] + "#" + (f === 1 ? d[5] : f)] || []).push(w);
    });
  }
  function lookup(raw) {
    var D = KS.vocab; if (!D || !raw) return null;
    var w = raw.toLowerCase().replace(/’/g, "'").replace(/'s$/, "").replace(/^'+|'+$/g, "");
    var c = [w];
    if (IRR[w]) c.push(IRR[w]);
    if (/ies$/.test(w)) c.push(w.slice(0, -3) + "y");
    if (/es$/.test(w)) c.push(w.slice(0, -2));
    if (/s$/.test(w)) c.push(w.slice(0, -1));
    if (/ied$/.test(w)) c.push(w.slice(0, -3) + "y");
    if (/ed$/.test(w)) { c.push(w.slice(0, -2), w.slice(0, -1)); if (/(.)\1ed$/.test(w)) c.push(w.slice(0, -3)); }
    if (/ing$/.test(w)) { c.push(w.slice(0, -3), w.slice(0, -3) + "e"); if (/(.)\1ing$/.test(w)) c.push(w.slice(0, -4)); }
    if (/ier$|iest$/.test(w)) c.push(w.replace(/i(er|est)$/, "y"));
    if (/er$/.test(w)) c.push(w.slice(0, -2), w.slice(0, -1));
    if (/est$/.test(w)) c.push(w.slice(0, -3), w.slice(0, -2));
    if (w.indexOf("-") > 0) c.push(w.replace(/-/g, " "), w.replace(/-/g, ""));
    for (var i = 0; i < c.length; i++) if (D[c[i]]) return { w: c[i], d: D[c[i]] };
    return null;
  }
  function tokens(t) { return (t || "").match(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/g) || []; }
  function phrasesIn(t) {
    vIndex(); var low = " " + (t || "").toLowerCase().replace(/[^a-z'’-]+/g, " ") + " ";
    return PHR.filter(function (p) { return low.indexOf(" " + p + " ") >= 0; });
  }
  function vwOn(w) { var x = S.vw[w]; return !!(x && !x.del); }
  function vwBtn(w, src, big) {
    var b = h("button", { class: big ? "btn" : "vstar", type: "button" });
    function upd() { var on = vwOn(w); b.textContent = on ? (big ? "✓ 已加入生字" : "✓生字") : (big ? "＋ 加入生字" : "＋生字"); b.setAttribute("aria-pressed", String(on)); }
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (vwOn(w)) S.vw[w] = { del: 1, ts: Date.now() }; else S.vw[w] = { src: src, ts: Date.now() };
      save(); upd(); toast(vwOn(w) ? "已加入生字，會附在回報裡" : "已移出生字");
    });
    upd(); return b;
  }
  function qLabel(it) { return it.e.short + " 第 " + qno(it) + " 題"; }
  // 克漏字：從短文找出這一格所在的句子，填回答案
  function clozeSentence(it) {
    var t = passage(it); if (!t || it.q.q) return "";
    var m = new RegExp("_{3,}\\s*" + qno(it) + "(?!\\d)").exec(t); if (!m) return "";
    var a = m.index, b = m.index + m[0].length;
    while (a > 0 && !/[.?!\n]/.test(t[a - 1])) a--;
    while (b < t.length && !/[.?!\n]/.test(t[b])) b++;
    var q = it.q, ans = (Array.isArray(q.a) ? q.a : [q.a]).map(function (i) { return q.o[i]; }).join(" / ");
    return (t.slice(a, m.index) + "【" + ans + "】" + t.slice(m.index + m[0].length, b + 1)).replace(/_{3,}\s*\d+/g, "___").trim();
  }
  function vRow(w, d, tag, src) {
    return h("div", { class: "vrow" },
      tag ? h("span", { class: "vtag" + (tag === "✓" ? " ok" : ""), text: tag }) : h("span", { class: "vtag" }),
      h("div", { class: "vw" }, h("b", { text: w }), d ? h("span", { class: "pos", text: " " + d[0] }) : null, h("div", { class: "zh", text: d ? d[1] : "單字庫還沒有" })),
      vwBtn(w, src));
  }
  function vocabBox(it) {
    if (it.e.subject !== "eng") return null;
    var box = h("details", { class: "vbox", open: true });
    function render() {
      var D = vocab(render);
      box.replaceChildren(h("summary", { text: D ? "本題單字・點題目或選項裡的字也能查" : "本題單字（載入中…）" }));
      if (!D) return;
      vIndex();
      var q = it.q, ans = Array.isArray(q.a) ? q.a : [q.a], src = qLabel(it), seen = {}, rows = [];
      var hit = ANS[bankOf(it.e) + "#" + qno(it)] || [];
      function add(raw, tag, keep) {
        var r = lookup(raw), w = r ? r.w : raw.toLowerCase();
        if (seen[w] || (!r && !keep)) return; seen[w] = 1;
        rows.push(vRow(w, r && r.d, tag, src));
      }
      function scan(t, tag, keep) {
        var ph = phrasesIn(t), inPh = {};
        ph.forEach(function (p) { add(p, tag); p.split(" ").forEach(function (x) { inPh[x] = 1; }); });
        var tk = tokens(t), one = keep && tk.length === 1;
        tk.forEach(function (x) { if (!inPh[x.toLowerCase()]) add(x, tag, one && x.length > 2); });
      }
      // 句意：答案字的例句若是考卷原句，就是這題的翻譯
      var tr = null;
      hit.forEach(function (w) { var d = D[w]; if (!tr && d[3] && d[2].split(" ").length >= 6) tr = d; });
      var cs = clozeSentence(it);
      if (cs) box.appendChild(h("div", { class: "vsent" }, h("div", { text: cs }), tr ? h("div", { class: "zh", text: tr[3] }) : null));
      else if (tr && q.q) box.appendChild(h("div", { class: "vsent" }, h("div", { class: "zh", text: "句意：" + tr[3] })));
      ans.forEach(function (i) { scan(q.o[i], "✓", true); });
      hit.forEach(function (w) { add(w, "✓"); });
      q.o.forEach(function (o, i) { if (ans.indexOf(i) < 0) scan(o, LET[i], true); });
      scan(q.q, "");
      if (cs) scan(cs, "");
      if (!rows.length) box.appendChild(h("div", { class: "small", text: "這題沒有收錄的單字。" }));
      rows.forEach(function (r) { box.appendChild(r); });
    }
    render();
    return box;
  }
  // 點英文字查中文（作答後的選項、題目、短文；劃記模式時不查）
  var vpop = null;
  function vHide() { if (vpop) { vpop.remove(); vpop = null; } }
  function wordAt(x, y) {
    var node, off;
    if (document.caretRangeFromPoint) { var r = document.caretRangeFromPoint(x, y); if (!r) return null; node = r.startContainer; off = r.startOffset; }
    else if (document.caretPositionFromPoint) { var p = document.caretPositionFromPoint(x, y); if (!p) return null; node = p.offsetNode; off = p.offset; }
    if (!node || node.nodeType !== 3) return null;
    var s = node.data, a = off, b = off, re = /[A-Za-z'’-]/;
    while (a > 0 && re.test(s[a - 1])) a--;
    while (b < s.length && re.test(s[b])) b++;
    var w = s.slice(a, b).replace(/^['’-]+|['’-]+$/g, "");
    return /[A-Za-z]{2,}/.test(w) ? w : null;
  }
  function showWord(raw, src) {
    if (!vocab(function () { showWord(raw, src); })) return;
    vHide();
    var r = lookup(raw), w = r ? r.w : raw.toLowerCase(), d = r && r.d;
    vpop = h("div", { class: "vpop", role: "dialog", "aria-label": "查單字" },
      h("div", { class: "vp-h" }, h("b", { text: w }), d ? h("span", { class: "pos", text: d[0] }) : null),
      h("div", { class: "zh", text: d ? d[1] : "單字庫還沒有這個字，可以加入生字讓 Claude 補上。" }),
      h("div", { class: "vp-b" }, vwBtn(w, src, true), h("button", { class: "btn soft", type: "button", text: "關閉", onclick: vHide })));
    document.body.appendChild(vpop);
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (vpop && vpop.contains(t)) return;
    var host = t.closest ? t.closest(".eng-lk .qtext, .eng-lk .psg-t, .eng-lk .opt.done .t") : null;
    if (!host || host.classList.contains("mk-on") || (host.closest(".mk-on"))) { vHide(); return; }
    var sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
    var w = wordAt(ev.clientX, ev.clientY); if (!w) { vHide(); return; }
    var card = host.closest(".eng-lk");
    showWord(w, card.getAttribute("data-src") || "");
  });

  // ---------- 手機作答（逐題） ----------
  var picked = {};
  function viewPractice(key, n) {
    var set = useSet(key); if (!set || !set.items.length) return go("#/");
    var it = set.items[n - 1]; if (!it) return go(set.back);
    var PK = "pr:" + key, pr = S.pos[PK], k = qid(it.e, it.n), q = it.q;
    // 接續作答：把這一輪已答的選項帶回來（換裝置也會同步）
    if (key.charAt(0) !== "w") {
      if (pr && !pr.done && pr.a) Object.keys(pr.a).forEach(function (x) { if (picked[x] == null) picked[x] = pr.a[x]; });
      var mine = {}; set.items.forEach(function (x) { var y = qid(x.e, x.n); if (picked[y] != null) mine[y] = picked[y]; });
      if (!pr || pr.done || pr.n !== n || Object.keys(mine).length !== Object.keys(pr.a || {}).length) setPos(PK, { n: n, a: mine });
      setLast("#/p/" + key + "/" + n, set.title, subj(set.sid).name + "・線上作答 第 " + n + " / " + set.items.length + " 題");
    }
    var pk = picked[k];
    // 上次的劃記：重寫時預設隱藏，作答後、開劃記或點「顯示」才出現
    var vis = qmode || pk != null || !!qshow[k], old = hasQm(it);
    var opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) {
      var cls = pk == null ? "" : ok(q, i) ? "right" : i === pk ? "wrong" : "dim";
      opts.appendChild(optEl(it, i, cls, pk == null ? function () { picked[k] = i; record(it.e, it.n, ok(q, i)); save(); viewPractice(key, n); } : null, qmode, vis));
    });
    var tools = h("div", { class: "qtools" }, modeBtn(qmode, function () { qmode = !qmode; qHide(); viewPractice(key, n); }),
      !vis && old ? h("button", { class: "link", text: "顯示上次劃記（" + old + "）", onclick: function () { qshow[k] = true; viewPractice(key, n); } }) : null);
    var eng = it.e.subject === "eng";
    var card = h("div", { class: "card" + (eng ? " eng-lk" : ""), "data-src": eng ? qLabel(it) : null },
      h("div", { class: "qno" }, h("span", { text: n + " / " + set.items.length }), h("span", { text: it.e.short + " 第 " + qno(it) + " 題" })),
      tools,
      qmode ? h("div", { class: "small qm-hint", text: "長按選字畫線，點畫過的線可擦掉；點選項字母可劃掉選項。作答前先關掉劃記。" }) : null,
      psgEl(it, true, qmode, vis, pk != null), q.q ? mkText("div", "qtext", q.q, k, "q", qmode, vis) : null, opts);
    card._rf = function () { viewPractice(key, n); };
    if (pk != null) {
      card.appendChild(h("div", { style: "margin-top:14px" }, h("span", { class: "verdict " + (ok(q, pk) ? "ok" : "no"), text: ok(q, pk) ? "答對了" : "答錯，正解是 " + ansText(q) })));
      if (q.note) card.appendChild(h("div", { class: "small", style: "margin-top:6px", text: "考選部更正：" + q.note }));
      if (q.x) card.appendChild(h("div", { class: "small xexp", style: "margin-top:6px;white-space:pre-line", text: "解析：" + q.x }));
      var vb = vocabBox(it); if (vb) card.appendChild(vb);
      card.appendChild(h("p", null, h("a", { class: "link-out", href: search(q), target: "_blank", rel: "noopener", text: "到阿摩看考生詳解 ↗" })));
      card.appendChild(noteBox(it));
    }
    var last = n >= set.items.length, nx = last ? nextTarget(key, set) : null;
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn soft", text: "上一題", disabled: n <= 1, onclick: function () { qHide(); vHide(); go("#/p/" + key + "/" + (n - 1)); } }),
      h("button", { class: "btn", text: last ? nx.label : "下一題", onclick: function () { qHide(); vHide(); if (last) { Object.keys(picked).forEach(function (x) { delete picked[x]; }); delete frozen[key]; if (key.charAt(0) !== "w") setPos("pr:" + key, { n: 1, done: true }); go(nx.href); } else go("#/p/" + key + "/" + (n + 1)); } })));
    show(topbar(set.back, set.title), card);
  }
  // 線上作答做完後要去哪：節 → 下一節（最後一節 → 下一章第一節）；章 → 下一章；其他回原處
  function nextTarget(key, set) {
    var p = key.split(":"), res = { href: set.back, label: "完成" };
    if (p[0] !== "c" || p[2] === "_none") return res;
    var chs = chapters(p[1]), ci = chs.indexOf(chapter(p[1], p[2])); if (ci < 0) return res;
    var secs = chs[ci].sections, nextCh = chs[ci + 1];
    function firstOf(c) { return c.sections.length ? "#/rd/" + p[1] + "/" + c.id + "/" + c.sections[0].id : "#/c/" + p[1] + "/" + c.id; }
    if (p[3]) {
      var si = secs.map(function (x) { return x.id; }).indexOf(p[3]);
      if (si >= 0 && si < secs.length - 1) return { href: "#/rd/" + p[1] + "/" + p[2] + "/" + secs[si + 1].id, label: "完成，下一節 ›" };
    }
    if (nextCh) return { href: p[3] ? firstOf(nextCh) : "#/c/" + p[1] + "/" + nextCh.id, label: "完成，下一章 ›" };
    return res;
  }
  // 我的訂正：寫完後以閱讀模式顯示（隨內容長高，可長按畫重點）；按「編輯」改字，「全螢幕」寫長篇詳解
  function grow(ta) { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 2) + "px"; }
  function noteBox(it) {
    var k = qid(it.e, it.n), box = h("div", { class: "nbox" }), editing = !(S.notes[k] || "").trim();
    function setNote(v) { if ((S.notes[k] || "") === v) return; S.notes[k] = v; S.nts[k] = Date.now(); save(); }
    function full() {
      var ta = h("textarea", { class: "full-ta", placeholder: "貼上喜歡的考生詳解，或寫自己的筆記", oninput: function () { setNote(ta.value); } });
      ta.value = S.notes[k] || "";
      var ov = h("div", { class: "fullov", role: "dialog", "aria-label": "我的訂正" },
        h("div", { class: "full-head" }, h("div", { class: "h2", text: "我的訂正" }), h("span", { class: "small", text: it.e.short + " 第 " + qno(it) + " 題" }),
          h("button", { class: "btn", text: "完成", onclick: function () { setNote(ta.value); ov.remove(); document.body.classList.remove("noscroll"); editing = !(S.notes[k] || "").trim(); render(); } })),
        ta);
      document.body.appendChild(ov); document.body.classList.add("noscroll"); ta.focus();
    }
    function render() {
      box.replaceChildren();
      var txt = S.notes[k] || "", btns = h("span", { class: "nbtns" });
      if (editing) {
        var ta = h("textarea", { class: "grow", placeholder: "貼上喜歡的考生詳解，或寫自己的筆記", oninput: function () { setNote(ta.value); grow(ta); } });
        ta.value = txt;
        btns.appendChild(h("button", { class: "link", text: "全螢幕", onclick: function () { setNote(ta.value); full(); } }));
        btns.appendChild(h("button", { class: "link strong", text: "完成", onclick: function () { setNote(ta.value); if (!ta.value.trim()) return toast("還沒寫內容"); editing = false; render(); } }));
        box.appendChild(h("div", { class: "nhead" }, h("span", { class: "small", text: "我的訂正" }), btns));
        box.appendChild(ta);
        requestAnimationFrame(function () { grow(ta); });
      } else {
        btns.appendChild(h("button", { class: "link", text: "全螢幕", onclick: full }));
        btns.appendChild(h("button", { class: "link strong", text: "編輯", onclick: function () { editing = true; render(); } }));
        box.appendChild(h("div", { class: "nhead" }, h("span", { class: "small", text: "我的訂正・長按選字可畫重點" }), btns));
        box.appendChild(mkText("div", "nview", txt, k, "n", true, true));
      }
      var cb = h("input", { type: "checkbox", onchange: function () {
        if (cb.checked) { if (!(S.notes[k] || "").trim()) { cb.checked = false; return toast("先寫訂正內容"); } S.repq[k] = { sent: false, ts: Date.now() }; toast("已加入回報清單"); }
        else delete S.repq[k];
        save();
      } });
      cb.checked = !!(S.repq[k] && !S.repq[k].sent);
      box.appendChild(h("label", { class: "rep-ck" }, cb, h("span", { text: "回報給 Claude，補進課文" })));
    }
    box._rf = render; render();
    return box;
  }

  // ---------- 紙本對答案 ----------
  var drafts = {};
  function viewGrade(key) {
    var set = useSet(key); if (!set || !set.items.length) return go("#/");
    var ans = drafts[key] = drafts[key] || {};
    var cnt = h("span");
    function upd() { cnt.textContent = "已輸入 " + Object.keys(ans).length + " / " + set.items.length; }
    var grid = h("div");
    set.items.forEach(function (it, idx) {
      var n = idx + 1, row = h("div", { class: "arow" }, h("span", { class: "n", text: String(n) })), bs = [];
      LET.forEach(function (L, i) {
        var b = h("button", { class: "bub", "aria-pressed": String(ans[n] === i), "aria-label": "第" + n + "題" + L, text: L, onclick: function () {
          if (ans[n] === i) delete ans[n]; else ans[n] = i;
          bs.forEach(function (x, j) { x.setAttribute("aria-pressed", String(ans[n] === j)); }); upd();
        } });
        bs.push(b); row.appendChild(b);
      });
      grid.appendChild(row);
    });
    upd();
    show(topbar(set.back, set.title), h("div", { class: "card" },
      h("div", { class: "h2", text: "輸入你在紙上寫的答案" }), h("div", { class: "small", text: "題號和列印出來的順序一樣。沒寫的留空。" }),
      h("div", { class: "sticky" }, cnt, h("span", { class: "small", text: set.title })), grid,
      h("div", { class: "btns" }, h("button", { class: "btn", text: "對答案", onclick: function () {
        var okc = 0;
        set.items.forEach(function (it, idx) { var a = ans[idx + 1], r = a != null && ok(it.q, a); record(it.e, it.n, r); if (r) okc++; });
        S.attempts.push({ set: key, ts: Date.now(), correct: okc, total: set.items.length, score: set.perScore ? okc * set.perScore : Math.round(okc / set.items.length * 100), ans: JSON.parse(JSON.stringify(ans)), items: set.items.map(function (it) { return qid(it.e, it.n); }) });
        save(); delete drafts[key]; delete frozen[key]; go("#/r/" + key);
      } }))));
  }
  function viewResult(key) {
    var set = getSet(key), a = lastAttempt(key); if (!set || !a) return go("#/");
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: set.title }),
      h("div", { class: "score" }, String(a.score), h("small", { text: " 分　答對 " + a.correct + " / " + a.total })));
    var wl = h("div", { class: "card" });
    var its = a.items ? itemsFromIds(a.items) : set.items;
    var miss = its.map(function (it, i) { return { it: it, mine: a.ans[i + 1], n: i + 1 }; }).filter(function (x) { return x.mine == null || !ok(x.it.q, x.mine); });
    wl.appendChild(h("div", { class: "h2", text: miss.length ? "要訂正的題目（" + miss.length + "）" : "全對，太好了" }));
    miss.forEach(function (x) { wl.appendChild(wrongBlock(x.it, x.mine, x.n)); });
    show(topbar(set.back, set.title), card, wl);
  }
  function wrongBlock(it, mine, no) {
    var q = it.q, k = qid(it.e, it.n), wrap = h("div", { class: "wq" + (it.e.subject === "eng" ? " eng-lk" : ""), "data-src": it.e.subject === "eng" ? qLabel(it) : null }), mode = false, nb = noteBox(it);
    function render() {
      var opts = h("div", { class: "opts" });
      q.o.forEach(function (_, i) { opts.appendChild(optEl(it, i, ok(q, i) ? "right" : i === mine ? "wrong" : "dim", null, mode, true)); });
      wrap.replaceChildren(
        h("div", { class: "qno" }, h("span", { text: (no ? "第 " + no + " 題・" : "") + it.e.short + " #" + qno(it) }), h("span", { text: mine == null && no ? "未作答" : "" })),
        h("div", { class: "qtools" }, modeBtn(mode, function () { mode = !mode; qHide(); render(); })),
        psgEl(it, false, mode, true, true), q.q ? mkText("div", "qtext", q.q, k, "q", mode, true) : null, opts, q.note ? h("div", { class: "small", text: "考選部更正：" + q.note }) : null,
        q.x ? h("div", { class: "small xexp", style: "white-space:pre-line", text: "解析：" + q.x }) : null,
        vocabBox(it),
        h("p", null, h("a", { class: "link-out", href: search(q), target: "_blank", rel: "noopener", text: "到阿摩看考生詳解 ↗" })), nb);
    }
    wrap._rf = render; render();
    return wrap;
  }

  // ---------- 申論 ----------
  var revealed = {};
  function viewEssay(id) {
    var x = essay(id); if (!x) return go("#/");
    var back = "#/c/" + x.subject + "/" + (x.ch || "_none");
    var p = S.essay[id] || { pts: [] };
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: x.src }), h("div", { class: "qtext", text: x.q }));
    if (!revealed[id]) {
      card.appendChild(h("div", { class: "muted", text: "先在紙上寫完，再看骨架核對。" }));
      card.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "寫完了，看骨架", onclick: function () { revealed[id] = true; viewEssay(id); } })));
      return show(topbar(back, "回章節"), card);
    }
    var hit = x.pts.filter(function (_, i) { return p.pts && p.pts[i]; }).length;
    card.appendChild(h("div", { class: "h2", text: "寫到 " + hit + " / " + x.pts.length + " 段" }));
    card.appendChild(h("div", { class: "meter" }, h("i", { style: "width:" + Math.round(hit / x.pts.length * 100) + "%" })));
    var list = h("div");
    x.pts.forEach(function (pt, i) {
      var cb = h("input", { type: "checkbox", id: "pt_" + id + "_" + i, onchange: function (ev) {
        var cur = S.essay[id] || { pts: [] }; cur.pts = (cur.pts || []).slice(); cur.pts[i] = ev.target.checked; S.essay[id] = cur; save(); viewEssay(id);
      } });
      cb.checked = !!(p.pts && p.pts[i]);
      var kw = h("div", { class: "kw" }); pt.k.forEach(function (k) { kw.appendChild(h("span", { text: k })); });
      list.appendChild(h("div", { class: "pt" }, cb, h("label", { for: "pt_" + id + "_" + i }, h("div", { class: "h", text: pt.h }), kw, pt.n ? h("div", { class: "note", text: pt.n }) : null)));
    });
    card.appendChild(list);
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn green", text: "掌握了", onclick: function () { rate(id, "ok"); } }),
      h("button", { class: "btn red", text: "需加強", onclick: function () { rate(id, "weak"); } })));
    if (p.rate) card.appendChild(h("div", { class: "small", style: "margin-top:8px", text: "目前標記：" + (p.rate === "ok" ? "掌握" : "需加強") }));
    var sib = KS.essays.filter(function (y) { return y.subject === x.subject && y.ch === x.ch; }), i = sib.indexOf(x);
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn soft", text: "上一題", disabled: i <= 0, onclick: function () { go("#/es/" + sib[i - 1].id); } }),
      h("button", { class: "btn soft", text: "下一題", disabled: i >= sib.length - 1, onclick: function () { go("#/es/" + sib[i + 1].id); } })));
    show(topbar(back, "回章節"), card);
  }
  function rate(id, r) { var cur = S.essay[id] || { pts: [] }; cur.rate = r; cur.ts = Date.now(); S.essay[id] = cur; save(); toast(r === "ok" ? "標記為掌握" : "標記為需加強"); viewEssay(id); }

  // ---------- 課文閱讀（畫重點、備註） ----------
  // 課文格式：sec.text 是段落陣列；「## 」開頭是小標，「!! 」開頭是易錯提醒框，**字** 是粗體。
  // 沒有 text 的舊章節，用 sec.body 的條列當段落。
  // 畫線用「段落序號＋原句」定位；課文改寫後先找同段，再找全節，都找不到就列為「找不到原句」。
  function paras(sec) { return sec.text || sec.body || []; }
  // 圖表區塊（不能畫線，但算段落序號）：
  //  表格："表｜標題\n| 欄 | 欄 |\n|---|---|\n| 格 | 格 |"（標題可省略，直接以「| 」開頭）
  //  流程："::flow 標題\n步驟｜說明\n步驟｜說明"　時間軸："::timeline 標題\n年份｜事件"
  function parseBlock(raw) {
    var lines = raw.split("\n"), cap = "";
    if (raw.slice(0, 2) === "表｜" || raw.slice(0, 2) === "| ") {
      if (lines[0].slice(0, 2) === "表｜") cap = lines.shift().slice(2);
      var rows = lines.filter(function (l) { return /^\|/.test(l) && !/^\|[\s:|-]+\|?$/.test(l); })
        .map(function (l) { return l.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); }); });
      return { kind: "table", cap: cap, rows: rows };
    }
    var m = /^::(flow|timeline) ?(.*)$/.exec(lines[0]);
    if (m) return { kind: m[1], cap: m[2], items: lines.slice(1).filter(Boolean).map(function (l) { var i = l.indexOf("｜"); return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1)]; }) };
    return null;
  }
  function inline(t) {   // **粗體** 轉成節點
    var f = document.createDocumentFragment();
    t.split("**").forEach(function (x, i) { if (x) f.appendChild(i % 2 ? h("strong", { text: x }) : document.createTextNode(x)); });
    return f;
  }
  function renderBlock(b) {
    var fig = h("figure", { class: "fig fig-" + b.kind });
    if (b.cap) fig.appendChild(h("figcaption", { text: b.cap }));
    if (b.kind === "table") {
      var tb = h("table"), thead = h("thead"), tbody = h("tbody");
      b.rows.forEach(function (r, i) {
        var tr = h("tr");
        r.forEach(function (c, j) { tr.appendChild(h(i === 0 ? "th" : j === 0 ? "th" : "td", i > 0 && j === 0 ? { scope: "row" } : null, inline(c))); });
        (i === 0 ? thead : tbody).appendChild(tr);
      });
      tb.appendChild(thead); tb.appendChild(tbody);
      fig.appendChild(h("div", { class: "tbl" }, tb));
    } else if (b.kind === "flow") {
      var fl = h("div", { class: "flow" });
      b.items.forEach(function (it, i) {
        if (i) fl.appendChild(h("div", { class: "arrow", "aria-hidden": "true" }));
        fl.appendChild(h("div", { class: "step" }, h("div", { class: "st" }, inline(it[0])), it[1] ? h("div", { class: "sd" }, inline(it[1])) : null));
      });
      fig.appendChild(fl);
    } else {
      var ol = h("ol", { class: "tl" });
      b.items.forEach(function (it) { ol.appendChild(h("li", null, h("span", { class: "y", text: it[0] }), h("span", { class: "ev" }, inline(it[1])))); });
      fig.appendChild(ol);
    }
    return fig;
  }
  function parsePara(raw) {
    var blk = parseBlock(raw); if (blk) { blk.plain = ""; blk.bold = []; return blk; }
    var kind = "p";
    if (raw.slice(0, 3) === "## ") { kind = "h"; raw = raw.slice(3); }
    else if (raw.slice(0, 3) === "!! ") { kind = "tip"; raw = raw.slice(3); }
    var parts = raw.split("**"), plain = "", bold = [];
    parts.forEach(function (t, i) { if (i % 2) bold.push([plain.length, plain.length + t.length]); plain += t; });
    return { kind: kind, plain: plain, bold: bold };
  }
  function nearest(text, q, o) {
    var best = -1, at = text.indexOf(q);
    while (at >= 0) { if (best < 0 || Math.abs(at - o) < Math.abs(best - o)) best = at; at = text.indexOf(q, at + 1); }
    return best;
  }
  // 畫線存在 S.marks["科目:節id"]；回傳每條畫線目前的位置 {id: [段, 起點]}，找不到為 null
  function mkey(sid, xid) { return sid + ":" + xid; }
  function resolveMarks(list, ps) {
    var pos = {}, moved = false;
    list.forEach(function (m) {
      var at = ps[m.p] ? nearest(ps[m.p].plain, m.q, m.o) : -1, pp = m.p;
      if (at < 0) for (var j = 0; j < ps.length; j++) { at = nearest(ps[j].plain, m.q, m.o); if (at >= 0) { pp = j; break; } }
      pos[m.id] = at >= 0 ? [pp, at] : null;
      if (at >= 0 && (pp !== m.p || at !== m.o)) { m.p = pp; m.o = at; moved = true; }
    });
    if (moved) save();
    return pos;
  }
  function clip(t, n) { return t.length > n ? t.slice(0, n) + "…" : t; }
  var selPending = null, selTimer = null;
  function viewRead(sid, cid, xid) {
    var s = subj(sid), c = chapter(sid, cid), sec = section(sid, cid, xid);
    var secs = c.sections, si = secs.indexOf(sec), ci = chapters(sid).indexOf(c);
    var key = "c:" + sid + ":" + cid + ":" + xid, set = getSet(key), es = setEssays(key);
    var R = S.read, fs = R.fs || 18;
    var art = h("article", { class: "art" + (sec.text ? "" : " list"), style: "--rfs:" + fs + "px" });
    var mine = h("div"), MK = mkey(sid, xid);
    function paint() {
      var ps = paras(sec).map(parsePara), list = S.marks[MK] || [], pos = resolveMarks(list, ps);
      art.replaceChildren();
      ps.forEach(function (pp, i) {
        if (pp.rows || pp.items) return art.appendChild(renderBlock(pp));
        var n = pp.plain.length, b = new Array(n), m = new Array(n);
        pp.bold.forEach(function (r) { for (var k = r[0]; k < r[1]; k++) b[k] = 1; });
        list.forEach(function (mk) { var at = pos[mk.id]; if (at && at[0] === i) for (var k = at[1]; k < at[1] + mk.q.length && k < n; k++) m[k] = mk; });
        var el = h(pp.kind === "h" ? "h3" : "p", { class: pp.kind === "tip" ? "tip" : null, "data-p": String(i), id: pp.kind === "h" ? "h" + i : null });
        var k = 0;
        while (k < n) {
          var j = k; while (j < n && b[j] === b[k] && m[j] === m[k]) j++;
          var node = document.createTextNode(pp.plain.slice(k, j));
          if (b[k]) node = h("strong", null, node);
          if (m[k]) {
            var mk = m[k], end = pos[mk.id][1] + mk.q.length <= j;
            node = h("mark", { class: "hl" + (mk.note ? " has-note" : "") + (end ? " end" : ""), "data-m": mk.id, onclick: (function (x) { return function () { openMark(x); }; })(mk) }, node);
          }
          el.appendChild(node); k = j;
        }
        art.appendChild(el);
      });
      // 文末：我的重點
      mine.replaceChildren();
      if (!list.length) return;
      var box = h("div", { class: "card" }, h("div", { class: "h2", text: "我在這節畫的重點（" + list.length + "）" }));
      function ord(m) { var a = pos[m.id]; return a ? a[0] * 1e5 + a[1] : 1e9; }
      list.slice().sort(function (a, b) { return ord(a) - ord(b); }).forEach(function (mk) {
        box.appendChild(h("button", { class: "mine", onclick: function () {
          var t = art.querySelector('[data-m="' + mk.id + '"]');
          if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); setTimeout(function () { t.classList.remove("flash"); }, 1200); }
          else openMark(mk);
        } },
          h("div", { class: "q", text: "「" + clip(mk.q, 60) + "」" }),
          mk.note ? h("div", { class: "n", text: mk.note }) : null,
          !pos[mk.id] ? h("div", { class: "small", text: "課文已改寫，找不到這句原文" }) : null,
          mk.rep && !mk.sent ? h("span", { class: "pill blue", text: "待回報" }) : null));
      });
      mine.appendChild(box);
    }
    function openMark(mk) {
      var ta = h("textarea", { placeholder: "寫下這句的備註、疑問或補充" }); ta.value = mk.note || "";
      var cb = h("input", { type: "checkbox" }); cb.checked = !!(mk.rep && !mk.sent);
      var sheet;
      function close(keep) {
        if (keep) {
          if (mk.note !== ta.value.trim()) mk.mt = Date.now();
          mk.note = ta.value.trim();
          if (cb.checked && !mk.note) { toast("先寫備註，才能回報"); return; }
          if (cb.checked && !(mk.rep && !mk.sent)) { mk.rep = true; mk.sent = false; mk.ts = Date.now(); }
          if (!cb.checked && mk.rep && !mk.sent) mk.rep = false;
        }
        save(); sheet.remove(); paint();
      }
      sheet = h("div", { class: "sheet-bg", onclick: function (ev) { if (ev.target === sheet) close(true); } },
        h("div", { class: "sheet" },
          h("div", { class: "sq", text: "「" + mk.q + "」" }), ta,
          h("label", { class: "rep-ck" }, cb, h("span", { text: "回報給 Claude，補進課文" })),
          h("div", { class: "btns" },
            h("button", { class: "btn soft red-t", text: "刪除畫線", onclick: function () {
              S.marks[MK] = (S.marks[MK] || []).filter(function (x) { return x !== mk; }); S.del[mk.id] = Date.now(); close(false);
            } }),
            h("button", { class: "btn", text: "完成", onclick: function () { close(true); } }))));
      document.body.appendChild(sheet);
      if (!mk.note) ta.focus();
    }
    function addMark(withNote) {
      var sp = selPending; hideBar(); if (!sp) return;
      var mk = { id: Date.now().toString(36), p: sp.p, o: sp.s, q: sp.q, note: "", ts: Date.now() };
      (S.marks[MK] = S.marks[MK] || []).push(mk); save();
      var w = window.getSelection(); if (w) w.removeAllRanges();
      paint();
      if (withNote) openMark(mk);
    }
    var bar = h("div", { class: "selbar", hidden: true },
      h("button", { class: "btn", text: "畫重點", onpointerdown: function (ev) { ev.preventDefault(); }, onclick: function () { addMark(false); } }),
      h("button", { class: "btn soft", text: "畫重點＋備註", onpointerdown: function (ev) { ev.preventDefault(); }, onclick: function () { addMark(true); } }));
    function hideBar() { bar.hidden = true; selPending = null; }
    function onSel() {
      if (!art.isConnected) return document.removeEventListener("selectionchange", onSel);
      var w = window.getSelection();
      if (!w || w.isCollapsed || !w.rangeCount) { clearTimeout(selTimer); selTimer = setTimeout(hideBar, 350); return; }
      var r = w.getRangeAt(0);
      function para(n) { var e = n.nodeType === 1 ? n : n.parentElement; return e && e.closest ? e.closest("[data-p]") : null; }
      var pa = para(r.startContainer), pb = para(r.endContainer);
      if (!pa || !art.contains(pa)) return;
      var e = r.endContainer, eo = r.endOffset;
      if (pa !== pb) { e = pa; eo = pa.childNodes.length; }   // 跨段時只取第一段
      var r0 = document.createRange(); r0.setStart(pa, 0); r0.setEnd(r.startContainer, r.startOffset);
      var r1 = document.createRange(); r1.setStart(pa, 0); r1.setEnd(e, eo);
      var st = r0.toString().length, en = r1.toString().length, txt = pa.textContent.slice(st, en);
      var lead = txt.length - txt.replace(/^\s+/, "").length; txt = txt.trim(); st += lead;
      if (!txt) return;
      clearTimeout(selTimer);
      selPending = { p: +pa.getAttribute("data-p"), s: st, q: txt };
      bar.hidden = false;
    }
    document.addEventListener("selectionchange", onSel);
    function fsChip(label, v) { return h("button", { class: "chip", "aria-pressed": String(fs === v), text: label, onclick: function () { R.fs = v; save(); viewRead(sid, cid, xid); } }); }
    var head = h("div", { class: "rd-head" },
      h("div", { class: "eyebrow", text: s.name + "・第 " + (ci + 1) + " 章 " + c.title }),
      h("h1", { class: "rd-title", text: sec.title }),
      h("div", { class: "rd-meta" }, h("span", { class: "small", text: sec.src ? "整理自：" + sec.src : "" }),
        h("span", { class: "chips sm" }, fsChip("小", 16), fsChip("中", 18), fsChip("大", 20))),
      h("div", { class: "small", text: "長按選字，就能畫重點或寫備註。點畫過的字可修改。" }));
    paint();
    var tail = h("div", { class: "card" }, h("div", { class: "h2", text: "讀完這節，寫考古題" }),
      h("div", { class: "muted", text: set.items.length ? "本節有 " + set.items.length + " 題選擇題。" : "本節還沒有對應的選擇題。" }));
    if (set.items.length) tail.appendChild(h("div", { class: "btns" }, pracBtns(key, set.items.length, true).concat([
      h("a", { class: "btn soft", href: "#/print/" + key, text: "列印本節" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" })])));
    if (es.length) { var el2 = h("div", { class: "sec-links" }); es.forEach(function (x) { el2.appendChild(h("a", { class: "pill", href: "#/es/" + x.id, text: "申論 " + x.src })); }); tail.appendChild(el2); }
    var nav = h("div", { class: "btns rd-nav" },
      si > 0 ? h("a", { class: "btn soft", href: "#/rd/" + sid + "/" + cid + "/" + secs[si - 1].id, text: "‹ 上一節" }) : h("a", { class: "btn soft", href: "#/c/" + sid + "/" + cid, text: "‹ 章節目錄" }),
      si < secs.length - 1 ? h("a", { class: "btn soft", href: "#/rd/" + sid + "/" + cid + "/" + secs[si + 1].id, text: "下一節 ›" }) : h("a", { class: "btn soft", href: "#/c/" + sid + "/" + cid, text: "本章考古題 ›" }));
    // 目錄（電腦版顯示在左側）：本章各節，目前這節展開小標
    var toc = h("nav", { class: "toc", "aria-label": "本章目錄" }, h("a", { class: "toc-ch", href: "#/c/" + sid + "/" + cid, text: "第 " + (ci + 1) + " 章 " + c.title }));
    var heads = [];   // [段落序號, 目錄按鈕, 小標文字]
    secs.forEach(function (x, i) {
      toc.appendChild(h("a", { class: "toc-s", href: "#/rd/" + sid + "/" + cid + "/" + x.id, "aria-current": x === sec ? "page" : null, text: (ci + 1) + "-" + (i + 1) + " " + x.title }));
      if (x === sec) paras(sec).forEach(function (raw, j) {
        if (raw.slice(0, 3) !== "## ") return;
        var b = h("button", { class: "toc-h", text: raw.slice(3), onclick: function () { var t = document.getElementById("h" + j); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); } });
        heads.push([j, b, raw.slice(3)]); toc.appendChild(b);
      });
    });
    // 手機：頂端顯示目前讀到的小標
    var now = h("div", { class: "rd-now", hidden: true });
    show(topbar("#/c/" + sid + "/" + cid, "第 " + (ci + 1) + " 章"), now, h("div", { class: "rd-wrap" }, h("aside", { class: "rd-side" }, toc), h("div", { class: "rd-main" }, head, art, mine, tail, nav)), bar);

    // ---------- 讀到哪：捲動時記下段落、目錄藍標跟著小標走 ----------
    var RK = "rd:" + sid + ":" + xid, saved = S.pos[RK], curH = null, tmr = null, lastP = -1;
    function topPara() {   // 畫面上方（扣掉頂欄）第一個還看得到的段落
      var kids = art.children, line = 90, lo = 0, hi = kids.length - 1, ans = 0;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (kids[mid].getBoundingClientRect().top <= line) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
      return ans;
    }
    function spy() {
      if (!art.isConnected) return window.removeEventListener("scroll", onScroll);
      var p = topPara(), cur = null;
      heads.forEach(function (x) { if (x[0] <= p) cur = x; });
      if (art.getBoundingClientRect().top > 90) cur = null;
      if (cur !== curH) {
        if (curH) curH[1].removeAttribute("aria-current");
        curH = cur;
        if (cur) { cur[1].setAttribute("aria-current", "true"); var sd = cur[1].closest(".rd-side"); if (sd && sd.offsetParent) { var r = cur[1].getBoundingClientRect(), sr = sd.getBoundingClientRect(); if (r.top < sr.top || r.bottom > sr.bottom) cur[1].scrollIntoView({ block: "nearest" }); } }
        now.textContent = cur ? cur[2] : ""; now.hidden = !cur;
      }
      return p;
    }
    function remember() {
      if (!art.isConnected) return;
      var p = topPara(), n = art.children.length, done = tail.getBoundingClientRect().top < window.innerHeight;
      var pc = done ? 100 : Math.round(p / Math.max(1, n - 1) * 100);
      if (p === lastP && !done) return; lastP = p;
      var o = S.pos[RK] || {};
      if (o.p === p && !!o.done === done) return;
      // done＝現在停在節末（下次從頭讀）；fin＝曾經讀完（章節頁顯示「已讀完」）
      setPos(RK, { p: p, pc: pc, done: done || undefined, fin: done || o.fin || undefined });
    }
    function onScroll() { spy(); clearTimeout(tmr); tmr = setTimeout(remember, 600); }
    window.addEventListener("scroll", onScroll, { passive: true });
    setLast("#/rd/" + sid + "/" + cid + "/" + xid, (ci + 1) + "-" + (si + 1) + " " + sec.title, s.name + "・課文");
    // 回到上次讀的段落（讀完的節從頭開始）
    if (saved && !saved.done && saved.p > 0 && art.children[saved.p]) {
      requestAnimationFrame(function () {
        var el = art.children[saved.p]; if (!el) return;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
        lastP = saved.p; spy();
        toast("接續上次讀到的地方");
      });
    } else requestAnimationFrame(spy);
  }

  // ---------- 回報給 Claude ----------
  function secLabel(sid, cid, xid) {
    var c = chapter(sid, cid), sc = c && xid ? section(sid, cid, xid) : null;
    return subj(sid).name + "｜" + (c ? "第 " + (chapters(sid).indexOf(c) + 1) + " 章 " + c.title : "尚未分章") + (sc ? "｜" + sc.title + "（" + sc.id + "）" : "");
  }
  function pendingReports() {
    var out = [];
    Object.keys(S.repq).forEach(function (k) {
      var r = S.repq[k]; if (r.sent) return;
      var it = itemsFromIds([k])[0]; if (!it) return;
      out.push({ type: "q", k: k, it: it, grp: secLabel(it.e.subject, it.q.ch, it.q.sec), note: S.notes[k] || "", ts: r.ts, r: r });
    });
    Object.keys(S.marks).forEach(function (key) {
      var sid = key.split(":")[0], xid = key.split(":")[1], loc = null;
      if (subj(sid)) chapters(sid).forEach(function (c) { c.sections.forEach(function (x) { if (x.id === xid) loc = c.id; }); });
      (S.marks[key] || []).forEach(function (m) {
        if (!m.rep || m.sent) return;
        out.push({ type: "m", m: m, grp: loc ? secLabel(sid, loc, xid) : key, note: m.note, ts: m.ts });
      });
    });
    out.sort(function (a, b) { return a.grp < b.grp ? -1 : a.grp > b.grp ? 1 : a.ts - b.ts; });
    return out;
  }
  function reportText(list) {
    var d = new Date(), day = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var lines = ["【刷題本回報】" + day, "請依下列訂正與備註，修改或補充對應章節的課文。", ""], g = null, n = 0;
    list.forEach(function (x) {
      if (x.grp !== g) { g = x.grp; lines.push("■ " + g); }
      n++;
      if (x.type === "q") {
        var q = x.it.q;
        lines.push(n + ".〔題目〕" + x.it.e.short + " " + x.it.e.name + " 第 " + qno(x.it) + " 題");
        lines.push("題目：" + q.q);
        lines.push("選項：" + q.o.map(function (o, i) { return "(" + LET[i] + ")" + o; }).join(" "));
        lines.push("正解：" + (Array.isArray(q.a) ? q.a : [q.a]).map(function (i) { return "(" + LET[i] + ")" + q.o[i]; }).join(" 或 "));
        lines.push("我的訂正：" + x.note.trim());
      } else {
        lines.push(n + ".〔課文畫線〕第 " + (x.m.p + 1) + " 段「" + x.m.q + "」");
        lines.push("我的備註：" + x.note.trim());
      }
      lines.push("");
    });
    return lines.join("\n");
  }
  // 建議一批：10–15 則、6,000 字以內，最好同一章
  var REP_MAX_N = 15, REP_MAX_C = 6000;
  function copyText(txt, fallbackTa) {
    function done() { toast("已複製，貼到對話裡"); }
    function old() { var t = fallbackTa || h("textarea"); if (!fallbackTa) { t.value = txt; document.body.appendChild(t); } t.select(); document.execCommand("copy"); if (!fallbackTa) t.remove(); done(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, old); else old();
  }
  function chLabel(grp) { return grp.split("｜").slice(0, 2).join("｜"); }
  // 生字回報：讀英文題時加入的生字，貼給 Claude 補進單字程式
  function vwPending() {
    return Object.keys(S.vw).filter(function (w) { var x = S.vw[w]; return !x.del && !x.sent; }).sort(function (a, b) { return S.vw[a].ts - S.vw[b].ts; });
  }
  function vwText(ws) {
    var d = new Date(), day = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    return ["【單字回報】" + day, "讀題時不會的字，請補進單字程式（單字庫已有的字就當難字處理）：", ""].concat(ws.map(function (w, i) {
      return (i + 1) + ". " + w + "｜" + (S.vw[w].src || "") + "｜" + (KS.vocab ? (KS.vocab[w] ? "單字庫已有" : "單字庫沒有") : "");
    })).join("\n");
  }
  function vwCard() {
    var ws = vwPending(); if (!ws.length) return null;
    var txt = vwText(ws), list = h("div", { class: "rows" });
    ws.forEach(function (w) {
      list.appendChild(h("div", { class: "rep-item" }, h("div", { class: "q", text: w }), h("div", { class: "small", text: S.vw[w].src || "" }),
        h("button", { class: "link", text: "移出清單", onclick: function () { S.vw[w] = { del: 1, ts: Date.now() }; save(); viewReport(); } })));
    });
    return h("div", { class: "card" }, h("div", { class: "h2", text: "生字 " + ws.length + " 個" }),
      h("div", { class: "small", text: "讀英文題時按「＋生字」的字。複製後貼給 Claude，會補進單字程式。" }),
      h("div", { class: "btns" },
        h("button", { class: "btn", text: "複製生字", onclick: function () { copyText(txt); } }),
        h("button", { class: "btn soft", text: "已送出，清空", onclick: function () { ws.forEach(function (w) { S.vw[w] = Object.assign({}, S.vw[w], { sent: 1, ts: Date.now() }); }); save(); toast("已標為送出"); viewReport(); } })),
      list);
  }
  function viewReport() {
    if (vwPending().length && !KS.vocab) vocab(function () { if (location.hash === "#/rep") viewReport(); });
    var list = pendingReports(), txt = reportText(list), vc = vwCard();
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: "回報給 Claude" }),
      h("div", { class: "title", text: list.length ? list.length + " 則訂正待回報" : "目前沒有要回報的訂正" }),
      h("div", { class: "muted", text: "在題目的訂正或課文備註勾「回報給 Claude」，就會集中到這裡。複製後貼到和 Claude 的對話，Claude 會把內容補進課文。" }));
    if (!list.length) return show(topbar("#/", "首頁"), vc ? null : card, vc);
    var big = list.length > REP_MAX_N || txt.length > REP_MAX_C;
    card.appendChild(h("div", { class: "rep-size" + (big ? " warn" : "") },
      h("b", { text: "共 " + list.length + " 則、約 " + txt.length.toLocaleString() + " 字" }),
      h("div", { class: "small", text: big ? "一次送太多，建議用下面的「複製這章」分批送：每批 10–15 則或 6,000 字以內，最好同一章。" : "份量剛好，可以一次送出。建議每批 10–15 則或 6,000 字以內。" })));
    function markSent(sub) {
      sub.forEach(function (x) { if (x.type === "q") x.r.sent = true; else x.m.sent = true; });
      save(); toast("已標為送出"); viewReport();
    }
    var ta = h("textarea", { class: "rep-txt", readonly: true }); ta.value = txt;
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: big ? "btn soft" : "btn", text: "複製全部", onclick: function () { copyText(txt, ta); } }),
      h("button", { class: "btn soft", text: "全部已送出，清空", onclick: function () { markSent(list); } })));
    // 依章分批
    var chs = [], byCh = {};
    list.forEach(function (x) { var c = chLabel(x.grp); if (!byCh[c]) { byCh[c] = []; chs.push(c); } byCh[c].push(x); });
    var rows = h("div", { class: "rows" });
    chs.forEach(function (c) {
      var sub = byCh[c], st = reportText(sub);
      rows.appendChild(h("div", { class: "rep-ch" },
        h("div", null, h("div", { class: "nm", text: c }), h("div", { class: "small", text: sub.length + " 則・約 " + st.length.toLocaleString() + " 字" + (sub.length > REP_MAX_N || st.length > REP_MAX_C ? "（偏多，可分兩次）" : "") })),
        h("div", { class: "rep-ch-btns" },
          h("button", { class: "btn", text: "複製這章", onclick: function () { copyText(st); } }),
          h("button", { class: "btn soft", text: "已送出", onclick: function () { markSent(sub); } }))));
      var g = null;
      sub.forEach(function (x) {
        if (x.grp !== g) { g = x.grp; rows.appendChild(h("div", { class: "grp", text: g.split("｜").slice(2).join("｜") || "（本章）" })); }
        rows.appendChild(h("div", { class: "rep-item" },
          h("div", { class: "small", text: x.type === "q" ? "題目・" + x.it.e.short + " 第 " + qno(x.it) + " 題" : "課文畫線" }),
          h("div", { class: "q", text: x.type === "q" ? clip(x.it.q.q, 80) : "「" + clip(x.m.q, 80) + "」" }),
          h("div", { class: "n", text: clip(x.note, 300) }),
          h("button", { class: "link", text: "移出清單", onclick: function () {
            if (x.type === "q") delete S.repq[x.k]; else x.m.rep = false;
            save(); viewReport();
          } })));
      });
    });
    show(topbar("#/", "首頁"), card, vc, h("div", { class: "card" }, rows),
      h("div", { class: "card" }, h("div", { class: "small", text: "全部要複製的文字（也可以長按自己選取）" }), ta));
  }

  // ---------- 列印 ----------
  function viewPrint(key, mode) {
    var set = getSet(key); if (!set) return go("#/");
    var es = setEssays(key);
    var P = S.print = Object.assign({ size: 10, cols: 2, card: true, lines: 14 }, S.print);
    var onlyEs = mode === "es";
    function chip(label, on, fn) { return h("button", { class: "chip", "aria-pressed": String(on), text: label, onclick: function () { fn(); save(); viewPrint(key, mode); } }); }
    var ctl = h("div", { class: "card" }, h("div", { class: "h2", text: "列印 " + set.title }),
      h("div", { class: "small", text: "字級" }), h("div", { class: "chips" },
        chip("小", P.size === 9, function () { P.size = 9; }), chip("中", P.size === 10, function () { P.size = 10; }), chip("大", P.size === 11.5, function () { P.size = 11.5; })));
    if (!onlyEs) {
      ctl.appendChild(h("div", { class: "small", text: "排版" }));
      ctl.appendChild(h("div", { class: "chips" }, chip("雙欄（省紙）", P.cols === 2, function () { P.cols = 2; }), chip("單欄", P.cols === 1, function () { P.cols = 1; }), chip("附答案卡", P.card, function () { P.card = !P.card; })));
    } else {
      ctl.appendChild(h("div", { class: "small", text: "每題書寫空間" }));
      ctl.appendChild(h("div", { class: "chips" }, chip("不留", P.lines === 0, function () { P.lines = 0; }), chip("半頁", P.lines === 14, function () { P.lines = 14; }), chip("一頁", P.lines === 30, function () { P.lines = 30; })));
    }
    ctl.appendChild(h("div", { class: "small", text: "下面就是印出來的樣子，沒有答案。用電腦或手機瀏覽器的列印，紙張選 A4。" }));
    ctl.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "列印", onclick: function () { window.print(); } })));

    var pp = h("div", { class: "pp", style: "--pfs:" + P.size + "pt" });
    var total = onlyEs ? es.length : set.items.length;
    pp.appendChild(h("div", { class: "pp-h" }, h("b", { text: subj(set.sid).name + "｜" + set.title + (onlyEs ? "・申論" : "") }), h("span", { text: "共 " + total + " 題" }), h("span", { text: "日期＿＿＿　得分＿＿＿" })));
    if (!onlyEs) {
      var box = h("div", { class: "pp-mcq" + (P.cols === 2 ? " two" : "") });
      var lim = P.cols === 2 ? [3, 10] : [8, 22];
      var lastP = null;
      set.items.forEach(function (it, i) {
        var pt = passage(it);
        if (pt && pt !== lastP) box.appendChild(h("div", { class: "pp-p" }, h("span", { text: pt })));
        lastP = pt;
        var mx = Math.max.apply(null, it.q.o.map(function (t) { return t.length; }));
        var w = mx <= lim[0] ? "w4" : mx <= lim[1] ? "w2" : "w1";
        var o = h("div", { class: "pp-o " + w });
        it.q.o.forEach(function (t, j) { o.appendChild(h("span", { text: "(" + LET[j] + ")" + t })); });
        box.appendChild(h("div", { class: "pp-q" }, h("div", { class: "qt" }, h("span", { text: (i + 1) + "." }), h("span", { text: it.q.q + (set.exam ? "" : "（" + it.e.short + "）") })), o));
      });
      pp.appendChild(box);
      if (P.card) {
        var g = h("div", { class: "pp-cg" });
        set.items.forEach(function (_, i) { var d = h("div", null, h("span", { text: String(i + 1) })); LET.forEach(function (L) { d.appendChild(h("i", { text: L })); }); g.appendChild(d); });
        pp.appendChild(h("div", { class: "pp-card" }, g));
      }
    } else {
      var eb = h("div", { class: "pp-es" });
      es.forEach(function (x, i) {
        eb.appendChild(h("div", { class: "pp-e" }, h("div", { class: "qt" }, h("b", { text: (i + 1) + ". " }), h("span", { text: x.q + "（" + x.src + "）" })),
          P.lines ? h("div", { class: "lines", style: "height:" + P.lines * 8 + "mm" }) : null));
      });
      pp.appendChild(eb);
    }
    show(topbar(set.back, set.title), ctl, h("div", { class: "preview" }, pp));
  }

  // ---------- 路由 ----------
  function route() {
    var p = (location.hash || "#/").replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    window.scrollTo(0, 0); vHide();
    app.className = "v-" + (p[0] || "home");
    switch (p[0]) {
      case "s": if (subj(p[1])) return viewSubject(p[1], p[2]); break;
      case "c": if (subj(p[1]) && (p[2] === "_none" || chapter(p[1], p[2]))) return viewChapter(p[1], p[2]); break;
      case "x": if (exam(p[1])) return viewExam(p[1]); break;
      case "p": if (getSet(p[1])) return viewPractice(p[1], parseInt(p[2], 10) || 1); break;
      case "g": if (getSet(p[1])) return viewGrade(p[1]); break;
      case "r": if (getSet(p[1])) return viewResult(p[1]); break;
      case "es": if (essay(p[1])) return viewEssay(p[1]); break;
      case "rd": if (subj(p[1]) && section(p[1], p[2], p[3])) return viewRead(p[1], p[2], p[3]); break;
      case "rep": return viewReport();
      case "print": if (getSet(p[1])) return viewPrint(p[1], p[2]); break;
    }
    viewHome();
  }
  window.addEventListener("hashchange", route);
  load(); applyTheme(); route(); runInit();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {});
  if (/^https?:$/.test(location.protocol)) setTimeout(function () { checkUpdate(null, true); }, 1500);
})();
