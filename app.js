(function () {
  "use strict";
  var KS = window.KS, LET = ["A", "B", "C", "D"];
  var app = document.getElementById("app");
  // 版本號：和 sw.js 的 VER 保持一致，改程式時兩邊一起加一
  var APP_VER = "ks-v73", APP_DATE = "2026-11-08";

  // ---------- 儲存 ----------
  var KEY = "ks_v1";
  // marks：課文畫線 {節id: [{id,p,q,o,note,rep,sent,ts}]}；repq：題目訂正要回報 {題id: {sent,off,ts}}（off＝移出清單）；read：閱讀設定
  // qm：題目劃記與訂正畫線、qx：刪去法（見「題目劃記」）；nts：題目訂正的修改時間；del：已刪除畫線的墓碑 {畫線id: 時間}（同步時避免已刪的畫線復活）
  var S = { stats: {}, attempts: [], notes: {}, nts: {}, essay: {}, theme: "", print: {}, marks: {}, repq: {}, read: {}, del: {}, qm: {}, qx: {}, pos: {}, plan: {}, vw: {}, tl: {}, gm: {}, run: null };
  function load() {
    try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) S = Object.assign(S, j); } catch (e) {}
    migrate();
  }
  function migrate() {
    S.attempts.forEach(function (a) { if (!a.set && a.exam) a.set = "e:" + a.exam; });
    S.gm = S.gm || {}; S.essay = S.essay || {}; S.print = S.print || {}; S.marks = S.marks || {}; S.repq = S.repq || {}; S.read = S.read || {}; S.nts = S.nts || {}; S.del = S.del || {}; S.qm = S.qm || {}; S.qx = S.qx || {}; S.pos = S.pos || {}; S.plan = S.plan || {}; S.vw = S.vw || {}; S.tl = S.tl || {};
    S.pt = S.pt || {}; S.pt.log = S.pt.log || {};   // 監考官巡查：只存本機，不同步
  }
  // 離開前提醒：只看會同步的欄位，和「上次雲端同步完」的內容比；計時心跳這類只存本機的變動不算
  var SIGK = "ks_sig";
  function sig() { try { return JSON.stringify(KSSync.FIELDS.map(function (k) { return S[k]; })); } catch (e) { return ""; } }
  function markSynced() { try { localStorage.setItem(SIGK, String(sig().length) + ":" + hash(sig())); } catch (e) {} }
  function hash(t) { var h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return h; }
  function isDirty() { var c = KSSync.cfg(), v; if (!c.token) return false; try { v = localStorage.getItem(SIGK); } catch (e) { return false; } var now = sig(); return v != null && v !== String(now.length) + ":" + hash(now); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var updating = false;   // 按更新時本機進度已存好，重新載入不用再提醒
  window.addEventListener("beforeunload", function (ev) {
    if (!updating && isDirty()) { ev.preventDefault(); ev.returnValue = "還沒按雲端同步，確定要離開？"; return ev.returnValue; }
  });
  // 題目字級：小／中／大，全部題目頁共用（S.read.qs，只存本機）
  var QS = [["小", .88], ["中", 1], ["大", 1.2], ["特大", 1.4]];
  function applyQs() { document.documentElement.style.setProperty("--qs", String(QS[(S.read && S.read.qs) == null ? 1 : S.read.qs][1])); }
  function qsBtn(n, key) {
    var i = (S.read.qs == null ? 1 : S.read.qs);
    return h("button", { class: "link qs-b", "aria-label": "題目字級", text: "字：" + QS[i][0], onclick: function () { S.read.qs = (i + 1) % QS.length; save(); applyQs(); route(); } });
  }
  function applyTheme() {
    applyQs();
    if (S.theme) document.documentElement.setAttribute("data-theme", S.theme); else document.documentElement.removeAttribute("data-theme");
    // 手機狀態列顏色跟著頁面底色；手動切換主題時，media 版的 meta 不會跟著變，所以另建一條蓋過去
    var dark = S.theme ? S.theme === "dark" : window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    var m = document.getElementById("tc-now");
    if (!m) { m = document.createElement("meta"); m.id = "tc-now"; m.name = "theme-color"; document.head.appendChild(m); }
    m.content = dark ? "#111319" : "#edf0f5";
  }

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
  // 錯題本：最後一次答錯，或自己按「加入錯題本」（stats 的 pin，跟著答題紀錄同步；答對也留著，要自己移出）
  function isWrong(st) { return !!st && (st.last === "w" || !!st.pin); }
  function pinBtn(it) {
    var k = qid(it.e, it.n), b = h("button", { class: "link pin-btn", onclick: function () {
      var s = S.stats[k] = S.stats[k] || { w: 0, c: 0 };
      if (s.pin) { delete s.pin; toast(s.last === "w" ? "已取消；這題上次答錯，答對後才會離開錯題本" : "已移出錯題本"); }
      else { s.pin = Date.now(); toast("已加入錯題本，答對也會留著"); }
      s.ts = Date.now(); save(); paint(); b.blur();
    } });
    function paint() { var s = S.stats[k]; b.textContent = s && s.pin ? "★ 在錯題本中・按一下移出" : s && s.last === "w" ? "☆ 答對後也留在錯題本" : "☆ 加入錯題本"; }
    paint();
    return b;
  }
  function search(q) { return "https://www.google.com/search?q=" + encodeURIComponent("阿摩 " + q.q.slice(0, 40)); }
  function topbar(back, label) {
    var next = S.theme === "dark" ? "light" : S.theme === "light" ? "" : "dark";
    return h("div", { class: "bar" },
      back ? h("a", { class: "back", href: back, text: "‹ " + (label || "返回") }) : h("span", { class: "brand", text: "國考刷題本" }),
      h("span", { class: "bar-r" },
        back ? h("a", { class: "link", href: "#/", "aria-label": "回首頁", text: "⌂ 首頁" }) : null,
        h("button", { class: "link", "aria-label": "自由計時與補記", text: "⏱ 計時", onclick: freeTimer }),
      h("button", { class: "link", text: S.theme === "dark" ? "☀︎ 日間" : S.theme === "light" ? "跟隨系統" : "☾ 夜間", onclick: function () { S.theme = next; save(); applyTheme(); route(); } })));
  }
  // 自由計時與補記：不必排在今日任務裡，任何科目都能開始計時或補記分鐘
  function freeTimer() {
    if (document.querySelector(".fdlg")) return;
    var sid = (S.run && S.run.sid) || (KS.subjects[0] || {}).id || "", lab = h("input", { class: "fd-in", placeholder: "內容（選填，例如：憲法 第3章複習）", maxlength: "40" });
    var num = h("input", { class: "fd-in", type: "number", inputmode: "numeric", min: "1", max: "600", placeholder: "補記幾分鐘" });
    var chips = h("div", { class: "fd-chips" });
    var opts = KS.subjects.map(function (x) { return { id: x.id, name: x.name }; }).concat([{ id: "", name: "其他" }]);
    function paint() { chips.replaceChildren.apply(chips, opts.map(function (o) { return h("button", { class: "fd-chip" + (o.id === sid ? " on" : ""), style: "--c:" + (COL[o.id] || COL[""]), text: o.name, onclick: function () { sid = o.id; paint(); } }); })); }
    function nm() { var o = opts.filter(function (x) { return x.id === sid; })[0]; return lab.value.trim() || ("自習・" + (o ? o.name : "其他")); }
    function done() { ov.remove(); }
    var ov = h("div", { class: "fdlg", role: "dialog", "aria-label": "自由計時", onclick: function (ev) { if (ev.target === ov) done(); } },
      h("div", { class: "fd-box" },
        h("div", { class: "h2", text: "自由計時・補記" }), h("div", { class: "small", text: "不在今日排程裡的科目也能記。" }),
        chips, lab,
        h("div", { class: "btns" }, h("button", { class: "btn", text: "▶ 開始計時", onclick: function () {
          var t = { id: "free:" + sid, t: nm(), sid: sid, min: 60, href: location.hash || "#/" };
          tStart(t, ymd(new Date())); done(); route();
        } })),
        num,
        h("div", { class: "btns" },
          h("button", { class: "btn", text: "補記分鐘", onclick: function () {
            var n = Math.round(parseFloat(num.value)); if (isNaN(n) || n < 1 || n > 600) { toast("請輸入 1–600 分鐘"); return; }
            S.tl["t" + Date.now().toString(36)] = { d: ymd(new Date()), k: "free:" + sid, t: nm(), sid: sid, m: n, ts: Date.now() };
            save(); toast("記下 " + n + " 分鐘"); done(); route();
          } }),
          h("button", { class: "btn soft", text: "取消", onclick: done }))));
    paint(); document.body.appendChild(ov);
  }

  // ---------- 題組（考卷、章節、錯題共用） ----------
  // key 形式：e:考卷id ｜ c:科目:章id（_none＝未分章）｜ w:科目 ｜ t:科目:章id:階段[:節id]
  // 分階段（題目的 st）：1＝地特前要做；地特後＝全部考卷題＋st 2 的題庫題，沒標的題庫題不排。有 st 的科目才分階段，其餘科維持三成
  var stCache = {};
  function hasStage(sid) { if (stCache[sid] == null) stCache[sid] = KS.exams.some(function (e) { return e.subject === sid && e.questions.some(function (q) { return q.st; }); }); return stCache[sid]; }
  function inStage(e, q, st) { return st === 1 ? q.st === 1 : !!q.st || e.id.indexOf("bank") !== 0; }
  function stageNow() { return ymd(new Date()) <= EXAM_END ? 1 : 2; }
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
        var hit = p[0] === "t" ? q.ch === p[2] && inStage(e, q, +p[3]) && (!p[4] || q.sec === p[4]) : p[0] === "c" ? (p[2] === "_none" ? !q.ch : q.ch === p[2] && (!p[3] || q.sec === p[3])) : isWrong(stat(e, i + 1));
        if (hit) items.push({ e: e, n: i + 1, q: q });
      });
    });
    if (p[0] === "c" && p[3]) { var sc = section(sid, p[2], p[3]); if (!sc) return null; title = sc.title; back = "#/rd/" + sid + "/" + p[2] + "/" + p[3]; }
    else if (p[0] === "t") { title = (p[4] ? section(sid, p[2], p[4]).title : chapter(sid, p[2]).title) + (p[3] === "1" ? "・重點題" : "・題目"); back = p[4] ? "#/rd/" + sid + "/" + p[2] + "/" + p[4] : "#/"; }
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
    KS.exams.forEach(function (e) { e.questions.forEach(function (q, i) { var st = stat(e, i + 1); if (isWrong(st)) { m[e.subject] = (m[e.subject] || 0) + 1; tot++; } }); });
    return { m: m, tot: tot };
  }
  // ---------- 讀章排程（data/schedule.js，以章為單位；讀完整章才算完成） ----------
  var SC = KS.sched || { days: {}, buf: [], mult: {} };
  var SC_END = SC.to || "2026-11-22", MOCK_END = "2026-12-01", EXAM_END = "2026-12-06";
  // 模擬期：每天一份考卷計時寫，五類輪流
  var MOCKS = [["con", "法學知識與英文", "憲法做 114、113 地特四等（留給模擬考，第一次 114、第二次 113），法緒、英文各一份歷屆卷", 60], ["adm", "行政學", "一份地特四等或普考", 60], ["alaw", "行政法", "一份地特四等或普考", 60], ["pol", "政治學", "一份歷屆卷", 60], ["chn", "國文", "測驗＋作文", 90]];
  function mockOf(ds) { return MOCKS[Math.round((new Date(ds) - new Date("2026-11-23")) / 864e5) % MOCKS.length]; }
  function md(d) { var a = d.split("-"); return +a[1] + "/" + +a[2]; }
  function chTicked(key) { return Object.keys(S.plan).some(function (d) { return S.plan[d] && S.plan[d]["ch:" + key]; }); }
  // 實際速度：讀完的章，實際分鐘 ÷（字數÷200）；有樣本就取平均（限 0.4–1.6 倍），沒有樣本才用 schedule.js 的 mult
  var paceCache = {}, paceGen = 0;
  function paceOf(sid) {
    if (paceCache[sid]) return paceCache[sid];
    var xs = [];
    chapters(sid).forEach(function (c) {
      var secs = c.sections || [], key = sid + ":" + c.id, len = 0, n = 0;
      secs.forEach(function (x) { var r = S.pos["rd:" + sid + ":" + x.id]; if (r && r.fin) n++; len += paras(x).join("").length; });
      var m = chMin(key); if (secs.length && n === secs.length && m >= 8 && len > 600 && (SC.skip || []).indexOf(key) < 0) xs.push(m / (len / 200));
    });
    var base = (SC.mult || {})[sid] || 1, v = xs.length ? Math.max(0.4, Math.min(1.6, xs.reduce(function (a, b) { return a + b; }, 0) / xs.length)) : base;
    return (paceCache[sid] = { v: v, n: xs.length, base: base });
  }
  // 手動標記或取消已讀。取消時連該章的打勾一起清掉（章任務打勾也算讀完），nofin 讓這節不再自動算已讀。
  function setFin(sid, cid, xid, on) {
    var k = "rd:" + sid + ":" + xid, o = S.pos[k] || {};
    setPos(k, Object.assign({}, o, on ? { fin: true, nofin: undefined } : { fin: undefined, nofin: true, pc: o.pc === 100 ? 99 : o.pc }));
    if (!on) {
      var id = "ch:" + sid + ":" + cid;
      Object.keys(S.plan).forEach(function (d) { var pl = S.plan[d]; if (pl && pl[id]) { delete pl[id]; (pl._u = pl._u || {})[id] = Date.now(); pl._t = Date.now(); } });
      save();
    }
    paceCache = {}; paceGen++;
  }
  function chInfo(key) {
    var a = key.split(":"), sid = a[0], cs = chapters(sid), c = cs.filter(function (c) { return c.id === a[1]; })[0]; if (!c) return null;
    var secs = c.sections || [], n = 0, len = 0, rlen = 0, nx = null;
    secs.forEach(function (x) { var r = S.pos["rd:" + sid + ":" + x.id], l = paras(x).join("").length; if (r && r.fin) n++; else { if (!nx) nx = x; rlen += l; } len += l; });
    var pc = paceOf(sid), done = (secs.length > 0 && n === secs.length) || chTicked(key);
    // full＝全章預估；min＝還沒讀完的節的預估（排程與今日任務用這個；讀完的章用全章）
    // ks-v71：再加上這章地特前要做、還沒做的題目（含錯題訂正）。rf/rm＝讀課文全章／剩餘，qm＝題目，wm＝其中錯題訂正
    var rf = Math.max(10, Math.round(len / 200 * pc.v / 5) * 5), rm = done || !n ? rf : Math.max(5, Math.round(rlen / 200 * pc.v / 5) * 5);
    var qp = qPlan(sid, c), qs = qSpeed(sid), qm = qp.n ? Math.max(5, Math.round(qp.n * qs.t / 5) * 5) : 0, wm = qp.n ? Math.round(qp.n * qs.r * qs.w) : 0;
    var full = rf + qm;
    return { key: key, sid: sid, c: c, no: cs.indexOf(c) + 1, n: n, tot: secs.length, done: done,
      full: full, min: done ? full : rm + qm, rf: rf, rm: rm, qn: qp.n, qm: qm, wm: wm, qs: qs, pace: pc,
      href: nx ? "#/rd/" + sid + "/" + c.id + "/" + nx.id : "#/c/" + sid + "/" + c.id };
  }
  // 這章地特前要做、還沒做的題數：有分階段的科（憲法）＝重點題（st 1）；其他科＝約三成（至少 15 題）
  function qPlan(sid, c) {
    if (hasStage(sid)) { var st = getSet("t:" + sid + ":" + c.id + ":1"), a = st ? st.items.length : 0; return { n: a ? a - counts(st.items).done : 0, rule: "重點題" }; }
    var qs = getSet("c:" + sid + ":" + c.id), tot = qs ? qs.items.length : 0, quota = Math.min(tot, Math.max(15, Math.round(tot * 0.3)));
    return { n: tot ? Math.max(0, quota - counts(qs.items).done) : 0, rule: "三成" };
  }
  // 做題速度（每科）：r＝第一次就錯的比例（作答 30 題以上才用實際值，限 0.1–0.6，否則 0.3）；
  // t＝每題分鐘（含看解析、寫錯題訂正）：做題畫面的 chq: 時間 ÷ 那幾天作答的題數（20 題以上才用，限 0.5–4），否則 1＋r×2；w＝每道錯題的訂正分鐘
  var qsCache = {}, qsGen = -1, exSub = null;
  function qSpeed(sid) {
    if (qsGen !== paceGen) { qsCache = {}; qsGen = paceGen; }
    if (qsCache[sid]) return qsCache[sid];
    if (!exSub) { exSub = {}; KS.exams.forEach(function (e) { exSub[e.id] = e.subject; }); }
    var days = {}, M = 0, att = 0, wr = 0, N = 0;
    Object.keys(S.tl).forEach(function (i) { var x = S.tl[i]; if (!x.del && x.k && x.k.indexOf("chq:" + sid + ":") === 0) { M += x.m; days[x.d] = 1; } });
    Object.keys(S.stats).forEach(function (k) {
      if (exSub[k.slice(0, k.lastIndexOf("#"))] !== sid) return;
      var s = S.stats[k]; if (!(s.c || s.w)) return;
      att++; if (s.w) wr++; if (s.ts && days[ymd(new Date(s.ts))]) N++;
    });
    var r = att >= 30 ? Math.max(0.1, Math.min(0.6, wr / att)) : 0.3, t = N >= 20 && M > 0 ? Math.max(0.5, Math.min(4, M / N)) : 1 + r * 2;
    return (qsCache[sid] = { r: r, t: t, w: 2 * t / (1 + 2 * r), real: N >= 20 && M > 0, att: att });
  }
  function chEst(ci) { return ci.qn ? "讀 " + (ci.done ? 0 : ci.rm) + "＋題目 " + ci.qn + " 題約 " + ci.qm + " 分（含錯題訂正約 " + ci.wm + " 分）" : "讀 " + (ci.done ? 0 : ci.rm) + " 分（題目已做完）"; }
  // 章任務的做題時間（計時中停在做題畫面，記成 chq:）
  function chqTxt(d, key) { var q = taskMin(d, "chq:" + key); return q ? "・今天做題 " + q + " 分" : ""; }
  function qMinAll(key) { var m = 0; Object.keys(S.tl).forEach(function (i) { var x = S.tl[i]; if (!x.del && x.k === "chq:" + key) m += x.m; }); return m; }
  function chMin(key) { var m = 0; Object.keys(S.tl).forEach(function (i) { var x = S.tl[i]; if (!x.del && x.k === "ch:" + key) m += x.m; }); return m; }
  // 每天可排給「讀章＋章題目」的分鐘：看最近 7 天（不含今天）有讀的日子平均時數的八成五（其餘給單字、英文、國文），限 80–210（ks-v71 前只算讀章：七成、限 150）；資料不足用 170 分估
  function readBudget(today) {
    var d = new Date(today), sum = 0, n = 0;
    for (var i = 1; i <= 7; i++) { d.setDate(d.getDate() - 1); var m = dayMin(ymd(d)); if (m > 0) { sum += m; n++; } }
    var avg = n >= 2 ? sum / n : 170;
    return { avg: Math.round(avg), n: n, b: Math.max(80, Math.min(210, Math.round(avg * 0.85 / 5) * 5)) };
  }
  // 重新排程：未讀完的章依原訂順序，目標是 SC.to（模擬考前一天）讀完；每天分量取「近期讀書量」與「來得及讀完所需」較大者，週末乘 SC.we。
  // 趕不上的章排進模擬期當補讀（每天約 60 分），再排不下就標 over，不排到考試之後。讀完的章（包含提前讀完的）不會再出現在後面。
  // 今天的章第一次排定後固定（S.plan[今天]._ch），讀完也不會被換掉。
  // 章是哪天讀完的：先看最早打勾的日子（before：只看這天以前），沒有打勾就看最後一節標成已讀的時間
  function doneDay(ci, before) {
    var id = "ch:" + ci.key, ds = Object.keys(S.plan).filter(function (d) { return S.plan[d] && S.plan[d][id] && (!before || d < before); }).sort();
    if (ds.length) return ds[0];
    var ts = 0; (ci.c.sections || []).forEach(function (x) { var r = S.pos["rd:" + ci.sid + ":" + x.id]; if (r && r.fin && +r.ts > ts) ts = +r.ts; });
    return ts ? ymd(new Date(ts)) : null;
  }
  var planCache = null;
  function schedList(today) {
    if (planCache && planCache.t === today && planCache.g === paceGen) return planCache.v;
    var order = [];
    Object.keys(SC.days || {}).sort().forEach(function (d) { SC.days[d].forEach(function (k) { var ci = chInfo(k); if (ci) { ci.od = d; order.push(ci); } }); });
    var pl = S.plan[today] = S.plan[today] || {}, placed = {}, out = [];
    function put(ci, d) { ci.d = d; placed[ci.key] = 1; }
    var fixed = pl._ch ? pl._ch.split(",") : null, todays = [];
    // 今天的章是在這台裝置當下的資料排定的；同步後才知道「今天以前就讀完」的章，從今天拿掉、打勾還給讀完那天（ks-v70）
    if (fixed) {
      var drop = order.filter(function (ci) { var dd; return fixed.indexOf(ci.key) >= 0 && ci.done && ci.n === ci.tot && (dd = doneDay(ci, today)) && dd < today && (ci.dd = dd); });
      if (drop.length) {
        drop.forEach(function (ci) {
          var id = "ch:" + ci.key, p = S.plan[ci.dd] = S.plan[ci.dd] || {};
          if (!p[id]) { p[id] = Date.now(); p._t = Date.now(); }
          if (pl[id]) { delete pl[id]; (pl._u = pl._u || {})[id] = Date.now(); }
          fixed.splice(fixed.indexOf(ci.key), 1);
        });
        if (fixed.length) pl._ch = fixed.join(","); else { delete pl._ch; fixed = null; }
        pl._t = Date.now(); save();
      }
    }
    if (fixed) order.forEach(function (ci) { if (fixed.indexOf(ci.key) >= 0) { put(ci, today); todays.push(ci); } });
    var rest0 = order.filter(function (ci) { return !ci.done && !placed[ci.key]; });
    function place(B, apply) {
      var rest = rest0.slice(), d = new Date(today), used = 0, first = true, guard = 0, last = null;
      while (rest.length && guard++ < 120) {
        var ds = ymd(d), w = d.getDay(), dayB = B * (w === 0 || w === 6 ? SC.we || 1.5 : 1), cap = ds <= SC_END || today > EXAM_END ? dayB : 60;
        if (today <= EXAM_END && ds > MOCK_END) break;
        if (first && fixed) { cap = 0; }   // 今天已經排定，不再追加
        var cnt = 0, nSid = {};
        while (rest.length && cap > 0) {
          // 下一章塞不下時，往後找放得下的章，避免當天只讀一點；同一科只能選最前面那章（維持章序），每天同科章數不超過 SC.lim（預設 2）
          var j = -1, seen = {};
          for (var i = 0; i < rest.length && j < 0; i++) {
            var sd = rest[i].sid; if (seen[sd]) continue; seen[sd] = 1;
            var lim = (SC.lim || {})[sd] || 2;
            if ((nSid[sd] || 0) < lim && (!cnt || used + rest[i].min <= cap * 1.15)) j = i;
          }
          if (j < 0) break;
          var ci = rest[j];
          if (apply) { put(ci, ds); if (ds === today) todays.push(ci); }
          used += ci.min; cnt++; last = ds; nSid[ci.sid] = (nSid[ci.sid] || 0) + 1; rest.splice(j, 1);
          if (used >= cap) break;
        }
        first = false; used = 0; d.setDate(d.getDate() + 1);
      }
      return { n: rest.length, last: last };
    }
    var B = readBudget(today).b;
    if (today <= SC_END) while (B < 300) { var r = place(B); if (!r.n && (!r.last || r.last <= SC_END)) break; B += 5; }
    var left = place(B, true).n;
    if (!fixed && todays.length) { pl._ch = todays.map(function (c) { return c.key; }).join(","); save(); }
    order.forEach(function (ci) {
      if (!placed[ci.key]) { if (ci.done) ci.d = doneDay(ci) || ci.od; else { ci.d = null; ci.over = true; } }   // 讀完的章放在讀完那天（找不到才用原訂日期）；排不下的章不給日期
      ci.shift = !ci.done && ci.od < today;
      ci.st = ci.done ? "done" : ci.d === today ? "now" : "todo";
      out.push(ci);
    });
    out.B = B; out.left = left;
    planCache = { t: today, g: paceGen, v: out };
    return out;
  }
  // 今日目標（分鐘）：schedule.js 的 goal 可調
  function dayGoal(ds) { var w = new Date(ds).getDay(), g = SC.goal || {}; return w === 0 || w === 6 ? g.we || 360 : g.wd || 240; }
  function goalBox(P, tot) {
    var g = dayGoal(P.date), pct = Math.min(100, Math.round(tot / g * 100)), left = g - tot;
    var msg = tot <= 0 ? "還沒開始。現在按一個 ▶，先讀 25 分鐘，開始了就不難了。"
      : pct < 50 ? "開始了就是好事，再讀一段，今天先衝過一半。"
      : pct < 100 ? "過半了！再 " + fmtM(left) + " 就達標，把今天讀滿。"
      : "達標了，很棒！還有力氣就再讀一章，考試的分數就是這樣多出來的。";
    return h("div", { class: "goal" },
      h("div", { class: "goal-t" }, h("b", { text: "今日目標 " + fmtM(g) }), h("span", { text: pct + "%" })),
      h("div", { class: "goal-b" }, h("i", { style: "width:" + pct + "%" })),
      h("div", { class: "small", text: msg }));
  }
  // 今天這科做了幾題（看每題最後作答時間）
  function doneToday(sid, today) {
    var ex = {}, n = 0;
    KS.exams.forEach(function (e) { if (e.subject === sid) ex[e.id] = 1; });
    Object.keys(S.stats).forEach(function (k) { var x = S.stats[k]; if (x.ts && (x.c || x.w) && ex[k.slice(0, k.lastIndexOf("#"))] && ymd(new Date(x.ts)) === today) n++; });
    return n;
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
      if (!hasStage(sid)) add("qs", s.name + "：本節題目", st && st.items.length ? "共 " + st.items.length + " 題，做完看解析" : "本節沒有題目，改做考卷 15 題", st && st.items.length ? "#/p/" + key + "/1" : "#/s/" + sid + "/ex", qmin, 0, sid);
    }
    // 分階段的科目：依節序出還沒做完的題，合計最多 max 題。階段一只出讀完的節；階段二不看讀到哪
    function stageTasks(st, max) {
      KS.subjects.forEach(function (s) {
        if (!hasStage(s.id)) return;
        var rem = max;
        chapters(s.id).forEach(function (c, i) {
          var chDone = st === 1 && chInfo(s.id + ":" + c.id).done;
          (c.sections || []).forEach(function (x, j) {
            if (!rem) return;
            var rd = S.pos["rd:" + s.id + ":" + x.id];
            if (st === 1 && !chDone && !(rd && rd.fin)) return;
            var key = "t:" + s.id + ":" + c.id + ":" + st + ":" + x.id, set = getSet(key), tot = set.items.length, dn = counts(set.items).done, nx = Math.min(rem, tot - dn);
            if (nx <= 0) return;
            var at = 0; set.items.some(function (it, k) { at = k + 1; return !stat(it.e, it.n); });
            add("st" + st + ":" + s.id + ":" + x.id, s.name + " " + (i + 1) + "-" + (j + 1) + (st === 1 ? " 重點題 " : " 題目 ") + nx + " 題", x.title + "・本節 " + tot + " 題（已做 " + dn + "）", "#/p/" + key + "/" + at, Math.max(5, Math.round(nx * 1.2 / 5) * 5), 1, s.id);
            T[T.length - 1].ck = key; T[T.length - 1].goal = dn + nx;
            rem -= nx;
          });
        });
      });
    }
    var phase = today < "2026-11-23" ? "A" : today < "2026-12-02" ? "B" : today < "2026-12-05" ? "C" : today <= EXAM_END ? "X" : daysTo("2027-04-01") > 0 ? 2 : 3;
    if (phase === "A") {
      // 地特前補強：保底＝單字＋今天排的章（讀完整章才算完成，含落後章）＋輪流的考題（一三五英文考卷，二四六日國文測驗）＋週三作文大綱；週日緩衝日另補落後＋錯題；加碼＝刷題、其他天的英文考卷、週六作文
      var L = schedList(today), isBuf = (SC.buf || []).indexOf(today) >= 0, pl0 = S.plan[today] = S.plan[today] || {}, todays = [];
      var chFix = pl0._ch ? pl0._ch.split(",") : [];
      vocab0(20);
      L.forEach(function (ci) {
        var k = "ch:" + ci.key, inBx = pl0._bx && pl0._bx[k];
        // 今天之前就讀完的章（不在今天排定的 _ch）不算今天的保底，也不自動打勾；舊版留下的自動勾在這裡清掉。節沒讀滿、只靠打勾算完成的不清，免得那章變回沒讀
        if (ci.done && chFix.indexOf(ci.key) < 0 && !inBx) {
          if (pl0[k] && ci.n === ci.tot) { delete pl0[k]; (pl0._u = pl0._u || {})[k] = Date.now(); pl0._t = Date.now(); save(); }
          if (!pl0[k]) return;
        }
        if (!(ci.d === today || (pl0[k] && !inBx))) return;
        if (ci.done && !pl0[k] && !(pl0._nt && pl0._nt[k])) { pl0[k] = Date.now(); pl0._t = Date.now(); save(); }
        todays.push(ci);
        add(k, subj(ci.sid).name + "：第 " + ci.no + " 章" + (ci.shift ? "（原訂 " + md(ci.od) + "）" : ""), ci.c.title + "・已讀 " + ci.n + "/" + ci.tot + " 節・" + (ci.done ? "約 " + ci.full + " 分" : (ci.n ? "剩約 " : "約 ") + ci.min + " 分：" + chEst(ci)) + (ci.pace.n || ci.qs.real ? "（依你的速度）" : "") + chqTxt(today, ci.key), ci.href, ci.min, 0, ci.sid);
      });
      // 今天的章都讀完了：往前拉下一章，有力氣再讀（讀完就不會再出現在後面的日子）
      var allDone = todays.length && todays.every(function (ci) { return ci.done; });
      if (allDone || (!todays.length && !isBuf)) {
        var nxt = L.filter(function (ci) { return !ci.done && ci.d > today; })[0];
        if (nxt) add("ch:" + nxt.key, "提前讀：" + subj(nxt.sid).name + " 第 " + nxt.no + " 章", nxt.c.title + "・原排 " + md(nxt.d) + "，讀完後面就不再排它", nxt.href, nxt.min, 1, nxt.sid);
      }
      if (isBuf) {
        // 錯題重做：本週答錯（或加入錯題本）的題目，每題約 1.5 分（重做＋看訂正），限 20–90 分
        var wkN = 0, wk0 = Date.now() - 7 * 864e5; Object.keys(S.stats).forEach(function (k) { var x = S.stats[k]; if (isWrong(x) && +x.ts >= wk0) wkN++; });
        add("wk", "錯題總複習", (wb.tot ? "本週錯題回頭看，" + subj(top).name + " 最多" : "挑本週最弱的一科回頭看") + (wkN ? "・本週錯 " + wkN + " 題，每題約 1.5 分" : ""), wb.tot ? "#/s/" + top + "/wr" : "#/", Math.max(20, Math.min(90, Math.round(wkN * 1.5 / 5) * 5)), 0, top || "");
      }
      // 選擇題：12/5 前每章只做約三成（未做優先），其餘留到 7 月；一次最多 25 題
      var tchs = todays.filter(function (ci) { return !hasStage(ci.sid); }), tch = tchs.filter(function (ci) { return !ci.done; })[0] || tchs[0];
      if (tch) {
        var qs = getSet("c:" + tch.sid + ":" + tch.c.id), tot = qs ? qs.items.length : 0, dn = qs ? counts(qs.items).done : 0, quota = Math.min(tot, Math.max(15, Math.round(tot * 0.3))), left = Math.max(0, quota - dn), today25 = Math.min(25, left);
        if (tot && today25) add("q2:" + tch.key, subj(tch.sid).name + " 第 " + tch.no + " 章題目 " + today25 + " 題", "本章共 " + tot + " 題，12/5 前先做約 " + quota + " 題（已做 " + dn + "，已算進章的估時），其餘留給 7 月高普考", "#/p/c:" + tch.sid + ":" + tch.c.id + "/" + (resumeN("c:" + tch.sid + ":" + tch.c.id, tot) || 1), Math.round(today25 * 1.2 / 5) * 5, 1, tch.sid);
        if (tot && today25) { T[T.length - 1].ck = "c:" + tch.sid + ":" + tch.c.id; T[T.length - 1].goal = dn + today25; }
        else if (!tot) add("q2:" + tch.key, "今天章節的題目", "本章沒有對應題目，改做考卷 15 題", "#/s/" + tch.sid + "/ex", 20, 1, tch.sid);
      }
      stageTasks(1, 25);
      // 考題輪流進保底：寫滿題數自動打勾（手動取消過就不再勾）
      var engDay = dow % 2 === 1, engN = doneToday("eng", today), chnN = doneToday("chn", today), pl1 = S.plan[today] = S.plan[today] || {};
      [["eng", engN, 20], ["chn", chnN, 15]].forEach(function (a) { if (a[1] >= a[2] && !pl1[a[0]] && !(pl1._u && pl1._u[a[0]])) { pl1[a[0]] = Date.now(); pl1._t = Date.now(); save(); } });
      add("eng", "英文考卷一份", "單字掌握約 9 成的那份，20–30 題，寫完看本題單字" + (engN ? "（今天已做 " + engN + " 題）" : ""), "#/s/eng/ex", 30, engDay ? 0 : 1, "eng");
      if (!engDay) add("chn", "國文測驗 15 題", "字音字形、成語、閱讀" + (chnN ? "（今天已做 " + chnN + " 題）" : ""), "#/s/chn/ex", 25, 0, "chn");
      esDue().slice(0, 1).forEach(function (x) { var wrt = isWriting(x), wm = wrt ? wrInfo(x).min : 25; add("esr", wrt ? "作文第二次" : "申論閉卷重寫", x.src + "：兩天前寫過，今天閉卷重寫（約 " + wm + " 分）", "#/es/" + x.id, wm, 1, x.subject); });
      if (dow === 6) add("es", "國文作文一篇", "挑一題歷屆題目限時寫完，再交給 Claude 批改", "#/c/chn/c5", 60, 1, "chn");
      if (dow === 3) add("es", "作文大綱＋第一段", "挑一題歷屆題目，20 分鐘，寫完可以交給 Claude 批改", "#/c/chn/c5", 20, 0, "chn");
      if (wb.tot && !isBuf) add("wr", "錯題複習", "共 " + wb.tot + " 題，" + subj(top).name + " 最多", "#/s/" + top + "/wr", 20, 1, top);
    } else if (phase === "B") {
      // 模擬期：每天一份考卷計時寫，寫完檢討
      var m = mockOf(today);
      vocab0(20);
      add("mk", m[1] + " 模擬考", m[2] + "，計時寫完再對答案", "#/s/" + m[0] + "/ex", m[3], 0, m[0]);
      add("rv", "檢討今天的錯題", "看解析、寫訂正", "#/s/" + m[0] + "/wr", 40, 0, m[0]);
      stageTasks(1, 25);
      add("eng", "英文 10 題", "保持手感", "#/s/eng/ex", 20, 1, "eng");
      if (wb.tot) add("wr", "其他科錯題", "共 " + wb.tot + " 題", "#/s/" + top + "/wr", 30, 1, top);
      schedList(today).forEach(function (ci) { if (!ci.done && ci.d <= today) add("ch:" + ci.key, "補讀：" + subj(ci.sid).name + "第 " + ci.no + " 章", ci.c.title + "・已讀 " + ci.n + "/" + ci.tot + " 節", ci.href, ci.min, 1, ci.sid); });
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
      if (phase === 2) stageTasks(2, 15);
      if (wb.tot) add("wr", "錯題複習", "共 " + wb.tot + " 題", "#/s/" + top + "/wr", 20, 1, top);
    }
    // 加碼當天第一次出現就記在 plan[今天]._bx；做完（算不出來了）也留在清單上打勾，新的接在後面
    var pl9 = S.plan[today] = S.plan[today] || {}, bx = pl9._bx || {}, has = {}, chg = false, extra9 = [];
    T.forEach(function (t) { has[t.id] = t; if (t.tier && !bx[t.id]) { bx[t.id] = { t: t.t, sub: t.sub, href: t.href, min: t.min, sid: t.sid, ext: t.ext, ck: t.ck, goal: t.goal }; chg = true; } });
    Object.keys(bx).forEach(function (id) {
      if (has[id]) { if (has[id].tier) extra9.push(has[id]); return; }
      var x = bx[id];
      // 題目類的加碼（記了題組 ck 與目標題數 goal）：要真的做到目標題數才算完成；只是換章而消失的不自動打勾
      if (x.ck) { var xs = getSet(x.ck), xd = xs ? counts(xs.items).done : 0; if (xd < x.goal) { extra9.push({ id: id, t: x.t, sub: x.sub + "・今天還差 " + (x.goal - xd) + " 題", href: x.href, min: x.min, tier: 1, sid: x.sid, ext: x.ext }); return; } }
      if (!pl9[id] && !(pl9._u && pl9._u[id])) { pl9[id] = Date.now(); pl9._t = Date.now(); chg = true; }
      extra9.push({ id: id, t: x.t, sub: pl9[id] ? "今天已完成" : x.sub, href: x.href, min: x.min, tier: 1, sid: x.sid, ext: x.ext });
    });
    if (chg) { pl9._bx = bx; save(); }
    return { date: today, phase: phase, tasks: T.filter(function (t) { return !t.tier; }).concat(extra9) };
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
    S.run = { k: t.id, t: t.t, sid: t.sid || "", min: t.min, d: date, href: t.href, ext: !!t.ext, acc: 0, t0: Date.now(), hb: Date.now(), a: Date.now(), im: idleDefault({ k: t.id, t: t.t }) };
    lastAct = Date.now(); segMark(); save(); runBar();
  }
  // 計時分類（ks-v64）：每段時間依當時所在畫面分成 讀課文／做題／寫作；認不得的畫面（首頁、設定…）和外連任務算成任務本來的類型（讀章任務例外：記成 cho:「其他畫面」），
  // 所以紙本作答放著計時也不會變成「其他」。r.sg＝各類毫秒，r.sx＝各節毫秒（只算讀課文），r.hh＝各小時毫秒，r.a＝開始時間。
  function runKind(r) { return !r.k.indexOf("ch:") ? "read" : tlKind(r.k); }
  function hashKind() {
    var m = /^#\/(rd|c|p|x|g|r|print|gm|gmp|es)\//.exec(location.hash || ""); if (!m) return null;
    return m[1] === "rd" || m[1] === "c" ? "read" : m[1] === "es" ? "write" : "drill";
  }
  function segFlush(at) {
    var r = S.run; if (!r || !r.kt) return;
    var ms = (at || Date.now()) - r.kt; r.kt = null; if (ms <= 0) return;
    r.sg = r.sg || {}; r.sg[r.kk] = (r.sg[r.kk] || 0) + ms;
    if (r.kx) { r.sx = r.sx || {}; r.sx[r.kx] = (r.sx[r.kx] || 0) + ms; }
  }
  function segMark() {
    var r = S.run; if (!r) return; segFlush();
    if (!r.t0) return;
    r.kt = Date.now(); r.kk = r.ext ? runKind(r) : hashKind() || (!r.k.indexOf("ch:") ? "oth" : runKind(r));   // 讀章計時停在首頁、設定等畫面不算讀課文（ks-v69）
    var m = /^#\/rd\/([^/]+)\/([^/]+)\/([^/]+)/.exec(location.hash || "");
    r.kx = r.kk === "read" && m ? m[1] + ":" + m[2] + ":" + m[3] : null;
  }
  function hourAdd(t0, t1) {
    var r = S.run; if (!r || !t0 || t1 <= t0) return; var hh = r.hh = r.hh || {};
    while (t0 < t1) { var d0 = new Date(t0), nx = Math.min(t1, new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), d0.getHours() + 1).getTime()); hh[d0.getHours()] = (hh[d0.getHours()] || 0) + (nx - t0); t0 = nx; }
  }
  window.addEventListener("hashchange", function () { segMark(); });
  // 閒置偵測：計時中超過設定的分鐘數沒有觸控、捲動、按鍵（朗讀中不算閒置）就暫停，並問要不要把這段算進去。
  // 預設看設定 S.idle（3／10／20／30，預設 3）；申論、作文至少 20 分；計時列的 ⏳ 可以只改這一次。
  var lastAct = Date.now(), IDLE_OPTS = [3, 10, 20, 30];
  function actNow() { lastAct = Date.now(); }
  ["touchstart", "touchmove", "pointerdown", "keydown", "wheel", "click"].forEach(function (ev) { document.addEventListener(ev, actNow, { passive: true, capture: true }); });
  window.addEventListener("scroll", actNow, { passive: true, capture: true });
  function idleDefault(x) { var b = S.idle || 3; return x && (x.k === "es" || /申論|作文/.test(x.t || "")) ? Math.max(b, 20) : b; }
  function idleMin(r) { return r.im || idleDefault(r); }
  setInterval(function () {
    var r = S.run; if (!r || !r.t0 || r.noidle || document.hidden) return;
    if (window.speechSynthesis && speechSynthesis.speaking) { lastAct = Date.now(); return; }
    if (Date.now() - lastAct > idleMin(r) * 6e4) { tAway(lastAct); r.idl = 1; save(); runBar(); }
  }, 5000);
  function tPause() { var r = S.run; if (!r || !r.t0) return; var n = Date.now(); segFlush(n); hourAdd(r.t0, n); r.acc += n - r.t0; r.t0 = null; r.p = 1; save(); runBar(); }
  function tResume() { var r = S.run; if (!r) return; if (r.ext) S.pt.last = Date.now(); r.t0 = Date.now(); r.p = 0; r.away = null; r.idl = 0; lastAct = Date.now(); r.a = r.a || r.t0; segMark(); save(); runBar(); }
  function tStop(quiet) {
    var r = S.run; if (!r) return;
    var n = Date.now(); if (r.ext) S.pt.last = n; if (r.t0) { segFlush(n); hourAdd(r.t0, n); }
    var ms = r.acc + (r.t0 ? n - r.t0 : 0), m = Math.round(ms / 6e4), cur = runKind(r), mq = 0;
    S.run = null;
    if (m >= 1) {
      // 各類毫秒：手動改時間、「算進去」的離開時間沒有歸類，就歸給任務本來的類型；比總時間多就等比縮小
      var sg = Object.assign({}, r.sg || {}), sum = 0;
      Object.keys(sg).forEach(function (k) { sum += sg[k]; });
      if (ms > sum) sg[cur] = (sg[cur] || 0) + (ms - sum);
      else if (sum > ms) Object.keys(sg).forEach(function (k) { sg[k] = sg[k] * ms / sum; });
      var ks = Object.keys(sg).sort(function (a, b) { return sg[b] - sg[a]; }), mins = {}, left = m;
      ks.slice(1).forEach(function (k) { var v = Math.min(left, Math.round(sg[k] / 6e4)); mins[k] = v; left -= v; });
      mins[ks[0]] = left; mq = mins.drill || 0;
      var id = "t" + n.toString(36), isCh = !r.k.indexOf("ch:");
      ks.forEach(function (k, i) {
        if (!(mins[k] >= 1)) return;
        var q = isCh && k !== "read";
        var rec = { d: r.d, k: q ? (k === "oth" ? "cho:" : "chq:") + r.k.slice(3) : r.k, t: q ? r.t + (k === "write" ? "（寫作）" : k === "oth" ? "（其他畫面）" : "（做題）") : r.t, sid: r.sid, m: mins[k], ts: n, kd: k };
        if (r.a) rec.a = r.a;
        if (!i && r.hh) { rec.hh = {}; Object.keys(r.hh).forEach(function (h2) { var v = Math.round(r.hh[h2] / 6e4); if (v >= 1) rec.hh[h2] = v; }); }
        if (k === "read" && r.sx) { rec.xs = {}; Object.keys(r.sx).forEach(function (x) { var v = Math.round(r.sx[x] / 1e3); if (v >= 30) rec.xs[x] = v; }); }
        S.tl[i ? id + "_" + k : id] = rec;
      });
      var pl = S.plan[r.d] = S.plan[r.d] || {};
      if (!pl[r.k] && r.k.indexOf("ch:") && r.k.indexOf("free:") && taskMin(r.d, r.k) >= r.min * 0.8) { pl[r.k] = Date.now(); pl._t = Date.now(); }
    }
    save(); runBar();
    if (!quiet) { toast(m >= 1 ? "記下 " + m + " 分鐘" + (mq >= 1 ? "（做題 " + mq + "）" : "") : "不到 1 分鐘，不記"); if (!location.hash || location.hash === "#/") route(); }
  }
  // 離開畫面（切程式、關螢幕、被叫走）就先停，回來再問要不要算進去
  function tAway(at) { var r = S.run; if (!r || !r.t0) return; var n = at || Date.now(); segFlush(n); hourAdd(r.t0, n); r.acc += n - r.t0; r.t0 = null; r.away = n; save(); }
  function tBack() {
    var r = S.run; if (!r || !r.away) return;
    var gap = Date.now() - r.away;
    if (!r.idl && gap < 9e4) { hourAdd(r.away, Date.now()); r.acc += gap; r.away = null; r.t0 = Date.now(); segMark(); save(); }
    runBar();
  }
  // 暫停後的詢問視窗：全螢幕、大字大按鈕
  var rmodal = null;
  function awayModal(r) {
    if (rmodal) rmodal.remove();
    var g = Math.max(1, Math.round((Date.now() - r.away) / 6e4));
    function take() { var n = Date.now(); hourAdd(r.away, n); r.acc += n - r.away; tResume(); }
    rmodal = h("div", { class: "rmodal", role: "dialog", "aria-label": "計時已暫停" }, h("div", { class: "rm-box" },
      h("div", { class: "rm-t", text: r.ext ? "剛剛 " + g + " 分鐘都在背單字嗎？" : r.idl ? "已經 " + g + " 分鐘沒有操作，計時先暫停了" : "剛剛離開了 " + g + " 分鐘" }),
      h("div", { class: "rm-s", text: r.t }),
      h("div", { class: "rm-s", text: "這 " + g + " 分鐘要算進讀書時間嗎？（寫在紙上也算讀書）" }),
      h("button", { class: "rm-b", text: "算進去", onclick: take }),
      h("button", { class: "rm-b soft", text: "不算", onclick: tResume }),
      r.idl ? h("button", { class: "rm-b soft", text: "算進去，這次不再偵測閒置", onclick: function () { r.noidle = 1; take(); } }) : null));
    document.body.appendChild(rmodal);
  }
  var rbar = null, rtick = null;
  function runBar() {
    var r = S.run;
    if (rmodal && (!r || !r.away)) { rmodal.remove(); rmodal = null; }
    if (!r) { if (rbar) { rbar.remove(); rbar = null; } clearInterval(rtick); rtick = null; document.body.classList.remove("has-run", "run-wide"); return; }
    if (!rbar) { rbar = h("div", { class: "runbar", role: "status" }); document.body.appendChild(rbar); document.body.classList.add("has-run"); }
    rbar.style.setProperty("--c", COL[r.sid] || COL[""]);
    rbar.classList.toggle("mini", !!(S.rbm && !r.away));
    document.body.classList.toggle("run-wide", !(S.rbm && !r.away));
    if (r.away) {
      rbar.replaceChildren(h("div", { class: "rb-q", text: "已暫停，等你回答" }));
      awayModal(r);
      return;
    }
    var tm = h("button", { class: "rb-t", "aria-label": "修改時間", onclick: function () {
      var v = prompt("已經讀了幾分鐘？（直接改成這個數字）", String(Math.round(runMs() / 6e4)));
      if (v == null) return; var n = parseFloat(v); if (isNaN(n) || n < 0 || n > 600) { toast("請輸入 0–600 的數字"); return; }
      r.acc = n * 6e4; if (r.t0) r.t0 = Date.now(); save(); upd();
    } });
    if (S.rbm) {
      var mt = h("button", { class: "rb-mt", "aria-label": "展開計時器" , onclick: function () { S.rbm = 0; save(); runBar(); } });
      var upm = function () { var ms = runMs(); mt.textContent = mmss(ms); mt.style.setProperty("--pg", Math.min(100, ms / 600 / Math.max(1, r.min)) + "%"); if (r.t0 && Date.now() - (r.hb || 0) > 15e3) { r.hb = Date.now(); save(); } };
      rbar.replaceChildren(mt, h("button", { class: "rb-mp", "aria-label": r.t0 ? "暫停" : "繼續", text: r.t0 ? "❚❚" : "▶", onclick: function () { if (S.run.t0) tPause(); else tResume(); } }));
      upm(); clearInterval(rtick); rtick = setInterval(upm, 1000); return;
    }
    function upd() { var ms = runMs(); tm.textContent = mmss(ms) + " / " + r.min + "m"; if (r.t0 && Date.now() - (r.hb || 0) > 15e3) { r.hb = Date.now(); save(); } }
    rbar.replaceChildren(h("span", { class: "rb-dot" + (r.t0 ? " on" : "") }),
      h("a", { class: "rb-n", href: r.href, target: r.ext ? "_blank" : null, rel: r.ext ? "noopener" : null, text: r.t }), tm,
      h("button", { class: "rb-b soft", "aria-label": r.t0 ? "暫停" : "繼續", text: r.t0 ? "❚❚" : "▶", onclick: function () { if (S.run.t0) tPause(); else tResume(); } }),
      h("button", { class: "rb-b soft", "aria-label": "閒置幾分鐘提醒（只改這一次）", text: r.noidle ? "⏳關" : "⏳" + idleMin(r) + "m", onclick: function () {
        var o = IDLE_OPTS.concat([0]), cur = r.noidle ? 0 : idleMin(r), nx = o[(o.indexOf(cur) + 1) % o.length];
        if (nx) { r.noidle = 0; r.im = nx; } else r.noidle = 1;
        lastAct = Date.now(); save(); runBar(); toast(nx ? "這次計時：" + nx + " 分鐘沒操作就暫停" : "這次計時：不偵測閒置");
      } }),
      h("button", { class: "rb-b", "aria-label": "結束並記錄", text: "■", onclick: function () { tStop(); } }),
      h("button", { class: "rb-b soft", "aria-label": "縮小成圓形", text: "◯", onclick: function () { S.rbm = 1; save(); runBar(); } }));
    upd(); clearInterval(rtick); rtick = setInterval(upd, 1000);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) tAway(); else tBack(); });
  window.addEventListener("pagehide", function () { tAway(); });
  // ---------- 監考官巡查（ks-v72）：只在計時中巡查，外部任務（單字）不巡查 ----------
  // S.pt（只存本機）：left＝距離下次巡查的毫秒（只在課文頁計時中倒數，暫停或結束計時都不會重來）；d＝日期；last＝上次計時中的時間；
  // at＝離開前讀到的位置 {sid,cid,xid,p}；log＝{日期:{ok,bad,none,over}}。S.read（裝置設定）：ptOff、ptf（a/b/c）、ptMute、ptSoft。
  var PT = { box: null, ctx: null, q: null, qms: {}, qdone: {}, ac: null, tts: false, tick: 0, back: false };
  var PT_FREQ = { a: [8, 20], b: [4, 10], c: [15, 30] };
  var PT_OWL = '<svg viewBox="0 0 460 170" width="100%" aria-hidden="true"><circle cx="230" cy="130" r="195" fill="#444441"/><path d="M150 0h160l14 26H136z" fill="#0b0b0b"/><rect x="100" y="22" width="260" height="10" fill="#2C2C2A"/><path d="M78 40l132 42-4 14L72 56zM382 40L250 82l4 14 134-40z" fill="#0b0b0b"/><circle cx="152" cy="108" r="46" fill="#FAC775"/><circle cx="308" cy="108" r="46" fill="#FAC775"/><circle class="pt-pu" data-x="152" data-y="108" cx="152" cy="108" r="24" fill="#141412"/><circle class="pt-pu" data-x="308" data-y="108" cx="308" cy="108" r="24" fill="#141412"/><path d="M230 110l-18 22 18 26 18-26z" fill="#A32D2D"/></svg>';
  function ptRand() { var f = PT_FREQ[S.read.ptf || "b"] || PT_FREQ.b; return (f[0] + Math.random() * (f[1] - f[0])) * 6e4; }
  function ptLog(f) { var d = ymd(new Date()), o = S.pt.log[d] = S.pt.log[d] || {}; o[f] = (o[f] || 0) + 1; save(); }
  function ptTone(f, d, v) {
    if (S.read.ptMute) return;
    try {
      PT.ac = PT.ac || new (window.AudioContext || window.webkitAudioContext)();
      if (PT.ac.state === "suspended") PT.ac.resume();
      var o = PT.ac.createOscillator(), g = PT.ac.createGain(), t = PT.ac.currentTime;
      o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(PT.ac.destination); o.start(); o.stop(t + d);
    } catch (e) {}
  }
  function ptSents(sec, from, to) {
    var out = [];
    paras(sec).forEach(function (raw, i) {
      if (i < from || i > to) return;
      var pp = parsePara(raw); if (pp.kind !== "p" && pp.kind !== "tip") return;
      pp.plain.split(/(?<=[。！？；])/).forEach(function (s) { s = s.trim(); if (s.length >= 14) out.push(clip(s, 58)); });
    });
    return out;
  }
  function ptShuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // 正確句取自最近約 600 字；另外兩句優先取同一章的其他節，不夠才用同科其他章
  function ptPick(sid, cid, sec, cur) {
    var ps = paras(sec), from = cur, n = 0;
    while (from > 0 && n < 600) { from--; n += ps[from].length; }
    var to = cur, good = ptSents(sec, from, to);
    while (!good.length && ++to < ps.length) good = ptSents(sec, from, to);   // 停在小標或圖表上：往下找最近的段落
    if (!good.length) return null;
    var ans = good[Math.floor(Math.random() * good.length)], pool = [], far = [];
    chapters(sid).forEach(function (c) { (c.sections || []).forEach(function (x) { if (x === sec) return; var a = ptSents(x, 0, 1e9); if (c.id === cid) pool = pool.concat(a); else far = far.concat(a); }); });
    function take(list, out) { ptShuffle(list).some(function (t) { if (t !== ans && out.indexOf(t) < 0) out.push(t); return out.length >= 2; }); return out; }
    var wrong = take(pool, []); if (wrong.length < 2) wrong = take(far, wrong);
    if (wrong.length < 2) return null;
    return ptShuffle([{ t: ans, ok: true }, { t: wrong[0] }, { t: wrong[1] }]);
  }
  function ptClose() { if (PT.box) { clearInterval(PT.box._iv); (PT.box._w || []).forEach(clearTimeout); PT.box.remove(); PT.box = null; } }
  function ptResume() { if (PT.tts && TT.on && TT.paused) { speechSynthesis.resume(); ttsPaused(false); if (TT.rearm) TT.rearm(); } PT.tts = false; }
  function ptShell() {
    var face = h("div", { class: "pt-face" }); face.innerHTML = PT_OWL;
    var inner = h("div", { class: "pt-in" }, face), box = h("div", { class: "ptw" + (S.read.ptSoft ? " soft" : ""), role: "dialog", "aria-label": "考場巡查" }, inner);
    box.addEventListener("pointermove", function (ev) {
      var r = box.getBoundingClientRect(), dx = (ev.clientX - r.left) / r.width - 0.5, dy = (ev.clientY - r.top) / r.height - 0.3;
      [].forEach.call(box.querySelectorAll(".pt-pu"), function (p) { p.setAttribute("cx", +p.getAttribute("data-x") + dx * 22); p.setAttribute("cy", +p.getAttribute("data-y") + dy * 14); });
    });
    box._in = inner; box._w = []; PT.box = box; document.body.appendChild(box);
    return box;
  }
  // kind：pat＝定時巡查；back＝離開超過 10 分鐘回來，問離開前讀到哪一句（答錯不倒退、不記錄）
  function ptOpen(kind, sid, cid, sec, cur, ctx) {
    var opts = ptPick(sid, cid, sec, cur); if (!opts) return false;
    PT.tts = TT.on && !TT.paused;
    if (PT.tts) { speechSynthesis.pause(); ttsPaused(true); clearTimeout(TT.wd); }
    var box = ptShell(), soft = !!S.read.ptSoft, total = soft ? 20 : 15, left = total, started = Date.now();
    var ask = kind === "back" ? "回來了。離開前讀到哪一句？" : "停。剛剛讀到哪一句？";
    var say = h("div", { class: "pt-say", text: "叩。" }), num = h("div", { class: "pt-num", text: String(total) }), bar = h("i"), res = h("div", { class: "pt-res" }), stamp = h("div", { class: "pt-stamp" });
    var list = h("div", { class: "pt-opts", hidden: true }), btns = [];
    function finish(msg, txt, st, after) {
      clearInterval(box._iv); box.classList.remove("hot"); say.textContent = msg; res.textContent = txt;
      btns.forEach(function (b, i) { b.disabled = true; if (opts[i].ok) b.classList.add("ans"); });
      if (st) { stamp.textContent = st; stamp.classList.add("on"); ptTone(70, 0.25, 0.5); }
      box._w.push(setTimeout(function () { ptClose(); after(); }, 1300));
    }
    function pick(o, b) {
      if (kind === "back") return finish("……繼續。", o.ok ? "記得就好，接著讀。" : "沒關係，接著讀。", "", ptResume);
      if (o.ok) { ptLog("ok"); return finish("……繼續。", "通過，接著讀。", "", ptResume); }
      b.classList.add("bad"); ptLog("bad");
      finish("這段重讀。", "回到這個小標開頭，最多退回約 5 分鐘。", "重讀", function () { PT.tts = false; ptRewind(ctx, cur); });
    }
    opts.forEach(function (o) { var b = h("button", { class: "pt-opt", text: o.t, onclick: function () { pick(o, b); } }); btns.push(b); list.appendChild(b); });
    box._in.appendChild(h("div", { class: "pt-body" },
      h("div", { class: "pt-top" }, h("div", null, h("div", { class: "pt-tag", text: "考場巡查" }), say), num),
      h("div", { class: "pt-bar" }, bar), list, res));
    box.appendChild(stamp);
    ["叩。", "叩、叩。", "叩、叩、叩。"].forEach(function (s, i) { box._w.push(setTimeout(function () { say.textContent = s; ptTone(95, 0.16, 0.5); }, i * 800)); });
    box._w.push(setTimeout(function () {
      say.textContent = ask; list.hidden = false;
      box._iv = setInterval(function () {
        if (document.hidden) return;
        left--; num.textContent = left; bar.style.width = (left / total * 100) + "%";
        if (left <= 5 && left > 0 && !soft) { box.classList.add("hot"); ptTone(880, 0.06, 0.14); }
        if (left > 0) return;
        if (kind === "back") return finish("……繼續。", "接著讀。", "", ptResume);
        ptLog("none");
        finish("人呢？", "沒有回應，朗讀和計時都先暫停。", "暫停", function () { PT.tts = false; var r = S.run; if (r && r.t0) { tAway(started); r.idl = 1; save(); runBar(); } });
      }, 1000);
    }, 2600));
    return true;
  }
  function ptRewind(ctx, cur) {
    if (!ctx || !ctx.art.isConnected) return;
    var ps = paras(ctx.sec), lim = 1000 * (TT.on ? (S.read.ttsr || 1) : 1), n = 0, to = cur;
    for (var i = cur; i >= 0; i--) { n += ps[i].length; if (n > lim) break; to = i; if (ps[i].slice(0, 3) === "## ") break; }
    if (TT.on && TT.art === ctx.art) ttsSpeak(to);
    else if (ctx.art.children[to]) ctx.art.children[to].scrollIntoView({ block: "start", behavior: "smooth" });
  }
  // 做題超時提醒：不抽問、不暫停，只提醒一次
  function ptOver(min) {
    var box = ptShell();
    box._in.appendChild(h("div", { class: "pt-body" },
      h("div", { class: "pt-top" }, h("div", null, h("div", { class: "pt-tag", text: "考場巡查" }), h("div", { class: "pt-say", text: "這題已經 " + min + " 分鐘。先做決定或標記。" }))),
      h("button", { class: "pt-opt", text: "知道了", onclick: ptClose })));
    ptTone(95, 0.16, 0.5);
  }
  function ptBusy() {
    if (rmodal || document.querySelector(".sheet-bg,.fullov,.fdlg")) return true;
    var w = window.getSelection(); return !!(w && !w.isCollapsed);
  }
  function ptTick() {
    var r = S.run, pt = S.pt, now = Date.now();
    if (PT.ctx && PT.ctx.art.isConnected && PT.ctx.paint) PT.ctx.paint();
    if (!r || !r.t0 || document.hidden || PT.box) return;
    if (pt.last && now - pt.last > 6e5) PT.back = true;
    pt.last = now;
    if (++PT.tick % 15 === 0) save();
    if (r.ext || S.read.ptOff) return;
    var hash = location.hash;
    if (hash.indexOf("#/p/") === 0) {
      var q = PT.q;
      if (q && q.k === curQ && picked[q.k] == null && !PT.qdone[q.k]) {
        PT.qms[q.k] = (PT.qms[q.k] || 0) + 1000;
        if (PT.qms[q.k] >= q.lim && !ptBusy()) { PT.qdone[q.k] = 1; ptLog("over"); ptOver(Math.round(q.lim / 6e4)); }
      }
      return;
    }
    if (hash.indexOf("#/rd/") !== 0) return;
    var c = PT.ctx; if (!c || !c.art.isConnected) return;
    var today = ymd(new Date());
    if (pt.d !== today || pt.left == null) { pt.d = today; pt.left = Math.max(3e5, ptRand()); }
    var cur = TT.on && TT.art === c.art ? TT.i : c.top(), busy = ptBusy();
    if (PT.back && !busy) {
      PT.back = false;
      var a = pt.at, sc = a && section(a.sid, a.cid, a.xid);
      if (sc && ptOpen("back", a.sid, a.cid, sc, Math.min(a.p, paras(sc).length - 1), null)) return;
    }
    pt.at = { sid: c.sid, cid: c.cid, xid: c.xid, p: cur };
    pt.left -= 1000;
    if (pt.left <= 0 && !busy) pt.left = ptOpen("pat", c.sid, c.cid, c.sec, cur, c) ? ptRand() : 6e4;
  }
  setInterval(ptTick, 1000);
  window.addEventListener("hashchange", function () { if (PT.box) { ptClose(); PT.tts = false; } });
  function ptCard() {
    var R = S.read;
    function chip(on, label, fn) { return h("button", { class: "chip", "aria-pressed": String(!!on), text: label, onclick: function () { fn(); save(); route(); } }); }
    return h("div", { class: "card" }, h("div", { class: "h2", text: "監考官巡查" }),
      h("div", { class: "small", text: "計時中讀課文時，貓頭鷹監考官會不定時來問剛剛讀到哪一句；做題時超過 2 分鐘（有短文的題 4 分鐘）會提醒一次。背單字不巡查。暫停或結束計時，倒數也不會重來。" }),
      h("div", { class: "chips" }, chip(!R.ptOff, "開", function () { R.ptOff = 0; }), chip(R.ptOff, "關", function () { R.ptOff = 1; })),
      h("div", { class: "small", text: "多久巡查一次" }),
      h("div", { class: "chips" }, [["a", "8–20 分鐘"], ["b", "4–10 分鐘"], ["c", "15–30 分鐘"]].map(function (o) { return chip((R.ptf || "b") === o[0], o[1], function () { R.ptf = o[0]; S.pt.left = ptRand(); }); })),
      h("div", { class: "small", text: "聲音與強度" }),
      h("div", { class: "chips" }, chip(!R.ptMute, "有聲音", function () { R.ptMute = 0; }), chip(R.ptMute, "靜音", function () { R.ptMute = 1; }), chip(!R.ptSoft, "高壓", function () { R.ptSoft = 0; }), chip(R.ptSoft, "一般", function () { R.ptSoft = 1; })),
      h("div", { class: "h2", style: "margin-top:16px", text: "長選項判斷卡" }),
      h("div", { class: "small", text: "電腦版遇到四個選項合計超過 100 字的題目，右側出現判斷卡，每個選項都標 ○、✕ 或 ?（這句話對不對）才能作答；已排除的選項不必再標。" }),
      h("div", { class: "chips" }, chip(!R.qjOff, "開", function () { R.qjOff = 0; }), chip(R.qjOff, "關", function () { R.qjOff = 1; })),
      h("div", { class: "h2", style: "margin-top:16px", text: "時間統計的空檔" }),
      h("div", { class: "chips" }, chip(!R.gapOff, "顯示", function () { R.gapOff = 0; }), chip(R.gapOff, "不顯示", function () { R.gapOff = 1; })));
  }
  // 時間統計：今天的巡查結果，以及從第一次開始計時到現在的計時與空檔
  function ptStats(today, timed) {
    var o = S.pt.log[today] || {}, first = 0;
    Object.keys(S.tl).forEach(function (i) { var x = S.tl[i]; if (!x.del && x.d === today && x.a && (!first || x.a < first)) first = x.a; });
    var r = S.run, live = 0;
    if (r && r.d === today) { live = runMs() / 6e4; if (r.a && (!first || r.a < first)) first = r.a; }
    var card = h("div", { class: "card" }, h("div", { class: "h2", text: "今天的巡查與空檔" }),
      h("div", { class: "small", text: "巡查：通過 " + (o.ok || 0) + "、答錯 " + (o.bad || 0) + "、沒回應 " + (o.none || 0) + "；做題超時提醒 " + (o.over || 0) + " 次。" }));
    if (first && !S.read.gapOff) {
      var all = Math.max(0, (Date.now() - first) / 6e4), t = timed + live;
      card.appendChild(h("div", { class: "small", text: "從第一次開始算起已過 " + fmtM(all) + "：計時 " + fmtM(t) + "，空檔 " + fmtM(Math.max(0, all - t)) + "。空檔可能包含吃飯或休息，只當參考。" }));
    }
    return card;
  }
  function runInit() {
    var r = S.run; if (!r) return;
    // 上次計時中被關掉：從最後一次心跳算起當作離開
    if (r.t0) { var hb = Math.max(r.hb || r.t0, r.t0); segFlush(hb); hourAdd(r.t0, hb); r.acc += hb - r.t0; r.t0 = null; r.away = hb; save(); }
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
        var cif = t.id.indexOf("ch:") === 0 ? chInfo(t.id.slice(3)) : null;
        if (pl[t.id]) {
          delete pl[t.id]; (pl._u = pl._u || {})[t.id] = Date.now();
          if (cif) { (pl._nt = pl._nt || {})[t.id] = 1; if (cif.tot && cif.n === cif.tot) toast("本章各節仍算已讀；要取消請到章節頁按圓圈"); }
        } else { pl[t.id] = Date.now(); if (pl._nt) delete pl._nt[t.id]; }
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
    var tip = { A: "保底是底線，不是終點；做完就接著做加碼，往今日目標走。", B: "模擬期：每天一份考卷計時寫，寫完一定要檢討。", C: "收尾：不做新題，只看錯題和易錯。", 2: "專業科目輪讀＋申論骨架。", 3: "衝刺：只重複、不練新題型。" }[P.phase];
    if (P.phase === "X") return h("div", { class: "card plan-card" }, h("div", { class: "cds" }, cds), h("div", { class: "h2", text: "今天考試，加油！" }), h("div", { class: "small", text: "看一眼易錯框就好，不做新題。" }));
    return h("div", { class: "card plan-card" },
      h("div", { class: "cds" }, cds),
      h("div", { class: "tk-head" }, h("span", { class: "eyebrow", text: "今日・已讀 " + fmtM(tot) }), sk ? h("span", { class: "pill blue", text: "連續 " + sk + " 天" }) : null),
      P.phase === "A" || P.phase === "B" || P.phase === "C" ? goalBox(P, tot) : null,
      h("div", { class: "tk-sec", text: "保底 " + bd + "/" + base.length + "・約 " + fmtM(bmin) + (ok ? "　✓ 底線完成" : "") }),
      base.map(row),
      extra.length ? h("div", { class: "tk-sec", text: "加碼（再多讀一點）" }) : null,
      extra.map(row),
      weekChart(P),
      h("a", { class: "btn soft", href: "#/stats", text: "時間統計・熱力圖與分布 ›" }),
      P.phase === "A" || P.phase === "B" ? h("a", { class: "btn soft", href: "#/sch", text: "排程表・進度回報 ›" }) : null,
      coachLine(P),
      h("div", { class: "small", text: ok ? (tot >= dayGoal(P.date) ? "今天達標了，記得按一次雲端同步。" : "底線完成了，別停在這裡，再讀一章；結束前記得按一次雲端同步。") : tip }));
  }
  // 依實際紀錄給一句話：讀書量、提前進度、速度比預估快
  function coachLine(P) {
    if (P.phase !== "A") return null;
    var rb = readBudget(P.date), L = schedList(P.date), ahead = L.filter(function (c) { return c.done && c.od > P.date; }).length, bits = [];
    if (rb.n >= 2) {
      var gd = SC.goal && SC.goal.wd || 240, dl = daysTo("2026-12-05");
      bits.push("最近有讀的日子平均 " + fmtM(rb.avg) + "，" + (rb.avg >= gd ? "這就是考生該有的節奏，繼續保持！" : "比平日目標 " + fmtM(gd) + " 少一些。每天多讀 30 分鐘，到考試前就多 " + Math.round(dl / 2) + " 小時，你做得到。"));
    }
    if (ahead) bits.push("已經提前讀完 " + ahead + " 章，後面的排程已幫你縮短。");
    var faster = Object.keys(L.reduce(function (m, c) { m[c.sid] = 1; return m; }, {})).filter(function (sid) { var pc = paceOf(sid); return pc.n && pc.v < pc.base * 0.85; }).map(function (sid) { return subj(sid).name; });
    if (faster.length) bits.push(faster.join("、") + " 你讀得比預估快，已依你的速度重排。");
    return bits.length ? h("div", { class: "small coach", text: bits.join(" ") }) : null;
  }
  // 最近 7 天各科時數
  function weekChart(P) {
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
    var tasks = (P ? P.tasks : []).slice();
    KS.subjects.forEach(function (x) { tasks.push({ id: "free:" + x.id, t: "自習・" + x.name, sid: x.id, min: 60 }); });
    tasks.push({ id: "free:", t: "自習・其他", sid: "", min: 60 });
    var sel = h("select", { class: "wk-sel", "aria-label": "任務" }, tasks.map(function (t, i) { return h("option", { value: String(i), text: t.t }); }));
    var num = h("input", { class: "wk-num", type: "number", inputmode: "numeric", min: "1", max: "600", placeholder: "分鐘" });
    var add = P ? h("div", { class: "wk-add" }, h("div", { class: "small", text: "手動補記（忘了按計時）" }), h("div", { class: "wk-addr" }, sel, num,
      h("button", { class: "rb-b", text: "加入", onclick: function () {
        var n = Math.round(parseFloat(num.value)), t = tasks[+sel.value];
        if (!t || isNaN(n) || n < 1 || n > 600) { toast("請輸入 1–600 分鐘"); return; }
        S.tl["t" + Date.now().toString(36)] = { d: P.date, k: t.id, t: t.t, sid: t.sid || "", m: n, ts: Date.now() };
        var pl = S.plan[P.date] = S.plan[P.date] || {};
        if (!pl[t.id] && t.id.indexOf("ch:") && t.id.indexOf("free:") && taskMin(P.date, t.id) >= t.min * 0.8) { pl[t.id] = Date.now(); pl._t = Date.now(); }
        save(); toast("記下 " + n + " 分鐘"); route();
      } }))) : null;
    var todayMin = dayMin(today);
    return h("details", { class: "wk" }, h("summary", { text: "今天 " + fmtM(todayMin) + "・近 7 天 " + fmtM(tot) + (tot ? "・看各科分布" : "") }),
      h("div", { class: "wk-g" }, cols), leg.length ? h("div", { class: "wk-lgs" }, h("b", { text: "近 7 天各科：" }), leg) : null,
      add, rows.length ? h("div", { class: "wk-logs" }, h("div", { class: "small", text: "今天的紀錄（合計 " + fmtM(todayMin) + "，只含今天）" }), rows) : null);
  }

  // ---------- 首頁 ----------
  // ---------- 主介面：底部五個分頁（今天／科目／錯題／資料庫／設定） ----------
  var TABS = [["", "今天", "home"], ["subjects", "科目", "book"], ["wrong", "錯題", "flag"], ["db", "資料庫", "db"], ["settings", "設定", "gear"]];
  var TAB_IC = {
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'
  };
  var tabbar = null;
  function setTabbar(cur) {
    if (cur == null) { if (tabbar) tabbar.hidden = true; document.body.classList.remove("has-tabs"); return; }
    if (!tabbar) { tabbar = h("nav", { class: "tabbar", "aria-label": "主選單" }); document.body.appendChild(tabbar); }
    tabbar.hidden = false; document.body.classList.add("has-tabs");
    tabbar.replaceChildren.apply(tabbar, TABS.map(function (t) {
      var a = h("a", { href: "#/" + t[0], "aria-current": cur === t[0] ? "page" : null });
      var ic = document.createElement("span"); ic.className = "tb-ic";
      ic.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TAB_IC[t[2]] + "</svg>";
      a.appendChild(ic); a.appendChild(h("span", { class: "tb-t", text: t[1] }));
      return a;
    }));
  }
  function subjectRows() {
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
    return rows;
  }
  function reportCard() {
    var rp = pendingReports().length, vn = vwPending().length, wn = wrPending().length, gn = wrNewGrades().length;
    return rp + vn + wn + gn ? h("a", { class: "card row rep-card", href: "#/rep" }, h("div", null, h("div", { class: "nm", text: "回報給 Claude" }), h("div", { class: "sub", text: [rp ? rp + " 則訂正等著補進課文" : "", vn ? vn + " 個生字等著補進單字程式" : "", wn ? wn + " 篇作文等著批改" : "", gn ? gn + " 篇作文批改好了" : ""].filter(Boolean).join("・") })), h("span", { class: "go", text: "›" })) : null;
  }
  function viewHome() {
    var L = S.pos.last;
    show(topbar(),
      L && L.href ? h("a", { class: "card row cont-card", href: L.href }, h("div", null, h("div", { class: "eyebrow", text: "繼續上次" }), h("div", { class: "nm", text: L.label }), L.sub ? h("div", { class: "sub", text: L.sub }) : null), h("span", { class: "go", text: "›" })) : null,
      planCard(), reportCard());
  }
  function viewSubjects() {
    show(topbar(), h("h1", { class: "pg-t", text: "科目" }), h("div", { class: "card" }, subjectRows()));
  }
  // 錯題：各科錯題數、待加強的申論、到期要閉卷重寫的申論
  function viewWrong() {
    var wb = wrongBySubject(), box = h("div", { class: "card" });
    var subs = KS.subjects.filter(function (s) { return wb.m[s.id]; }).sort(function (a, b) { return wb.m[b.id] - wb.m[a.id]; });
    box.appendChild(h("div", { class: "h2", text: wb.tot ? "錯題 " + wb.tot + " 題" : "目前沒有錯題" }));
    if (subs.length) box.appendChild(h("div", { class: "rows" }, subs.map(function (s) {
      return h("a", { class: "row", href: "#/s/" + s.id + "/wr", style: "--c:" + (COL[s.id] || COL[""]) }, h("div", null, h("div", { class: "nm", text: s.name }), h("div", { class: "sub", text: wb.m[s.id] + " 題・點開重做" })), h("span", { class: "go", text: "›" }));
    })));
    var weak = KS.essays.filter(function (x) { return S.essay[x.id] && S.essay[x.id].rate === "weak"; }), due = esDue();
    var notes = Object.keys(S.notes).filter(function (k) { return (S.notes[k] || "").trim(); }).length;
    var es = h("div", { class: "card" }, h("div", { class: "h2", text: "申論與作文" }));
    if (due.length) { es.appendChild(h("div", { class: "small", text: "到期，該閉卷重寫了：" })); due.forEach(function (x) { es.appendChild(h("a", { class: "pill blue", style: "display:inline-block;margin:4px 6px 0 0", href: "#/es/" + x.id, text: subj(x.subject).name + "・" + x.src })); }); }
    if (weak.length) { es.appendChild(h("div", { class: "small", style: "margin-top:8px", text: "標記需加強：" })); weak.forEach(function (x) { es.appendChild(h("a", { class: "pill", style: "display:inline-block;margin:4px 6px 0 0", href: "#/es/" + x.id, text: subj(x.subject).name + "・" + x.src })); }); }
    if (!due.length && !weak.length) es.appendChild(h("div", { class: "small", text: "沒有需要回頭的申論或作文。" }));
    show(topbar(), h("h1", { class: "pg-t", text: "錯題" }), box, es, h("div", { class: "card" }, h("div", { class: "h2", text: "我的訂正" }), h("div", { class: "small", text: "共寫了 " + notes + " 題訂正。用右緣的搜尋可以一次找出來。" })));
  }
  function viewSettings() {
    var next = S.theme === "dark" ? "light" : S.theme === "light" ? "" : "dark";
    var theme = h("div", { class: "card" }, h("div", { class: "h2", text: "外觀" }),
      h("div", { class: "chips" }, [["", "跟隨系統"], ["light", "日間"], ["dark", "夜間"]].map(function (t) { return h("button", { class: "chip", "aria-pressed": String(S.theme === t[0]), text: t[1], onclick: function () { S.theme = t[0]; save(); applyTheme(); route(); } }); })));
    var idle = h("div", { class: "card" }, h("div", { class: "h2", text: "計時：閒置幾分鐘就暫停" }),
      h("div", { class: "small", text: "計時中這麼久沒有觸控或捲動，就先暫停並問你要不要算。申論、作文至少 20 分鐘。寫在紙上的話選長一點，或在計時列按 ⏳ 只改這一次。朗讀中不算閒置。" }),
      h("div", { class: "chips" }, IDLE_OPTS.map(function (v) { return h("button", { class: "chip", "aria-pressed": String((S.idle || 3) === v), text: v + " 分鐘", onclick: function () { S.idle = v; save(); route(); } }); })));
    show(topbar(), h("h1", { class: "pg-t", text: "設定" }), syncCard(), theme, idle, ptCard(),
      h("div", { class: "card" }, h("div", { class: "h2", text: "備份" }), h("div", { class: "small", text: "進度存在這個瀏覽器。也可以匯出成檔案，到另一台裝置匯入。" }),
        h("div", { class: "btns" }, h("button", { class: "btn soft", text: "匯出進度", onclick: exportData }), h("label", { class: "btn soft", for: "imp", text: "匯入進度" }),
          h("input", { id: "imp", type: "file", accept: "application/json", hidden: true, onchange: importData }))),
      reportCard(), h("a", { class: "card row", href: "#/sch" }, h("div", null, h("div", { class: "nm", text: "排程表・進度回報" }), h("div", { class: "sub", text: "每章預定日與狀態" })), h("span", { class: "go", text: "›" })), verCard());
  }
  // ---------- 資料庫：名詞解釋、人物、憲法解釋 ----------
  var dbState = { tab: "terms", q: "", sid: "" };
  var DB_TABS = [["terms", "名詞"], ["people", "人物"], ["rulings", "憲法解釋"]];
  function dbRefs(refs) {
    return (refs || []).map(function (r) { var c = chapter(r[0], r[1]), x = c && section(r[0], r[1], r[2]); return x ? h("a", { class: "pill", href: "#/rd/" + r.join("/"), text: "課文：" + x.title }) : null; });
  }
  function dbText(it, tab) {
    if (tab === "terms") return [it.zh, it.en, it.text, (it.tags || []).join(" ")].join(" ");
    if (tab === "people") return [it.name, it.en, it.role, (it.theories || []).map(function (t) { return t.t + " " + t.n; }).join(" ")].join(" ");
    return [it.no, it.title, it.issue, it.holding, it.reason, it.note, it.law].join(" ");
  }
  function dbDetail(it, tab) {
    var box = h("div", { class: "db-dt" });
    if (tab === "terms") { box.appendChild(h("p", { text: it.text })); }
    else if (tab === "people") {
      if (it.role) box.appendChild(h("div", { class: "small", text: it.role }));
      (it.theories || []).forEach(function (t) { box.appendChild(h("div", { class: "db-th" }, h("b", { text: t.t }), h("p", { text: t.n }), h("div", null, dbRefs(t.refs)))); });
    } else {
      [["爭點", it.issue], ["解釋文", it.holding], ["理由", it.reason], ["評析與考點", it.note], ["相關條文", it.law]].forEach(function (f) { if (f[1]) box.appendChild(h("div", { class: "db-f" }, h("b", { text: f[0] }), h("p", { text: f[1] }))); });
    }
    box.appendChild(h("div", null, dbRefs(it.refs)));
    return box;
  }
  function viewDb() {
    var D = KS.db || { terms: [], people: [], rulings: [] }, st = dbState, list = h("div", { class: "rows" });
    var tab = st.tab, items = (D[tab] || []).filter(function (it) {
      if (st.sid && it.sid !== st.sid) return false;
      var q = st.q.trim().toLowerCase(); if (!q) return true;
      var t = dbText(it, tab).toLowerCase(); return q.split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; });
    });
    var title = { terms: function (it) { return it.zh + (it.en ? "（" + it.en + "）" : ""); }, people: function (it) { return it.name + (it.en ? "（" + it.en + "）" : ""); }, rulings: function (it) { return it.no + "　" + it.title; } }[tab];
    items.forEach(function (it) {
      list.appendChild(h("details", { class: "db-row" }, h("summary", null, h("span", { class: "db-sub", style: "--c:" + (COL[it.sid] || COL[""]), text: (subj(it.sid) || { name: "" }).name }), h("span", { class: "nm", text: title(it) })), dbDetail(it, tab)));
    });
    if (!items.length) list.appendChild(h("div", { class: "empty", text: (D[tab] || []).length ? "沒有符合的項目。" : "這一類還沒有資料，等資料交接後會出現在這裡。" }));
    var inp = h("input", { class: "fd-in", type: "search", placeholder: "搜尋這一類（空白分隔＝都要有）", value: st.q, oninput: function () { st.q = inp.value; var pos = inp.selectionStart; viewDb(); var n = document.querySelector(".db-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } }); inp.classList.add("db-q");
    var subIds = []; (D[tab] || []).forEach(function (it) { if (subIds.indexOf(it.sid) < 0) subIds.push(it.sid); });
    var chips = h("div", { class: "chips" }, DB_TABS.map(function (t) { return h("button", { class: "chip", "aria-pressed": String(tab === t[0]), text: t[1] + " " + (D[t[0]] || []).length, onclick: function () { st.tab = t[0]; st.sid = ""; viewDb(); } }); }));
    var sch = subIds.length > 1 ? h("div", { class: "chips sm", style: "margin-top:8px" }, subIds.map(function (sid) { return h("button", { class: "chip", "aria-pressed": String(st.sid === sid), text: (subj(sid) || { name: sid }).name, onclick: function () { st.sid = st.sid === sid ? "" : sid; viewDb(); } }); })) : null;
    show(topbar(), h("h1", { class: "pg-t", text: "資料庫" }), h("div", { class: "card" }, chips, inp, sch), h("div", { class: "card" }, list));
  }
  // ---------- 版本與更新 ----------
  function verNum(v) { var m = /ks-v(\d+)/.exec(v || ""); return m ? +m[1] : 0; }
  function latestVer() {
    return fetch("sw.js?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); })
      .then(function (t) { var m = /VER\s*=\s*"([^"]+)"/.exec(t); return m ? m[1] : ""; });
  }
  function forceUpdate() {
    updating = true; save();
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
  function doSync(btn, after) {
    if (syncing) return; syncing = true;
    function fin() { syncing = false; (after || route)(); }
    if (btn) { btn.disabled = true; btn.textContent = "同步中…"; }
    KSSync.sync(S, function (m) { KSSync.FIELDS.forEach(function (k) { S[k] = m[k]; }); migrate(); save(); })
      .then(function (r) { markSynced(); toast(r.up ? "已同步（有更新上傳）" : "已同步，雲端已是最新"); fin(); })
      .catch(function (e) { toast(syncErr(e)); fin(); });
  }
  // 右緣同步鈕（search.js）：合併後 S 的物件都換新了，頁面一定要重畫，才不會寫到舊物件；但要留在原位，不跳回頂端
  var keepY = null;
  window.KSQuick = {
    ttsExpand: function () { S.read.ttsc = 0; save(); ttsPlace(); },
    sync: function (done) {
      if (syncing) return done();
      if (!KSSync.cfg().token) { toast("先貼上權杖才能同步"); if (location.hash !== "#/settings") go("#/settings"); return done(); }
      var at = location.hash;
      doSync(null, function () {
        if (location.hash === at) keepY = window.scrollY;
        var y = keepY;
        route(); keepY = null;
        if (y != null) window.scrollTo(0, y);
        done();
      });
    }
  };
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
      var gmAll = gmCases(sid, "all");
      if (gmAll.length) body.appendChild(h("a", { class: "row", href: "#/gm/" + sid },
        h("div", null, h("div", { class: "nm", text: "釋字法庭" }), h("div", { class: "sub", text: "背釋字的推理遊戲・已熟 " + gmDone(gmAll) + "/" + gmAll.length })), h("span", { class: "go", text: "›" })));
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
    show(topbar("#/subjects", "科目"), h("div", { class: "card" }, h("div", { class: "title", text: s.name }),
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
        var stg = hasStage(sid) ? stageNow() : 0, sq = set.items.filter(function (it) { return it.q.sec === sec.id && (!stg || inStage(it.e, it.q, stg)); }), mq = sq.length, sc = counts(sq), ql = stg === 1 ? "重點題 " : "選擇題 ";
        var mk = (S.marks[mkey(sid, sec.id)] || []).length;
        var qs = !mq ? "" : sc.done === 0 ? ql + mq + "・未作答" : sc.done >= mq ? ql + mq + "・已做完" + (sc.wrong ? "（錯 " + sc.wrong + "）" : "") : ql + sc.done + "/" + mq + " 已做";
        var rp = S.pos["rd:" + sid + ":" + sec.id], rs = !rp ? "" : rp.fin ? "已讀完" : rp.pc ? "讀到 " + rp.pc + "%" : "";
        var fck = (function (xid, on) { return h("button", { class: "fin-ck" + (on ? " on" : ""), "aria-label": on ? "取消已讀" : "標記為已讀", title: on ? "已讀完，點一下取消" : "點一下標記為已讀", text: on ? "✓" : "", onclick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setFin(sid, cid, xid, !on); toast(on ? "已取消，這節不會再自動算已讀" : "已標記為已讀"); route(); } }); })(sec.id, !!(rp && rp.fin));
        var sub = [sec.text ? "課文" : "重點條列", rs, qs, mk ? "畫線 " + mk : ""].filter(Boolean).join("・");
        rr.appendChild(h("a", { class: "row row-fin", href: "#/rd/" + sid + "/" + cid + "/" + sec.id },
          fck, h("div", null, h("div", { class: "small", text: (idx + 1) + "-" + (i + 1) }), h("div", { class: "nm", text: sec.title }), h("div", { class: "sub", text: sub })),
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
      var ec = h("div", { class: "card" }, h("div", { class: "h2", text: sid === "chn" ? "本章作文題" : "本章申論題" }));
      var rows = h("div", { class: "rows" });
      es.forEach(function (x) {
        var r = S.essay[x.id] && S.essay[x.id].rate;
        rows.appendChild(h("a", { class: "row", href: "#/es/" + x.id }, h("div", null, h("div", { class: "sub", text: x.src }), h("div", { text: x.q.length > 46 ? x.q.slice(0, 46) + "…" : x.q })),
          r === "ok" ? h("span", { class: "pill green", text: "掌握" }) : r === "weak" ? h("span", { class: "pill red", text: "加強" }) : h("span", { class: "go", text: "›" })));
      });
      ec.appendChild(rows);
      ec.appendChild(h("div", { class: "btns" }, h("a", { class: "btn soft", href: "#/print/" + key + "/es", text: sid === "chn" ? "列印本章作文題" : "列印本章申論題" })));
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
  var qmode = false, qshow = {}, curQ = null;
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
  var qAnchor = null, coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  // 浮動工具列：貼著選取的字出現（手機放在字下方，避開系統的複製選單；電腦放在字上方）
  function qBar(btns, rect) {
    if (!qbar) { qbar = h("div", { class: "selbar qfloat" }); document.body.appendChild(qbar); }
    qbar.replaceChildren.apply(qbar, btns.map(function (b) {
      return h("button", { class: "btn" + (b[2] ? " soft" : ""), text: b[0], onpointerdown: function (ev) { ev.preventDefault(); }, onclick: b[1] });
    }));
    qbar.hidden = false; qAnchor = rect || qAnchor; qPlace();
  }
  function qPlace() {
    if (!qbar || qbar.hidden || !qAnchor) return;
    var r = typeof qAnchor === "function" ? qAnchor() : qAnchor; if (!r) return;
    var w = qbar.offsetWidth, hh = qbar.offsetHeight, vw = document.documentElement.clientWidth;
    var left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    var top = coarse ? r.bottom + 14 : r.top - hh - 8;
    if (top < 8) top = r.bottom + 10;
    var tb = document.getElementById("ttsbar"), lim = tb && !tb.hidden && tb.parentNode === document.body ? tb.getBoundingClientRect().top - 8 : innerHeight - 8;   // 不要被底部的朗讀列擋住
    if (top + hh > lim) top = Math.max(8, r.top - hh - 8);
    qbar.style.left = left + "px"; qbar.style.top = top + "px";
  }
  window.addEventListener("scroll", function () { if (qbar && !qbar.hidden) { if (qsel && qsel.erase) qHide(); else qPlace(); } }, { passive: true });
  function qHide() { if (qbar) qbar.hidden = true; qsel = null; }
  function qAdd() {
    var s = qsel; qHide(); if (!s) return;
    (S.qm[s.c] = S.qm[s.c] || []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), f: s.f, o: s.o, q: s.q, ts: Date.now() });
    save(); if (curQ) qshow[curQ] = true;
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
    qBar([[el.getAttribute("data-mf") === "n" ? "畫重點" : "畫線", qAdd]], function () { var w2 = window.getSelection(); return w2 && w2.rangeCount ? w2.getRangeAt(0).getBoundingClientRect() : null; });
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
    var mr = mk.getBoundingClientRect();
    qBar([["擦掉這條線", function () { qErase(el, c, id); }], ["取消", qHide, 1]], mr);
  }, true);

  // 快捷鍵（電腦）：選字後 Enter 畫線；1–4 劃掉／恢復選項；作答後 Enter 或 → 下一題。輸入文字時不攔截。
  document.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var t = ev.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (location.hash.indexOf("#/p/") !== 0 || document.querySelector(".fullov,.fdlg")) return;
    if (ev.key === "Enter" && qsel && qsel.q && !qsel.erase) { ev.preventDefault(); qAdd(); return; }
    if (/^[1-4]$/.test(ev.key)) {
      var xs = document.querySelectorAll(".opts .opt .ox, .opts .opt.mk .L"); var el = xs[+ev.key - 1];
      if (el) { ev.preventDefault(); el.click(); }
      return;
    }
    if (ev.key === "Enter" || ev.key === "ArrowRight") {
      if (tag === "BUTTON" || tag === "A") return;
      var nb = [].filter.call(document.querySelectorAll(".card .btns .btn"), function (b) { return b.textContent !== "上一題" && !b.disabled; })[0];
      if (nb && document.querySelector(".verdict")) { ev.preventDefault(); nb.click(); }
    }
  });
  document.addEventListener("mouseup", function () {
    if (!coarse && S.read && S.read.qauto && qsel && qsel.q && !qsel.erase && !qsel.rd) setTimeout(function () { if (qsel && qsel.q && !qsel.erase) qAdd(); }, 30);
  });

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
    var ox = h("span", { class: "ox", role: "button", tabindex: "-1", "aria-label": (qxOf(k).indexOf(i) >= 0 ? "恢復選項 " : "劃掉選項 ") + LET[i], text: qxOf(k).indexOf(i) >= 0 && show ? "↺" : "✕", onclick: function (ev) { ev.stopPropagation(); ev.preventDefault(); toggleX(k, i); qshow[k] = true; refreshFrom(ox); } });
    return h("button", { class: cls + " hasx", onclick: fn }, h("span", { class: "L", text: LET[i] }), t, ox);
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
  function ksIcon(n) {
    var P = { search: '<circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6"/>', pencil: '<path d="M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16v4"/><path d="M13.5 6.5l4 4"/>' };
    var w = document.createElement("span"); w.className = "ks-ic";
    w.innerHTML = '<svg viewBox="0 0 24 24" width="1.25em" height="1.25em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + "</svg>";
    return w;
  }
  function modeBtn(on, fn) {
    return h("button", { class: "chip qm-btn", "aria-pressed": String(on), onclick: fn }, ksIcon("pencil"), on ? " 選項劃記中" : " 選項劃記");
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
    curQ = k;
    var vis = qmode || pk != null || !!qshow[k], old = hasQm(it);
    PT.q = pk == null ? { k: k, lim: q.g ? 24e4 : 12e4 } : null;
    // 長選項判斷卡：電腦版、四個選項合計超過 100 字才出現，每項都判斷完才能作答
    var jc = pk == null && !S.read.qjOff && q.o.join("").length > 100 && window.matchMedia("(min-width: 900px)").matches, jm = qj[k] = qj[k] || {};
    // 卡上的 ○✕? 是「這句話對不對」，選項的 ✕ 是「這項不選」，兩者分開（「選錯誤的」題目，對的句子要標 ○ 再排除）。已排除的選項視同看過，不必再標
    function jOut(i) { return vis && qxOf(k).indexOf(i) >= 0; }
    function jAll() { return q.o.every(function (_, i) { return !!jm[i] || jOut(i); }); }
    var opts = h("div", { class: "opts" }), jBox = null;
    q.o.forEach(function (_, i) {
      var cls = pk == null ? "" : ok(q, i) ? "right" : i === pk ? "wrong" : "dim";
      opts.appendChild(optEl(it, i, cls, pk == null ? function () {
        if (jc && !jAll()) { toast("先判斷完每個選項"); if (jBox) { jBox.classList.remove("nudge"); void jBox.offsetWidth; jBox.classList.add("nudge"); } return; }
        picked[k] = i; record(it.e, it.n, ok(q, i)); save(); viewPractice(key, n);
      } : null, qmode, vis));
    });
    if (jc) {
      var jSet = function (i, v) {
        if (jm[i] === v) delete jm[i]; else jm[i] = v;
        viewPractice(key, n);
      };
      jBox = h("aside", { class: "jcard" }, h("div", { class: "jc-t", text: "判斷卡" }),
        q.o.map(function (_, i) {
          var v = jm[i];
          return h("div", { class: "jc-row" + (jOut(i) ? " out" : "") }, h("span", { class: "jc-l", text: LET[i] }), [["o", "○"], ["x", "✕"], ["q", "?"]].map(function (m) {
            return h("button", { class: "jc-b" + (v === m[0] ? " on " + m[0] : ""), "aria-label": LET[i] + " 標記 " + m[1], "aria-pressed": String(v === m[0]), text: m[1], onclick: function () { jSet(i, m[0]); } });
          }));
        }),
        h("div", { class: "small", text: jAll() ? "都判斷完了，可以作答。" : "全部標完才能作答。" }));
    }
    var tools = h("div", { class: "qtools" }, modeBtn(qmode, function () { qmode = !qmode; qHide(); viewPractice(key, n); }),
      !vis && old ? h("button", { class: "link", text: "顯示上次劃記（" + old + "）", onclick: function () { qshow[k] = true; viewPractice(key, n); } }) : null,
      coarse ? null : h("button", { class: "link", "aria-pressed": String(!!S.read.qauto), text: "選字後自動畫線：" + (S.read.qauto ? "開" : "關"), onclick: function () { S.read.qauto = S.read.qauto ? 0 : 1; save(); viewPractice(key, n); } }));
    var eng = it.e.subject === "eng";
    var card = h("div", { class: "card" + (eng ? " eng-lk" : ""), "data-src": eng ? qLabel(it) : null },
      h("div", { class: "qno" }, h("span", { text: n + " / " + set.items.length }), h("span", { text: it.e.short + " 第 " + qno(it) + " 題" }), qsBtn(n, key)),
      tools,
      h("div", { class: "small qm-hint", text: qmode ? "選項劃記中：選字畫線，點字母可劃掉選項。作答前先關掉。" : coarse ? "選取題目的字就會跳出「畫線」；選項右側 ✕ 可劃掉。" : "選取題目的字會跳出「畫線」(按 Enter 也行)；按 1–4 或點 ✕ 劃掉選項；作答後按 Enter 下一題。" }),
      psgEl(it, true, true, vis, pk != null), q.q ? mkText("div", "qtext", q.q, k, "q", true, vis) : null, opts);
    card._rf = function () { viewPractice(key, n); };
    if (pk != null) {
      card.appendChild(h("div", { style: "margin-top:14px" }, h("span", { class: "verdict " + (ok(q, pk) ? "ok" : "no"), text: ok(q, pk) ? "答對了" : "答錯，正解是 " + ansText(q) }), pinBtn(it)));
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
    app.classList.toggle("has-jc", !!jc);
    show(topbar(set.back, set.title), jc ? h("div", { class: "jc-wrap" }, card, jBox) : card);
  }
  var qj = {};
  // 線上作答做完後要去哪：節 → 下一節（最後一節 → 下一章第一節）；章 → 下一章；其他回原處
  function nextTarget(key, set) {
    var p = key.split(":"), res = { href: set.back, label: "完成" };
    if ((p[0] !== "c" && !(p[0] === "t" && p[4])) || p[2] === "_none") return res;
    var sx = p[0] === "t" ? p[4] : p[3];
    var chs = chapters(p[1]), ci = chs.indexOf(chapter(p[1], p[2])); if (ci < 0) return res;
    var secs = chs[ci].sections, nextCh = chs[ci + 1];
    function firstOf(c) { return c.sections.length ? "#/rd/" + p[1] + "/" + c.id + "/" + c.sections[0].id : "#/c/" + p[1] + "/" + c.id; }
    if (sx) {
      var si = secs.map(function (x) { return x.id; }).indexOf(sx);
      if (si >= 0 && si < secs.length - 1) return { href: "#/rd/" + p[1] + "/" + p[2] + "/" + secs[si + 1].id, label: "完成，下一節 ›" };
    }
    if (nextCh) return { href: sx ? firstOf(nextCh) : "#/c/" + p[1] + "/" + nextCh.id, label: "完成，下一章 ›" };
    return res;
  }
  // 我的訂正：寫完後以閱讀模式顯示（隨內容長高，可長按畫重點）；按「編輯」改字，「全螢幕」寫長篇詳解
  function grow(ta) { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 2) + "px"; }
  // 「問 Claude」：在游標處打名字，接著可以直接打字
  function insName(ta) {
    var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, e = ta.selectionEnd == null ? s : ta.selectionEnd;
    ta.setRangeText("Claude ", s, e, "end"); ta.focus();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function askBtn(cls, fn) { return h("button", { class: cls, type: "button", text: "問 Claude", onpointerdown: function (ev) { ev.preventDefault(); }, onclick: fn }); }
  function noteBox(it) {
    var k = qid(it.e, it.n), box = h("div", { class: "nbox" }), editing = !(S.notes[k] || "").trim();
    function setNote(v) { if ((S.notes[k] || "") === v) return; S.notes[k] = v; S.nts[k] = Date.now(); save(); }
    function repOn() { S.repq[k] = { sent: false, ts: Date.now() }; save(); var c = box.querySelector(".rep-ck input"); if (c) c.checked = true; }
    function full() {
      var ta = h("textarea", { class: "full-ta", placeholder: "貼上喜歡的考生詳解，或寫自己的筆記", oninput: function () { setNote(ta.value); } });
      ta.value = S.notes[k] || "";
      var ov = h("div", { class: "fullov", role: "dialog", "aria-label": "我的訂正" },
        h("div", { class: "full-head" }, h("div", { class: "h2", text: "我的訂正" }), h("span", { class: "small", text: it.e.short + " 第 " + qno(it) + " 題" }),
          askBtn("btn soft", function () { insName(ta); repOn(); }),
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
        btns.appendChild(askBtn("link strong", function () { insName(ta); repOn(); }));
        btns.appendChild(h("button", { class: "link", text: "全螢幕", onclick: function () { setNote(ta.value); full(); } }));
        btns.appendChild(h("button", { class: "link strong", text: "完成", onclick: function () { setNote(ta.value); if (!ta.value.trim()) return toast("還沒寫內容"); editing = false; render(); } }));
        box.appendChild(h("div", { class: "nhead" }, h("span", { class: "small", text: "我的訂正" }), btns));
        box.appendChild(ta);
        requestAnimationFrame(function () { grow(ta); });
      } else {
        btns.appendChild(askBtn("link strong", function () {
          editing = true; render();
          var t2 = box.querySelector("textarea"); t2.value += "\n"; t2.setSelectionRange(t2.value.length, t2.value.length);
          insName(t2); repOn();
        }));
        btns.appendChild(h("button", { class: "link", text: "全螢幕", onclick: full }));
        btns.appendChild(h("button", { class: "link strong", text: "編輯", onclick: function () { editing = true; render(); } }));
        box.appendChild(h("div", { class: "nhead" }, h("span", { class: "small", text: "我的訂正・長按選字可畫重點" }), btns));
        box.appendChild(mkText("div", "nview", txt, k, "n", true, true));
      }
      var cb = h("input", { type: "checkbox", onchange: function () {
        if (cb.checked) { if (!(S.notes[k] || "").trim()) { cb.checked = false; return toast("先寫訂正內容"); } S.repq[k] = { sent: false, ts: Date.now() }; toast("已加入回報清單"); }
        else S.repq[k] = { off: 1, ts: Date.now() };
        save();
      } });
      cb.checked = !!(S.repq[k] && !S.repq[k].sent && !S.repq[k].off);
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
        h("div", { class: "pin-row" }, pinBtn(it)),
        vocabBox(it),
        h("p", null, h("a", { class: "link-out", href: search(q), target: "_blank", rel: "noopener", text: "到阿摩看考生詳解 ↗" })), nb);
    }
    wrap._rf = render; render();
    return wrap;
  }

  // ---------- 申論 ----------
  var revealed = {};
  // ---------- 申論作答（老師的三階段：20 分鐘可查資料寫 → 看別人的回答 → 兩天後閉卷重寫） ----------
  // S.essay[id] = {pts:[勾選], rate, ts, draft, tries:[{ts, mode:"open"|"closed", text, words, min}], other:別人的回答, fix:訂正與心得}
  // 沒有任何 AI：關鍵字比對、字數、檢查表都在本機算，不花 token。
  var ES_TARGET = 400, essayTab = {};
  var ES_TIPS = ["開頭：肯定題目，一行半（把題目換句話說，點出要回答幾件事）", "分段：每個概念自己一段，先寫標題句再展開", "關鍵字寫英文：學者、概念後面括號加英文原文", "相關概念寫越多越好但不離題（什麼都寫不出來就沒有分）", "結尾：湊一行到一行半，收束回題目", "一題 20–25 分鐘，字體端正，目標寫滿 400 字（要翻頁）"];
  var ES_SAMPLE = "題目：試說明自由主義（liberalism）和保守主義（conservatism）的中心思想及內涵，並比較兩者的差異。\n\n自由主義（liberalism）與保守主義（conservatism）是兩種對比鮮明的意識形態，以下分述之：\n\n自由主義的中心思想是保障個人自由……要項如下：\n1.個人主義（individualism）：……\n2.自由與平等：……\n3.理性：……\n4.容忍與同意：……\n\n保守主義則認為傳統是好的……要項如下：\n1.傳統與實用主義：……\n2.人的不完美性：……\n3.有機論與階級性：……\n4.權威：……\n\n兩者的差異：\n1.…… 2.…… 3.……\n\n以上為自由主義與保守主義之概念與比較。";
  function wordCount(t) { return (t || "").replace(/\s/g, "").length; }
  function esCheck(t) {
    var ps = (t || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), en = (t.match(/[A-Za-z][A-Za-z\- ]{2,}/g) || []).length, w = wordCount(t);
    return [
      ["字數 " + w + " / " + ES_TARGET, w >= ES_TARGET],
      ["有分段（" + ps.length + " 段）", ps.length >= 4],
      ["有英文關鍵字（" + en + " 個）", en >= 3],
      ["有開頭（第一段 ≤ 70 字）", ps.length > 0 && ps[0].length <= 70],
      ["有結尾（最後一段 ≤ 70 字）", ps.length > 2 && ps[ps.length - 1].length <= 70]
    ];
  }
  function esKw(x, t) {   // 每個要點：關鍵字命中了幾個
    return x.pts.map(function (pt) { var hit = (pt.k || []).filter(function (k) { return t.indexOf(k) >= 0; }); return { hit: hit, miss: (pt.k || []).filter(function (k) { return hit.indexOf(k) < 0; }) }; });
  }
  function esDue() {   // 寫過一次、滿兩天、還沒閉卷重寫的題目
    return KS.essays.filter(function (x) { var e = S.essay[x.id], tr = e && e.tries; return tr && tr.length && !tr.some(function (t) { return t.mode === "closed"; }) && Date.now() - tr[0].ts >= 2 * 864e5; });
  }
  var esSaveT = null;
  function viewEssay(id) {
    var x = essay(id); if (!x) return go("#/");
    if (isWriting(x)) return viewWriting(id, x);
    var back = "#/c/" + x.subject + "/" + (x.ch || "_none");
    var e = S.essay[id] = S.essay[id] || { pts: [] }; e.tries = e.tries || [];
    var tab = essayTab[id] || "write", closed = e.tries.some(function (t) { return t.mode === "closed"; });
    var mode = e.mode || (e.tries.length && Date.now() - e.tries[0].ts >= 2 * 864e5 && !closed ? "closed" : "open");
    function persist() { e.ts = Date.now(); save(); }
    function setTab(t) { essayTab[id] = t; viewEssay(id); }
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: x.src }), h("div", { class: "qtext", text: x.q }));
    card.appendChild(h("div", { class: "chips", style: "margin:6px 0 10px" },
      [["write", "✍️ 作答"], ["check", "🔍 對照骨架"], ["note", "📝 訂正與心得"]].map(function (t) { return h("button", { class: "chip", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { setTab(t[0]); } }); })));
    var due = e.tries.length && !closed ? Math.max(0, Math.ceil((e.tries[0].ts + 2 * 864e5 - Date.now()) / 864e5)) : 0;
    card.appendChild(h("div", { class: "small", style: "margin-bottom:8px", text: !e.tries.length ? "第 1 次：可以查書或網路資料，20 分鐘寫完整一題。" : closed ? "已完成閉卷重寫。" : due ? "第 1 次寫完了。先去看別人的回答；" + due + " 天後閉卷重寫第 2 次。" : "可以閉卷重寫第 2 次了：不查書、不看骨架。" }));
    if (tab === "write") {
      var wc = h("span", { class: "es-wc" }), bar = h("i");
      var ta = h("textarea", { class: "es-ta", placeholder: mode === "closed" ? "閉卷重寫：不要看骨架與書。" : "照老師的模板寫：開頭 → 分段 → 英文關鍵字 → 結尾", rows: "14", oninput: function () { e.draft = ta.value; upd(); clearTimeout(esSaveT); esSaveT = setTimeout(persist, 800); } });
      function upd() { var n = wordCount(ta.value); wc.textContent = n + " / " + ES_TARGET + " 字"; bar.style.width = Math.min(100, n / ES_TARGET * 100) + "%"; }
      ta.value = e.draft || ""; upd();
      var runOn = S.run && S.run.k === "es:" + id;
      card.appendChild(h("div", { class: "chips sm", style: "margin-bottom:6px" },
        h("button", { class: "chip", "aria-pressed": String(mode === "open"), text: "看書寫", onclick: function () { e.mode = "open"; persist(); viewEssay(id); } }),
        h("button", { class: "chip", "aria-pressed": String(mode === "closed"), text: "閉卷重寫", onclick: function () { e.mode = "closed"; persist(); viewEssay(id); } }),
        h("button", { class: "chip", text: runOn ? "計時中（右上角）" : "⏱ 開始 20 分鐘", onclick: function () { tStart({ id: "es:" + id, t: "申論・" + x.src, sid: x.subject, min: 20, href: "#/es/" + id }, ymd(new Date())); viewEssay(id); } })));
      card.appendChild(ta);
      card.appendChild(h("div", { class: "es-meter" }, bar)); card.appendChild(wc);
      card.appendChild(h("div", { class: "btns" },
        h("button", { class: "btn", text: "交卷，存成第 " + (e.tries.length + 1) + " 次", onclick: function () {
          var t = ta.value.trim(); if (!t) { toast("還沒寫內容"); return; }
          var min = runOn ? Math.round(runMs() / 6e4) : 0; if (runOn) tStop(true);
          e.tries.push({ ts: Date.now(), mode: mode, text: t, words: wordCount(t), min: min }); e.draft = ""; e.mode = ""; persist(); toast("已存第 " + e.tries.length + " 次（" + wordCount(t) + " 字）"); setTab("check");
        } })));
      card.appendChild(h("details", { class: "es-tips" }, h("summary", { text: "老師的寫題模板" }), h("ol", null, ES_TIPS.map(function (t) { return h("li", { text: t }); })), h("pre", { class: "es-sample", text: ES_SAMPLE })));
    } else if (tab === "check") {
      var last = e.tries[e.tries.length - 1], txt = last ? last.text : "", kw = esKw(x, txt);
      if (last) {
        card.appendChild(h("div", { class: "h2", text: "第 " + e.tries.length + " 次（" + last.words + " 字・" + (last.mode === "closed" ? "閉卷" : "看書") + (last.min ? "・" + last.min + " 分" : "") + "）" }));
        card.appendChild(h("ul", { class: "es-chk" }, esCheck(txt).map(function (c) { return h("li", { class: c[1] ? "ok" : "no", text: (c[1] ? "✓ " : "✗ ") + c[0] }); })));
        card.appendChild(h("details", { class: "es-tips" }, h("summary", { text: "我寫的內容" }), h("pre", { class: "es-sample", text: txt })));
      } else card.appendChild(h("div", { class: "small", text: "還沒交卷。下面是骨架，先自己寫過再看才有用。" }));
      var hit = 0, list = h("div");
      x.pts.forEach(function (pt, i) {
        var auto = !!(last && kw[i].hit.length > 0), on = e.pts && e.pts[i] != null ? e.pts[i] : auto; if (on) hit++;
        var cb = h("input", { type: "checkbox", id: "pt_" + id + "_" + i, onchange: function (ev) { e.pts = (e.pts || []).slice(); e.pts[i] = ev.target.checked; persist(); viewEssay(id); } }); cb.checked = !!on;
        var kws = h("div", { class: "kw" }); (pt.k || []).forEach(function (k) { kws.appendChild(h("span", { class: last ? (kw[i].hit.indexOf(k) >= 0 ? "hit" : "miss") : "", text: k })); });
        list.appendChild(h("div", { class: "pt" }, cb, h("label", { for: "pt_" + id + "_" + i }, h("div", { class: "h", text: pt.h }), kws, pt.n ? h("div", { class: "note", text: pt.n }) : null)));
      });
      card.appendChild(h("div", { class: "h2", text: "骨架：寫到 " + hit + " / " + x.pts.length + " 段" }));
      card.appendChild(h("div", { class: "small", text: last ? "綠色＝你寫到的關鍵字，紅色＝漏掉的。勾選會自動猜，可以手動改。" : "" }));
      card.appendChild(h("div", { class: "meter" }, h("i", { style: "width:" + Math.round(hit / Math.max(1, x.pts.length) * 100) + "%" })));
      card.appendChild(list);
      if (x.ref) card.appendChild(h("details", { class: "es-tips", open: "" }, h("summary", { text: "書上的參考回答" }), h("pre", { class: "es-sample", text: x.ref })));
      if (KS.ref) { var refBox = h("div"); card.appendChild(refBox); KS.ref.mount(x.id, refBox); }
      var oth = h("textarea", { class: "es-ta", rows: "5", placeholder: "第 2 步：貼上上網找到的別人的回答，對照看差在哪。", oninput: function () { e.other = oth.value; clearTimeout(esSaveT); esSaveT = setTimeout(persist, 800); } }); oth.value = e.other || "";
      card.appendChild(h("details", { class: "es-tips", open: e.other ? "" : null }, h("summary", { text: "別人的回答（對照用）" }), oth));
      card.appendChild(h("div", { class: "btns" },
        h("button", { class: "btn soft", text: "↩ 回到題目", onclick: function () { setTab("write"); } }),
        h("button", { class: "btn green", text: "掌握了", onclick: function () { rate(id, "ok"); } }),
        h("button", { class: "btn red", text: "需加強", onclick: function () { rate(id, "weak"); } })));
      if (e.rate) card.appendChild(h("div", { class: "small", style: "margin-top:8px", text: "目前標記：" + (e.rate === "ok" ? "掌握" : "需加強") }));
    } else {
      var fx = h("textarea", { class: "es-ta", rows: "10", placeholder: "訂正與心得：哪裡漏了、別人怎麼寫、下次怎麼改。", oninput: function () { e.fix = fx.value; clearTimeout(esSaveT); esSaveT = setTimeout(persist, 800); } }); fx.value = e.fix || "";
      card.appendChild(fx);
      if (e.tries.length) card.appendChild(h("div", { class: "h2", text: "寫作紀錄" }));
      e.tries.forEach(function (t, i) {
        card.appendChild(h("div", { class: "wk-log" }, h("span", { text: "第 " + (i + 1) + " 次　" + md(ymd(new Date(t.ts))) + "　" + t.words + " 字　" + (t.mode === "closed" ? "閉卷" : "看書") }),
          h("button", { class: "link", text: "刪除", onclick: function () { if (confirm("刪除第 " + (i + 1) + " 次的內容？")) { e.tries.splice(i, 1); persist(); viewEssay(id); } } })));
      });
    }
    var sib = KS.essays.filter(function (y) { return y.subject === x.subject && y.ch === x.ch; }), si = sib.indexOf(x);
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn soft", text: "上一題", disabled: si <= 0, onclick: function () { go("#/es/" + sib[si - 1].id); } }),
      h("button", { class: "btn soft", text: "下一題", disabled: si >= sib.length - 1, onclick: function () { go("#/es/" + sib[si + 1].id); } })));
    show(topbar(back, "回章節"), card);
  }
  // ---------- 國文作文（ks-v59，和申論分開）：第一次寫 → 別人的作文 → Claude 批改 → 第二次寫 → 再批改 ----------
  // S.essay[id] = {tries:[{ts, mode, text, words, min, ask, withO, rep:{ts, sent}, seen}], others:[{id, src, text, good, ts}], draft, fix, rate, ts}
  // 批改由 Claude 用 tools/grade.js 寫進 data/grades.js，鍵是「題目id:該次ts」。解開的名字只存本機（ks_grade_key），不同步。
  var GR_LS = "ks_grade_key", grOpen = null;
  var WR_TIPS = ["審題：先圈出題目名稱、必答項目、指定材料。必答項目沒寫到，是最常見的失分原因。", "立意：用一句話寫出全文主張，並回扣引文。", "結構：起（破題）、承（解釋概念）、轉（實例與反思）、合（回到主張，涉及公務時連結公務人員）。", "舉例：實例要具體，寫人、事、結果，不要只列名言。"];
  function isWriting(x) { return x.subject === "chn"; }
  function wrInfo(x) {
    var small = /小作文/.test(x.src), m = x.q.match(/文長(?:限|不超過)?\s*(\d+)\s*字|(\d+)\s*字內/), lim = small && m ? +(m[1] || m[2]) : 0;
    return { small: small, lim: lim, target: small ? (lim || 300) : 700, min: small ? 20 : 50 };
  }
  var NUM_ZH = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  function nthZh(k) { return "第" + (NUM_ZH[k] || k) + "次"; }
  function grDecode(name) {
    try {
      var b = atob(KS.grades.blob), k = new TextEncoder().encode(String(name).trim().toLowerCase()), u = new Uint8Array(b.length), i;
      if (!k.length) return null;
      for (i = 0; i < b.length; i++) u[i] = b.charCodeAt(i) ^ k[i % k.length];
      var o = JSON.parse(new TextDecoder().decode(u));
      return o && o.ok === 1 ? o : null;
    } catch (e) { return null; }
  }
  function grData() {
    if (grOpen) return grOpen;
    var s = null; try { s = localStorage.getItem(GR_LS); } catch (e) {}
    return s ? (grOpen = grDecode(s)) : null;
  }
  function grHas(id, t) { return !!(KS.grades && KS.grades.ids && KS.grades.ids[id + ":" + t.ts]); }
  function grAsk(done) {
    var inp = h("input", { class: "wr-in", type: "text", placeholder: "輸入名字", autocomplete: "off" }), msg = h("div", { class: "small", style: "min-height:1.5em;margin-top:6px" });
    function close() { mask.remove(); }
    function ok() {
      var o = grDecode(inp.value);
      if (!o) { msg.textContent = "名字不對喔，再試一次。"; inp.select(); return; }
      grOpen = o; try { localStorage.setItem(GR_LS, inp.value.trim()); } catch (e) {}
      close(); done();
    }
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") ok(); });
    var mask = h("div", { class: "gr-mask", onclick: function (ev) { if (ev.target === mask) close(); } },
      h("div", { class: "gr-box", role: "dialog", "aria-modal": "true" },
        h("div", { class: "h2", text: "這是誰批改的？" }),
        h("div", { class: "small", text: "輸入批改老師的名字就能看。每台裝置只問一次。" }),
        inp, msg,
        h("div", { class: "btns" }, h("button", { class: "btn", text: "打開批改", onclick: ok }), h("button", { class: "btn soft", text: "取消", onclick: close }))));
    document.body.appendChild(mask); inp.focus();
  }
  function grBody(text) {
    return h("div", { class: "gr-text" }, String(text).split(/\n+/).map(function (ln) {
      ln = ln.trim(); if (!ln) return null;
      if (ln.slice(0, 3) === "## ") return h("div", { class: "h2", text: ln.slice(3) });
      return h("p", null, inline(ln));
    }));
  }
  // 複製給 Claude 的文字
  function wrText(x, e, t) {
    var d = new Date(), day = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2), k = e.tries.indexOf(t) + 1;
    var lines = ["【作文批改】" + day, "請批改下面這篇作文，用 tools/grade.js 寫進刷題本。", "代號：" + x.id + " " + t.ts, "題目出處：" + x.src + "　這是我" + nthZh(k) + "寫（" + t.words + " 字" + (t.min ? "，" + t.min + " 分鐘" : "") + "，" + (t.mode === "closed" ? "閉卷" : "可查資料") + "）", "", "題目：" + x.q, ""];
    e.tries.slice(0, k - 1).forEach(function (p, i) { lines.push("〔我" + nthZh(i + 1) + "寫的，代號 " + x.id + " " + p.ts + "，請對照進步與老問題〕", p.text, ""); });
    lines.push("〔我" + nthZh(k) + "寫的，請批改這篇〕", t.text, "");
    if ((t.ask || "").trim()) lines.push("〔我想問〕", t.ask.trim(), "");
    if (t.withO) (e.others || []).filter(function (o) { return (o.text || "").trim(); }).forEach(function (o, i) {
      lines.push("〔別人的作文 " + (i + 1) + (o.src ? "（" + o.src + "）" : "") + "〕", o.text.trim());
      if ((o.good || "").trim()) lines.push("我覺得好在：" + o.good.trim());
      lines.push("");
    });
    return lines.join("\n");
  }
  function wrWalk(fn) { KS.essays.forEach(function (x) { if (!isWriting(x)) return; var e = S.essay[x.id]; if (e && e.tries) e.tries.forEach(function (t) { fn(x, e, t); }); }); }
  function wrPending() { var a = []; wrWalk(function (x, e, t) { if (t.rep && !t.rep.sent && !grHas(x.id, t)) a.push({ x: x, e: e, t: t }); }); return a; }
  function wrNewGrades() { var a = []; wrWalk(function (x, e, t) { if (grHas(x.id, t) && !t.seen) a.push({ x: x, e: e, t: t }); }); return a; }
  function wrCard() {
    var ps = wrPending(), ng = wrNewGrades(); if (!ps.length && !ng.length) return null;
    var box = h("div", { class: "card" }, h("div", { class: "h2", text: "作文" }));
    ng.forEach(function (a) { box.appendChild(h("a", { class: "row", href: "#/es/" + a.x.id, onclick: function () { essayTab[a.x.id] = "gr"; } }, h("div", null, h("div", { class: "nm", text: "批改好了：" + a.x.src }), h("div", { class: "sub", text: nthZh(a.e.tries.indexOf(a.t) + 1) + "寫的作文，點開看" })), h("span", { class: "go", text: "›" }))); });
    if (ps.length) box.appendChild(h("div", { class: "small", style: "margin-top:8px", text: "作文比較長，一次送一篇。按複製後貼給 Claude Code。" }));
    ps.forEach(function (a) {
      box.appendChild(h("div", { class: "rep-item" },
        h("div", { class: "q", text: a.x.src + "・" + nthZh(a.e.tries.indexOf(a.t) + 1) }), h("div", { class: "small", text: a.t.words + " 字" }),
        h("div", { class: "btns" },
          h("button", { class: "btn", text: "複製給 Claude", onclick: function () { copyText(wrText(a.x, a.e, a.t)); a.t.rep = { ts: Date.now(), sent: true }; a.e.ts = Date.now(); save(); viewReport(); } }),
          h("button", { class: "btn soft", text: "移出清單", onclick: function () { delete a.t.rep; a.e.ts = Date.now(); save(); viewReport(); } }))));
    });
    return box;
  }
  function viewWriting(id, x) {
    var back = "#/c/" + x.subject + "/" + (x.ch || "_none"), info = wrInfo(x);
    var e = S.essay[id] = S.essay[id] || { pts: [] }; e.tries = e.tries || []; e.others = e.others || [];
    if ((e.other || "").trim() && !e.others.length) { e.others.push({ id: "o" + Date.now(), src: "之前貼的", text: e.other, good: "", ts: Date.now() }); e.other = ""; e.ts = Date.now(); save(); }
    var n = e.tries.length, wMax = Math.max(2, n >= 2 ? n + 1 : 2), tab = essayTab[id];
    var hasDue = n === 1 && Date.now() - e.tries[0].ts >= 2 * 864e5;
    if (!tab) tab = !n ? "w1" : hasDue ? "w2" : n === 1 && !e.others.length ? "oth" : "gr";
    function persist() { e.ts = Date.now(); save(); }
    function setTab(t) { essayTab[id] = t; viewEssay(id); }
    function later() { clearTimeout(esSaveT); esSaveT = setTimeout(persist, 800); }
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: "作文・" + x.src }), h("div", { class: "qtext", text: x.q }));
    var tabs = [["w1", "✍️ 第一次"], ["oth", "📚 別人的作文" + (e.others.length ? "（" + e.others.length + "）" : "")], ["gr", "🖊️ Claude 批改"]];
    for (var ti = 2; ti <= wMax; ti++) tabs.push(["w" + ti, "✍️ " + nthZh(ti)]);
    card.appendChild(h("div", { class: "chips", style: "margin:6px 0 10px" }, tabs.map(function (t) { return h("button", { class: "chip", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { setTab(t[0]); } }); })));
    if (tab.charAt(0) === "w") wrWriteTab(+tab.slice(1));
    else if (tab === "oth") wrOthersTab();
    else wrGradeTab();
    var sib = KS.essays.filter(function (y) { return y.subject === x.subject && y.ch === x.ch; }), si = sib.indexOf(x);
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn soft", text: "上一題", disabled: si <= 0, onclick: function () { go("#/es/" + sib[si - 1].id); } }),
      h("button", { class: "btn soft", text: "下一題", disabled: si >= sib.length - 1, onclick: function () { go("#/es/" + sib[si + 1].id); } })));
    show(topbar(back, "回章節"), card);

    function wrWriteTab(k) {
      if (k <= n) {
        var t = e.tries[k - 1];
        card.appendChild(h("div", { class: "h2", text: nthZh(k) + "（" + md(ymd(new Date(t.ts))) + "・" + t.words + " 字" + (t.min ? "・" + t.min + " 分" : "") + "）" }));
        card.appendChild(h("pre", { class: "es-sample", text: t.text }));
        card.appendChild(h("div", { class: "btns" },
          h("button", { class: "btn soft", text: "看批改", onclick: function () { setTab("gr"); } }),
          h("button", { class: "btn soft", text: "刪除這次", onclick: function () { if (confirm("刪除" + nthZh(k) + "寫的內容？")) { e.tries.splice(k - 1, 1); persist(); setTab("w" + k); } } })));
        return;
      }
      if (k > n + 1) { card.appendChild(h("div", { class: "small", text: "先寫完" + nthZh(k - 1) + "，再寫這裡。" })); card.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "去寫" + nthZh(k - 1), onclick: function () { setTab("w" + (k - 1)); } }))); return; }
      var left = k >= 2 ? Math.max(0, Math.ceil((e.tries[0].ts + 2 * 864e5 - Date.now()) / 864e5)) : 0;
      card.appendChild(h("div", { class: "small", style: "margin-bottom:8px", text: k === 1 ? "先自己寫，可以查資料。大綱和第一段也可以先存。" : "閉卷重寫：不看之前的內容、批改和別人的作文。" + (left && k === 2 ? "建議再隔 " + left + " 天，記憶淡一點效果更好。" : "") }));
      var wc = h("span", { class: "es-wc" }), bar = h("i");
      var ta = h("textarea", { class: "es-ta", placeholder: "在這裡寫作文。", rows: "16", oninput: function () { e.draft = ta.value; upd(); later(); } });
      function upd() {
        var c = wordCount(ta.value), over = info.lim && c > info.lim;
        wc.textContent = c + " 字" + (info.lim ? " / 限 " + info.lim + " 字" + (over ? "，超過了" : "") : "，建議約 " + info.target + " 字");
        wc.style.color = over ? "var(--red)" : ""; bar.style.width = Math.min(100, c / info.target * 100) + "%"; bar.style.background = over ? "var(--red)" : "";
      }
      ta.value = e.draft || ""; upd();
      var runOn = S.run && S.run.k === "es:" + id;
      card.appendChild(h("div", { class: "chips sm", style: "margin-bottom:6px" },
        h("button", { class: "chip", text: runOn ? "計時中（右上角）" : "⏱ 開始 " + info.min + " 分鐘", onclick: function () { tStart({ id: "es:" + id, t: "作文・" + x.src, sid: x.subject, min: info.min, href: "#/es/" + id }, ymd(new Date())); viewEssay(id); } })));
      card.appendChild(ta);
      card.appendChild(h("div", { class: "es-meter" }, bar)); card.appendChild(wc);
      card.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "交卷，存成" + nthZh(k), onclick: function () {
        var txt = ta.value.trim(); if (!txt) { toast("還沒寫內容"); return; }
        var min = runOn ? Math.round(runMs() / 6e4) : 0; if (runOn) tStop(true);
        e.tries.push({ ts: Date.now(), mode: k === 1 ? "open" : "closed", text: txt, words: wordCount(txt), min: min }); e.draft = ""; persist();
        toast("已存" + nthZh(k) + "（" + wordCount(txt) + " 字），寫得好！"); setTab(k === 1 ? "oth" : "gr");
      } })));
      card.appendChild(h("details", { class: "es-tips" }, h("summary", { text: "作文怎麼寫" }), h("ol", null, WR_TIPS.map(function (t) { return h("li", { text: t }); }))));
    }

    function wrOthersTab() {
      card.appendChild(h("div", { class: "small", style: "margin-bottom:8px", text: "多貼幾篇，看別人怎麼破題、舉什麼例子。按「＋」新增一篇。" }));
      e.others.forEach(function (o, i) {
        var src = h("input", { class: "wr-in", type: "text", placeholder: "來源或作者（可不填）", oninput: function () { o.src = src.value; later(); } }); src.value = o.src || "";
        var txt = h("textarea", { class: "es-ta", rows: "8", placeholder: "貼上別人的作文", oninput: function () { o.text = txt.value; later(); } }); txt.value = o.text || "";
        var good = h("textarea", { class: "es-ta", rows: "2", placeholder: "好在哪、想學什麼（可不填）", oninput: function () { o.good = good.value; later(); } }); good.value = o.good || "";
        card.appendChild(h("div", { class: "wr-oth" },
          h("div", { class: "wr-oth-h" }, h("b", { text: "第 " + (i + 1) + " 篇" }), h("button", { class: "link", text: "刪除", onclick: function () { if (!(o.text || "").trim() || confirm("刪除第 " + (i + 1) + " 篇？")) { e.others.splice(i, 1); persist(); viewEssay(id); } } })),
          src, txt, good));
      });
      card.appendChild(h("div", { class: "btns" },
        h("button", { class: "btn soft wr-add", text: "＋ 新增一篇", onclick: function () { e.others.push({ id: "o" + Date.now(), src: "", text: "", good: "", ts: Date.now() }); persist(); viewEssay(id); var a = document.querySelectorAll(".wr-oth textarea"); if (a.length > 1) a[a.length - 2].focus(); } }),
        n ? h("button", { class: "btn", text: "下一步：Claude 批改", onclick: function () { setTab("gr"); } }) : null));
    }

    function wrGradeTab() {
      if (!n) { card.appendChild(h("div", { class: "small", text: "先寫第一次，Claude 才有東西可以改。" })); card.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "去寫第一次", onclick: function () { setTab("w1"); } }))); return; }
      e.tries.forEach(function (t, i) {
        var box = h("div", { class: "wr-try" }, h("div", { class: "h2", text: nthZh(i + 1) + "（" + md(ymd(new Date(t.ts))) + "・" + t.words + " 字）" }));
        box.appendChild(h("details", { class: "es-tips" }, h("summary", { text: "我寫的內容" }), h("pre", { class: "es-sample", text: t.text })));
        if (grHas(id, t)) {
          var data = grData();
          if (data && data.g[id + ":" + t.ts]) {
            box.appendChild(grBody(data.g[id + ":" + t.ts].text));
            if (!t.seen) { t.seen = Date.now(); persist(); }
          } else box.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "🔒 看 Claude 的批改", onclick: function () { grAsk(function () { viewEssay(id); }); } })));
        } else if (t.rep && t.rep.sent) {
          box.appendChild(h("div", { class: "small", style: "margin-top:8px", text: "已送出，等 Claude 批改。批改好之後重開刷題本就會出現。" }));
          box.appendChild(h("div", { class: "btns" }, h("button", { class: "btn soft", text: "重新複製", onclick: function () { copyText(wrText(x, e, t)); } })));
        } else {
          var ask = h("textarea", { class: "es-ta", rows: "2", placeholder: "想問 Claude 的（可不填）", oninput: function () { t.ask = ask.value; later(); } }); ask.value = t.ask || "";
          box.appendChild(ask);
          if (e.others.some(function (o) { return (o.text || "").trim(); })) { var cb = h("input", { type: "checkbox", onchange: function (ev) { t.withO = ev.target.checked; persist(); } }); cb.checked = !!t.withO; box.appendChild(h("label", { class: "rep-ck" }, cb, h("span", { text: "附上別人的作文（比較耗用量）" }))); }
          box.appendChild(h("div", { class: "btns" },
            h("button", { class: "btn", text: "📤 複製給 Claude 批改", onclick: function () { copyText(wrText(x, e, t)); t.rep = { ts: Date.now(), sent: true }; persist(); viewEssay(id); } }),
            t.rep ? h("button", { class: "btn soft", text: "移出回報清單", onclick: function () { delete t.rep; persist(); viewEssay(id); } })
              : h("button", { class: "btn soft", text: "先放回報清單", onclick: function () { t.rep = { ts: Date.now(), sent: false }; persist(); toast("已放進回報清單"); viewEssay(id); } })));
        }
        card.appendChild(box);
      });
      card.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "再寫一次：" + nthZh(n + 1), onclick: function () { setTab("w" + (n + 1)); } })));
      card.appendChild(h("details", { class: "es-tips" }, h("summary", { text: "審題重點（Claude 自行整理，僅供參考）" }), h("ul", null, x.pts.map(function (p) { return h("li", { text: p.h + "：" + (p.k || []).join("、") }); }))));
      var fx = h("textarea", { class: "es-ta", rows: "4", placeholder: "哪裡漏了、別人怎麼寫、下次怎麼改。", oninput: function () { e.fix = fx.value; later(); } }); fx.value = e.fix || "";
      card.appendChild(h("details", { class: "es-tips", open: e.fix ? true : null }, h("summary", { text: "我的心得" }), fx));
      card.appendChild(h("div", { class: "btns" },
        h("button", { class: "btn green", text: "掌握了", onclick: function () { rate(id, "ok"); } }),
        h("button", { class: "btn red", text: "需加強", onclick: function () { rate(id, "weak"); } })));
      if (e.rate) card.appendChild(h("div", { class: "small", style: "margin-top:8px", text: "目前標記：" + (e.rate === "ok" ? "掌握" : "需加強") }));
    }
  }
  function rate(id, r) { var cur = S.essay[id] || { pts: [] }; cur.rate = r; cur.ts = Date.now(); S.essay[id] = cur; save(); toast(r === "ok" ? "標記為掌握" : "標記為需加強"); viewEssay(id); }

  // ---------- 課文閱讀（畫重點、備註） ----------
  // 課文格式：sec.text 是段落陣列；「## 」開頭是小標，「!! 」開頭是易錯提醒框，**字** 是粗體。
  // 沒有 text 的舊章節，用 sec.body 的條列當段落。
  // 畫線用「段落序號＋原句」定位；課文改寫後先找同段，再找全節，都找不到就列為「找不到原句」。
  function paras(sec) { return sec.text || sec.body || []; }
  // 圖表區塊（不能畫線，但算段落序號）：
  //  表格："表｜標題\n| 欄 | 欄 |\n|---|---|\n| 格 | 格 |"（標題可省略，直接以「| 」開頭）
  //  流程："::flow 標題\n步驟｜說明\n步驟｜說明"　時間軸："::timeline 標題\n年份｜事件"　向量圖："::svg 圖名 標題\n文字說明"（圖在 data/figs.js）　連連看："::match 標題\n左｜右"　分類題："::sort 標題\n卡片｜類別｜理由"（這兩種不能畫線，也不參與畫線比對）
  function parseBlock(raw) {
    var lines = raw.split("\n"), cap = "";
    if (raw.slice(0, 2) === "表｜" || raw.slice(0, 2) === "| ") {
      if (lines[0].slice(0, 2) === "表｜") cap = lines.shift().slice(2);
      var rows = lines.filter(function (l) { return /^\|/.test(l) && !/^\|[\s:|-]+\|?$/.test(l); })
        .map(function (l) { return l.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); }); });
      return { kind: "table", cap: cap, rows: rows };
    }
    var s = /^::svg (\S+) ?(.*)$/.exec(lines[0]);
    if (s) return { kind: "svg", key: s[1], cap: s[2], alt: lines.slice(1).join(" "), items: [] };
    var v = /^::video (\S+) ?(.*)$/.exec(lines[0]);   // 影片："::video 檔名 標題\n文字說明"，檔案在 data/video/（檔名.mp4、檔名.jpg）
    if (v) return { kind: "video", key: v[1], cap: v[2], alt: lines.slice(1).join(" "), items: [] };
    var m = /^::(flow|timeline|match|sort) ?(.*)$/.exec(lines[0]);
    if (m && m[1] === "sort") return { kind: "sort", cap: m[2], items: lines.slice(1).filter(Boolean).map(function (l) { return l.split("｜"); }) };
    if (m) return { kind: m[1], cap: m[2], items: lines.slice(1).filter(Boolean).map(function (l) { var i = l.indexOf("｜"); return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1)]; }) };
    return null;
  }
  function inline(t) {   // **粗體** 轉成節點
    var f = document.createDocumentFragment();
    t.split("**").forEach(function (x, i) { if (x) f.appendChild(i % 2 ? h("strong", { text: x }) : document.createTextNode(x)); });
    return f;
  }
  // 連連看：左右各自洗牌，先點哪邊都可以；對了畫線鎖定，錯了閃紅計次。結果不記錄，重畫或離開這節就重來。
  function matchBoard(items) {
    var picked = null, done = 0, miss = 0;
    var score = h("span", { "aria-live": "polite" }), res = h("p", { class: "mt-res", "aria-live": "polite", hidden: true });
    var left = h("div", { class: "mt-col mt-l" }), right = h("div", { class: "mt-col mt-r" });
    var lines = document.createElementNS("http://www.w3.org/2000/svg", "svg"); lines.setAttribute("class", "mt-lines"); lines.setAttribute("aria-hidden", "true");
    var board = h("div", { class: "mt-board" }, lines, left, right);
    function order() { var a = items.map(function (x, i) { return i; }); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function draw() {
      var box = board.getBoundingClientRect(); lines.textContent = "";
      [].forEach.call(left.querySelectorAll(".done"), function (l) {
        var r = right.querySelector('[data-i="' + l.getAttribute("data-i") + '"]'), a = l.getBoundingClientRect(), c = r.getBoundingClientRect();
        var ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
        ln.setAttribute("x1", a.right - box.left); ln.setAttribute("y1", a.top + a.height / 2 - box.top);
        ln.setAttribute("x2", c.left - box.left); ln.setAttribute("y2", c.top + c.height / 2 - box.top);
        lines.appendChild(ln);
      });
    }
    function status() {
      score.textContent = "已配對 " + done + " / " + items.length + "，配錯 " + miss + " 次";
      res.hidden = done < items.length;
      res.textContent = miss ? "配完了。配錯的那幾項回課文看一次，再洗牌重做。" : "全對。隔一段時間再洗牌做一次，記得更牢。";
    }
    function pick(b) {
      if (!picked || picked.parentNode === b.parentNode) { if (picked) picked.classList.remove("sel"); picked = picked === b ? null : b; if (picked) b.classList.add("sel"); return; }
      if (picked.getAttribute("data-i") === b.getAttribute("data-i")) {
        picked.classList.remove("sel"); picked.classList.add("done"); b.classList.add("done"); picked.disabled = b.disabled = true; picked = null; done++; draw();
      } else { miss++; b.classList.add("wrong"); setTimeout(function () { b.classList.remove("wrong"); }, 600); }
      status();
    }
    function cell(i, side) { var b = h("button", { type: "button", class: "mt-item", "data-i": String(i), onclick: function () { pick(b); } }, inline(items[i][side])); return b; }
    function start() {
      picked = null; done = 0; miss = 0;
      left.replaceChildren.apply(left, order().map(function (i) { return cell(i, 0); }));
      right.replaceChildren.apply(right, order().map(function (i) { return cell(i, 1); }));
      draw(); status();
    }
    if (window.ResizeObserver) new ResizeObserver(draw).observe(board);
    start();
    return h("div", null, h("div", { class: "mt-top" }, score, h("button", { type: "button", class: "mt-again", text: "重新洗牌", onclick: start })), board, res);
  }
  // 分類題：卡片洗牌後一次出一張，點它屬於哪一類。對了收進該類，錯了標出正確類別與理由，這張排到最後再出一次。結果不記錄，重畫或離開這節就重來。
  function sortBoard(items) {
    var cats = [], queue = [], done = 0, miss = 0, cur = null;
    items.forEach(function (it) { if (cats.indexOf(it[1]) < 0) cats.push(it[1]); });
    var score = h("span", { "aria-live": "polite" }), res = h("p", { class: "mt-res", "aria-live": "polite", hidden: true });
    var card = h("div", { class: "srt-card" }), note = h("p", { class: "srt-note", "aria-live": "polite" }), next = h("button", { type: "button", class: "mt-again srt-next", text: "下一張", hidden: true, onclick: function () { deal(); } });
    var bins = cats.map(function (c) {
      var chips = h("span", { class: "srt-chips" }), b = h("button", { type: "button", class: "srt-bin", onclick: function () { pick(c, b); } }, h("span", { class: "srt-name", text: c }), chips);
      b.chips = chips; return b;
    });
    function status() {
      score.textContent = "已分類 " + done + " / " + items.length + "，答錯 " + miss + " 次";
      res.hidden = done < items.length;
      res.textContent = miss ? "分完了。答錯的那幾項回課文看一次，再洗牌重做。" : "全對。隔一段時間再洗牌做一次，記得更牢。";
    }
    function why(it) { return it[2] ? "：" + it[2] : ""; }
    function deal() {
      next.hidden = true;
      bins.forEach(function (b) { b.classList.remove("wrong", "right"); b.disabled = !queue.length; });
      cur = queue.shift() || null;
      card.hidden = !cur;
      if (cur) { card.replaceChildren(inline(cur[0])); }
    }
    function pick(c, b) {
      if (!cur) return;
      if (c === cur[1]) {
        b.chips.appendChild(h("span", { class: "srt-chip" }, inline(cur[0])));
        note.className = "srt-note ok"; note.textContent = "✓ " + cur[0].split("**").join("") + why(cur);
        done++; deal();
      } else {
        miss++; queue.push(cur);
        bins.forEach(function (x, i) { x.disabled = true; if (cats[i] === cur[1]) x.classList.add("right"); });
        b.classList.add("wrong");
        note.className = "srt-note bad"; note.textContent = "✗ " + cur[0].split("**").join("") + " 是「" + cur[1] + "」" + why(cur);
        cur = null; next.hidden = false;
      }
      status();
    }
    function start() {
      queue = items.slice(); done = 0; miss = 0; note.className = "srt-note"; note.textContent = "";
      for (var i = queue.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = queue[i]; queue[i] = queue[j]; queue[j] = t; }
      bins.forEach(function (b) { b.chips.textContent = ""; });
      deal(); status();
    }
    start();
    return h("div", null, h("div", { class: "mt-top" }, score, h("button", { type: "button", class: "mt-again", text: "重新洗牌", onclick: start })), card, note, next, h("div", { class: "srt-bins" }, bins), res);
  }
  function renderBlock(b, fill) {
    var fig = h("figure", { class: "fig fig-" + b.kind });
    if (b.cap) { if (fill && b.capCell) { var fc = h("figcaption"); fill(fc, b.capCell); fig.appendChild(fc); } else fig.appendChild(h("figcaption", { text: b.cap })); }
    var ix = 0;
    if (b.kind === "svg") {
      var pic = h("div", { class: "svgbox", role: "img", "aria-label": b.alt });
      pic.innerHTML = (KS.figs && KS.figs[b.key]) || "";
      fig.appendChild(pic);
    } else if (b.kind === "video") {
      var vsrc = "data/video/" + b.key + ".mp4";
      fig.appendChild(h("video", { class: "vid", src: vsrc, poster: "data/video/" + b.key + ".jpg", controls: true, playsinline: true, preload: "none", "aria-label": b.alt, onplay: function () { if (TT.on) ttsStop(); } }));
      fig.appendChild(h("a", { class: "vid-link", href: vsrc, target: "_blank", rel: "noopener", text: "播不了？開新頁面看" }));
    } else if (b.kind === "table") {
      var tb = h("table"), thead = h("thead"), tbody = h("tbody");
      b.rows.forEach(function (r, i) {
        var tr = h("tr");
        r.forEach(function (c, j) { var el = h(i === 0 ? "th" : j === 0 ? "th" : "td", i > 0 && j === 0 ? { scope: "row" } : null); if (fill && b.cells) fill(el, b.cells[ix]); else el.appendChild(inline(c)); ix++; tr.appendChild(el); });
        (i === 0 ? thead : tbody).appendChild(tr);
      });
      tb.appendChild(thead); tb.appendChild(tbody);
      fig.appendChild(h("div", { class: "tbl" }, tb));
    } else if (b.kind === "flow") {
      var fl = h("div", { class: "flow" });
      b.items.forEach(function (it, i) {
        if (i) fl.appendChild(h("div", { class: "arrow", "aria-hidden": "true" }));
        var st = h("div", { class: "st" }), sd = it[1] ? h("div", { class: "sd" }) : null;
        if (fill && b.cells) { fill(st, b.cells[ix++]); if (sd) fill(sd, b.cells[ix++]); } else { st.appendChild(inline(it[0])); if (sd) sd.appendChild(inline(it[1])); }
        fl.appendChild(h("div", { class: "step" }, st, sd));
      });
      fig.appendChild(fl);
    } else if (b.kind === "match") {
      fig.appendChild(matchBoard(b.items));
    } else if (b.kind === "sort") {
      fig.appendChild(sortBoard(b.items));
    } else {
      var ol = h("ol", { class: "tl" });
      b.items.forEach(function (it) {
        var y = h("span", { class: "y" }), ev = h("span", { class: "ev" });
        if (fill && b.cells) { fill(y, b.cells[ix++]); fill(ev, b.cells[ix++]); } else { y.textContent = it[0]; ev.appendChild(inline(it[1])); }
        ol.appendChild(h("li", null, y, ev));
      });
      fig.appendChild(ol);
    }
    return fig;
  }
  function boldOf(raw) { var plain = "", bold = []; raw.split("**").forEach(function (t, i) { if (i % 2) bold.push([plain.length, plain.length + t.length]); plain += t; }); return { plain: plain, bold: bold }; }
  // 表格可畫線：plain＝各格文字以換行串接，cells[格]＝[起點, 長度]；格子元素帶 data-p（段落序號）與 data-po（格子起點）。標題串在最後，舊畫線的位置不會變
  function parsePara(raw) {
    var blk = parseBlock(raw);
    if (blk) {
      blk.plain = ""; blk.bold = [];
      if (blk.kind === "match" || blk.kind === "sort") return blk;
      if (blk.kind === "table") { blk.cells = []; blk.rows.forEach(function (r) { r.forEach(function (c) { var o = boldOf(c), st = blk.plain.length; o.bold.forEach(function (x) { blk.bold.push([x[0] + st, x[1] + st]); }); blk.cells.push([st, o.plain.length]); blk.plain += o.plain + "\n"; }); }); }
      else {   // 流程、時間軸：每個步驟／年份與說明各算一格，也能畫線
        blk.cells = [];
        blk.items.forEach(function (it) { it.forEach(function (c, j) { if (j === 1 && !c) return; var o = boldOf(c), st = blk.plain.length; o.bold.forEach(function (x) { blk.bold.push([x[0] + st, x[1] + st]); }); blk.cells.push([st, o.plain.length]); blk.plain += o.plain + "\n"; }); });
      }
      if (blk.cap) { blk.capCell = [blk.plain.length, blk.cap.length]; blk.plain += blk.cap + "\n"; }
      return blk;
    }
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
  // ---------- 朗讀（瀏覽器內建語音，免費；Edge 的「Natural」中文語音最自然） ----------
  // 一段一段讀、讀到的段落會標出來；按暫停／上一段／下一段／調速度。設定（速度、聲音）只存本機。
  // 線上語音剛開始就被取消時，緊接著送出的新句可能永遠不開始（沒有 start、end，也沒有 error）。
  // 所以取消後隔 TTS_GAP 才送新句；另有看門狗：太久沒開始或沒讀完就取消重試，還是不行就跳下一句。
  var TT = { on: false, i: 0, art: null, utt: null, gen: 0, wd: 0, dl: 0, cx: 0, paused: false, pp: null, rearm: null };
  var TTS_GAP = 300, TTS_WAIT = 5000;
  function ttsPaused(p) {
    TT.paused = p;
    if (TT.pp) { TT.pp.textContent = p ? "▶" : "❚❚"; TT.pp.setAttribute("aria-label", p ? "繼續" : "暫停"); }
  }
  function ttsCancel() {
    clearTimeout(TT.wd); clearTimeout(TT.dl); TT.rearm = null;
    speechSynthesis.resume(); if (TT.paused) ttsPaused(false);   // 暫停中取消，佇列會一直停著，新句讀不出來
    if (speechSynthesis.speaking || speechSynthesis.pending) TT.cx = Date.now();
    speechSynthesis.cancel();
  }
  function ttsVoices() {
    var v = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    var zh = v.filter(function (x) { return /^zh/i.test(x.lang) || /Chinese|中文|國語|臺灣|台灣/.test(x.name); });
    function sc(x) { return (/Natural|Online/.test(x.name) ? 4 : 0) + (/TW|臺灣|台灣|Taiwan/i.test(x.name + x.lang) ? 2 : 0) + (/Google/.test(x.name) ? 1 : 0); }
    return zh.sort(function (a, b) { return sc(b) - sc(a); });
  }
  function ttsBlocks(art) {
    return [].map.call(art.children, function (el) {
      var t = el.tagName === "FIGURE" ? (/fig-table/.test(el.className) ? ((el.querySelector("figcaption") || {}).textContent ? "表格：" + el.querySelector("figcaption").textContent : "") : el.textContent) : el.textContent;
      if (/fig-svg/.test(el.className)) t = el.querySelector(".svgbox").getAttribute("aria-label");
      if (/fig-match|fig-sort|fig-video/.test(el.className)) t = "";   // 連連看、分類題是洗牌過的選項，影片自己有聲音，都不朗讀
      return { el: el, t: (t || "").replace(/\s+/g, " ").trim() };
    });
  }
  function ttsChunks(t) {
    // ks-v72：一句一讀，才能逐句標亮；太短的句子併到下一句，避免一直停頓
    var out = [], cur = "";
    t.split(/(?<=[。！？；])/).forEach(function (x) { cur += x; if (cur.length >= 12) { out.push(cur); cur = ""; } });
    if (cur) out.push(cur);
    return out;
  }
  // 逐句標亮：用 CSS Custom Highlight，不動課文 DOM，畫線不受影響；瀏覽器不支援或對不上文字時只留整段標示
  function ttsHi(el, text) {
    if (!window.Highlight || !window.CSS || !CSS.highlights) return;
    CSS.highlights.delete("tts-s");
    if (!el || !text || el.tagName === "FIGURE") return;
    var s = el.textContent, q = text.trim(), at = s.indexOf(q, TT.hiAt || 0); if (at < 0) at = s.indexOf(q); if (at < 0) return;
    TT.hiAt = at + q.length;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), pos = 0, n, r = document.createRange(), st = false;
    while ((n = w.nextNode())) {
      var e = pos + n.length;
      if (!st && at < e) { r.setStart(n, at - pos); st = true; }
      if (st && TT.hiAt <= e) { r.setEnd(n, TT.hiAt - pos); CSS.highlights.set("tts-s", new Highlight(r)); return; }
      pos = e;
    }
  }
  function ttsStop() {
    TT.on = false; TT.gen++; if (window.speechSynthesis) ttsCancel();
    ttsHi(null); document.body.classList.remove("tts-live");
    [].forEach.call(document.querySelectorAll(".tts-on"), function (e) { e.classList.remove("tts-on"); });
    var b = document.getElementById("ttsbar"); if (b) b.remove();
    ttsPlace();
  }
  // 朗讀列的位置：電腦放左欄目錄下方；手機在底部，可縮成右側按鈕列的喇叭（S.read.ttsc，只存本機）
  function ttsPlace() {
    var bar = document.getElementById("ttsbar"), side = window.matchMedia("(min-width: 900px)").matches ? document.querySelector(".rd-side") : null, mini = false;
    if (bar) {
      var host = side || document.body; if (bar.parentNode !== host) host.appendChild(bar);
      mini = !side && !!S.read.ttsc; bar.hidden = mini;
    }
    document.body.classList.toggle("tts-pad", !!bar && !side && !mini);
    if (window.KSRailTts) window.KSRailTts(mini);
    qPlace();
  }
  function ttsSpeak(i, auto) {   // auto：上一段自然讀完接著讀，不必取消
    var art = TT.art; if (!art || !document.body.contains(art)) return ttsStop();
    var bl = ttsBlocks(art); TT.gen++; var g = TT.gen;
    while (i < bl.length && !bl[i].t) i++;
    if (i >= bl.length) { ttsStop(); toast("讀完了"); return; }
    TT.i = i; if (!auto) ttsCancel();
    [].forEach.call(art.querySelectorAll(".tts-on"), function (e) { e.classList.remove("tts-on"); });
    bl[i].el.classList.add("tts-on"); TT.hiAt = 0; ttsHi(null);
    var sl = window.getSelection(); if (!sl || sl.isCollapsed) bl[i].el.scrollIntoView({ block: "center", behavior: "smooth" });   // 正在選字時不要把畫面捲走
    var ch = ttsChunks(bl[i].t), k = 0, vs = ttsVoices(), want = S.read.ttsv, voice = vs.filter(function (v) { return v.name === want; })[0] || vs[0];
    function next() {
      if (g !== TT.gen) return;
      if (k >= ch.length) return ttsSpeak(i + 1, true);
      ttsHi(bl[i].el, ch[k]);
      say(ch[k++], 0);
    }
    function say(text, tries) {
      var w = TT.cx + TTS_GAP - Date.now();
      if (w > 0) { TT.dl = setTimeout(function () { if (g === TT.gen) say(text, tries); }, w); return; }
      var u = new SpeechSynthesisUtterance(text), started = false; u.lang = (voice && voice.lang) || "zh-TW"; if (voice) u.voice = voice; u.rate = S.read.ttsr || 1;
      function live() { return g === TT.gen && TT.utt === u; }
      function stall() {
        if (!live()) return;
        ttsCancel(); TT.utt = null;
        if (tries < 2) return say(text, tries + 1);
        toast("語音沒有回應，跳到下一句"); next();
      }
      function arm() {   // 讀完的時限抓寬：實測約每字 0.25 秒
        clearTimeout(TT.wd); TT.rearm = arm;
        if (!TT.paused) TT.wd = setTimeout(stall, started ? (text.length * 0.35 / u.rate + 6) * 1000 : TTS_WAIT);
      }
      u.onstart = function () { if (live()) { started = true; arm(); } };
      u.onend = function () { if (live()) { clearTimeout(TT.wd); next(); } };
      u.onerror = function (e) { if (live() && e.error !== "interrupted" && e.error !== "canceled") { clearTimeout(TT.wd); next(); } };
      TT.utt = u; speechSynthesis.speak(u); arm();
    }
    next();
  }
  function ttsBar() {
    var old = document.getElementById("ttsbar"); if (old) old.remove();
    var rates = [0.8, 1, 1.25, 1.5, 1.8], vs = ttsVoices();
    var pp = h("button", { class: "tb", text: "❚❚", "aria-label": "暫停", onclick: function () { if (TT.paused) { speechSynthesis.resume(); ttsPaused(false); if (TT.rearm) TT.rearm(); } else { speechSynthesis.pause(); ttsPaused(true); clearTimeout(TT.wd); } } });
    TT.pp = pp; TT.paused = false;
    var rt = h("button", { class: "tb", text: (S.read.ttsr || 1) + "×", "aria-label": "速度", onclick: function () { var i = (rates.indexOf(S.read.ttsr || 1) + 1) % rates.length; S.read.ttsr = rates[i]; save(); rt.textContent = rates[i] + "×"; ttsSpeak(TT.i); } });
    var vsel = vs.length > 1 ? h("select", { class: "tb tb-v", "aria-label": "聲音", onchange: function () { S.read.ttsv = vsel.value; save(); ttsSpeak(TT.i); } }, vs.map(function (v) { return h("option", { value: v.name, text: v.name.replace(/Microsoft |Google /, "").slice(0, 22), selected: v.name === S.read.ttsv ? "" : null }); })) : null;
    var bar = h("div", { id: "ttsbar", class: "ttsbar" }, h("button", { class: "tb", text: "⏮", "aria-label": "上一段", onclick: function () { ttsSpeak(Math.max(0, TT.i - 1)); } }), pp,
      h("button", { class: "tb", text: "⏭", "aria-label": "下一段", onclick: function () { ttsSpeak(TT.i + 1); } }), rt, vsel, h("button", { class: "tb tb-min", text: "⌄", "aria-label": "縮到側邊", onclick: function () { S.read.ttsc = 1; save(); ttsPlace(); } }), h("button", { class: "tb", text: "✕", "aria-label": "停止朗讀", onclick: ttsStop }));
    document.body.appendChild(bar); ttsPlace();
  }
  function ttsStart(art, from) {
    if (!window.speechSynthesis) { toast("這個瀏覽器不支援朗讀"); return; }
    ttsStop(); TT.on = true; TT.art = art; document.body.classList.add("tts-live"); ttsBar(); ttsSpeak(from || 0);
  }
  window.addEventListener("hashchange", function () { if (TT.on) ttsStop(); if (qsel && qsel.rd) qHide(); });
  window.addEventListener("resize", function () { if (TT.on) ttsPlace(); });
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () { };

  var selPending = null, selTimer = null;
  // 讀課文的停留時間：離開或重畫時存回 S.pos
  var RD = { flush: null, vis: null };
  window.addEventListener("hashchange", function () { if (RD.flush) { RD.flush(); RD.flush = RD.vis = null; } });
  document.addEventListener("visibilitychange", function () { if (RD.vis) RD.vis(); });
  function viewRead(sid, cid, xid) {
    if (RD.flush) { RD.flush(); RD.flush = RD.vis = null; }
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
        var n = pp.plain.length, b = new Array(n), m = new Array(n), rg = new Array(n);
        pp.bold.forEach(function (r) { for (var k = r[0]; k < r[1]; k++) b[k] = 1; });
        // 黃色畫線（m）與紅色圈起來（rg）各占一層，可以疊在同一段字上
        list.forEach(function (mk) { var at = pos[mk.id], L = mk.k === "ring" ? rg : m; if (at && at[0] === i) for (var k = at[1]; k < at[1] + mk.q.length && k < n; k++) L[k] = mk; });
        function fill(el, a, z) {
          el.setAttribute("data-p", String(i)); if (a) el.setAttribute("data-po", String(a));
          var k = a, ringMk = null, ringEl = null;
          while (k < z) {
            var j = k; while (j < z && b[j] === b[k] && m[j] === m[k] && rg[j] === rg[k]) j++;
            var node = document.createTextNode(pp.plain.slice(k, j));
            if (b[k]) node = h("strong", null, node);
            if (m[k]) {
              var mk = m[k], end = pos[mk.id][1] + mk.q.length <= j;
              node = h("mark", { class: "hl" + (mk.note ? " has-note" : "") + (end ? " end" : ""), "data-m": mk.id, onclick: (function (x) { return function () { openMark(x); }; })(mk) }, node);
            }
            if (rg[k] !== ringMk) {
              ringMk = rg[k] || null; ringEl = null;
              if (ringMk) {
                ringEl = h("span", { class: "ring" + (ringMk.note ? " has-note" : ""), "data-m": ringMk.id });
                ringEl.onclick = (function (x, e2) { return function (ev) { if (ev.target === e2) openMark(x); }; })(ringMk, ringEl);
                el.appendChild(ringEl);
              }
            }
            (ringEl || el).appendChild(node); k = j;
          }
        }
        if (pp.rows || pp.items) return art.appendChild(renderBlock(pp, function (el, cell) { fill(el, cell[0], cell[0] + cell[1]); }));
        var el = h(pp.kind === "h" ? "h3" : "p", { class: pp.kind === "tip" ? "tip" : null, id: pp.kind === "h" ? "h" + i : null });
        fill(el, 0, n);
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
          h("div", { class: "q", text: (mk.k === "ring" ? "◯ " : "") + "「" + clip(mk.q, 60) + "」" }),
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
          if (cb.checked && !(mk.rep && !mk.sent)) { mk.rep = true; mk.sent = false; mk.ts = mk.mt = Date.now(); }
          if (!cb.checked && mk.rep && !mk.sent) { mk.rep = false; mk.mt = Date.now(); }
        }
        save(); sheet.remove(); paint();
      }
      sheet = h("div", { class: "sheet-bg", onclick: function (ev) { if (ev.target === sheet) close(true); } },
        h("div", { class: "sheet" },
          h("div", { class: "sq", text: "「" + mk.q + "」" }), ta,
          h("div", { class: "ask-row" }, h("label", { class: "rep-ck" }, cb, h("span", { text: "回報給 Claude，補進課文" })), askBtn("link strong", function () { insName(ta); cb.checked = true; })),
          h("div", { class: "btns" },
            h("button", { class: "btn soft red-t", text: "刪除畫線", onclick: function () {
              S.marks[MK] = (S.marks[MK] || []).filter(function (x) { return x !== mk; }); S.del[mk.id] = Date.now(); close(false);
            } }),
            h("button", { class: "btn", text: "完成", onclick: function () { close(true); } }))));
      document.body.appendChild(sheet);
      if (!mk.note) ta.focus();
    }
    function addMark(withNote, kind) {
      var sp = selPending; hideBar(); if (!sp) return;
      var mk = { id: Date.now().toString(36), p: sp.p, o: sp.s, q: sp.q, note: "", ts: Date.now() };
      if (kind) mk.k = kind;
      (S.marks[MK] = S.marks[MK] || []).push(mk); save();
      var w = window.getSelection(); if (w) w.removeAllRanges();
      paint();
      if (withNote) openMark(mk);
    }
    function hideBar() { selPending = null; if (qsel && qsel.rd) qHide(); }
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
      selPending = { p: +pa.getAttribute("data-p"), s: st + (+pa.getAttribute("data-po") || 0), q: txt };
      clearTimeout(qtimer); qsel = { rd: true, q: txt };
      qBar([["畫重點", function () { addMark(false); }], ["圈起來", function () { addMark(false, "ring"); }], ["畫重點＋備註", function () { addMark(true); }, 1]], function () { var w2 = window.getSelection(); return w2 && w2.rangeCount && !w2.isCollapsed ? w2.getRangeAt(0).getBoundingClientRect() : null; });
    }
    document.addEventListener("selectionchange", onSel);
    function fsChip(label, v) { return h("button", { class: "chip", "aria-pressed": String(fs === v), text: label, onclick: function () { R.fs = v; save(); viewRead(sid, cid, xid); } }); }
    var head = h("div", { class: "rd-head" },
      h("div", { class: "eyebrow", text: s.name + "・第 " + (ci + 1) + " 章 " + c.title }),
      h("h1", { class: "rd-title", text: sec.title }),
      h("div", { class: "rd-meta" }, h("span", { class: "small", text: sec.src ? "整理自：" + sec.src : "" }),
        h("span", { class: "chips sm" }, h("button", { class: "chip", text: "🔊 朗讀", onclick: function () { ttsStart(art, 0); } }),
          h("button", { class: "chip", "aria-pressed": String(!!R.fm), text: "專注", onclick: function (ev) { R.fm = R.fm ? 0 : 1; save(); document.body.classList.toggle("rd-fm", !!R.fm); ev.currentTarget.setAttribute("aria-pressed", String(!!R.fm)); } }), fsChip("小", 16), fsChip("中", 18), fsChip("大", 20))),
      h("div", { class: "small", text: "長按選字，就能畫重點或寫備註。點畫過的字可修改。🔊 朗讀：連點兩下某段可從那段開始讀。" }));
    paint();
    art.addEventListener("dblclick", function (ev) { if (ev.target.closest && ev.target.closest(".fig-match, .fig-sort, .fig-video")) return; var w = window.getSelection(); if (w) w.removeAllRanges(); var c = ev.target.closest ? ev.target.closest(".art > *") : null; if (!c) return; var i = [].indexOf.call(art.children, c); if (i >= 0) ttsStart(art, i); });
    // 分階段的科目：主按鈕是本節該階段的題，全部題目放在旁邊
    var stg = hasStage(sid) ? stageNow() : 0, tk = "t:" + sid + ":" + cid + ":" + stg + ":" + xid, ts = stg ? getSet(tk) : null, tn = ts ? ts.items.length : 0;
    var tail = h("div", { class: "card" }, h("div", { class: "h2", text: "讀完這節，寫考古題" }),
      h("div", { class: "muted", text: stg ? (tn ? (stg === 1 ? "本節重點題 " : "本節題目 ") + tn + " 題（已做 " + counts(ts.items).done + "）。" : stg === 1 ? "本節地特前沒排題，接著讀下一節。" : "本節沒有排題，接著讀下一節。") : set.items.length ? "本節有 " + set.items.length + " 題選擇題。" : "本節還沒有對應的選擇題。" }));
    if (tn) tail.appendChild(h("div", { class: "btns" }, pracBtns(tk, tn, true)));
    if (stg && set.items.length) tail.appendChild(h("div", { class: "btns" }, h("a", { class: "btn soft", href: "#/p/" + key + "/" + (resumeN(key, set.items.length) || 1), text: "本節全部 " + set.items.length + " 題" }),
      h("a", { class: "btn soft", href: "#/print/" + key, text: "列印本節" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" })));
    if (!stg && set.items.length) tail.appendChild(h("div", { class: "btns" }, pracBtns(key, set.items.length, true).concat([
      h("a", { class: "btn soft", href: "#/print/" + key, text: "列印本節" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" })])));
    if (es.length) { var el2 = h("div", { class: "sec-links" }); es.forEach(function (x) { el2.appendChild(h("a", { class: "pill", href: "#/es/" + x.id, text: (isWriting(x) ? "作文 " : "申論 ") + x.src })); }); tail.appendChild(el2); }
    var gmSec = gmCases(sid, xid);
    if (gmSec.length) tail.appendChild(h("div", { class: "btns" }, h("a", { class: "btn soft", href: "#/gmp/" + sid + "/" + xid + "/w", text: "本節釋字法庭 " + gmSec.length + " 案（已熟 " + gmDone(gmSec) + "）" })));
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
    var leftBox = h("div", { class: "rd-left" });
    document.body.classList.toggle("rd-fm", !!R.fm);
    show(topbar("#/c/" + sid + "/" + cid, "第 " + (ci + 1) + " 章"), now, h("div", { class: "rd-wrap" }, h("aside", { class: "rd-side" }, toc, leftBox), h("div", { class: "rd-main" }, head, art, mine, tail, nav)));
    if (TT.on && TT.art && !TT.art.isConnected) { TT.art = art; ttsBar(); ttsSpeak(TT.i); }   // 同一節重畫（換字級、同步）後接著讀

    // ---------- 讀到哪：捲動時記下段落、目錄藍標跟著小標走 ----------
    var RK = "rd:" + sid + ":" + xid, saved = S.pos[RK], curH = null, tmr = null, lastP = -1;
    // 捲到節末且累計停留達預估時間的 3 成才自動算已讀，翻看後面章節不會被算進去。dw＝這節累計停留毫秒
    var needMs = paras(sec).join("").length / 200 * 0.3 * 60000, dw0 = (saved && saved.dw) || 0, dwAt = document.hidden ? 0 : Date.now(), endTmr = null;
    function dwell() { return dw0 + (dwAt ? Date.now() - dwAt : 0); }
    RD.flush = function () {
      clearTimeout(endTmr);
      var o = S.pos[RK]; if (!o && dwell() < 5000) return;
      setPos(RK, Object.assign({}, o, { dw: Math.round(dwell()) }));
    };
    RD.vis = function () { if (document.hidden) { dw0 = dwell(); dwAt = 0; var o = S.pos[RK]; if (o || dw0 >= 5000) setPos(RK, Object.assign({}, o, { dw: Math.round(dw0) })); } else dwAt = Date.now(); };
    var finRow = h("div", { class: "fin-row" });
    function renderFin() {
      var r = S.pos[RK] || {};
      finRow.replaceChildren(
        h("span", { class: "small" + (r.fin ? " fin-yes" : ""), text: r.fin ? "✓ 本節已讀完" : r.nofin ? "已取消已讀，不會再自動算" : "停留夠久會自動算已讀" }),
        h("button", { class: r.fin ? "link" : "link strong", text: r.fin ? "取消已讀" : "標記為已讀", onclick: function () { var on = !(S.pos[RK] || {}).fin; setFin(sid, cid, xid, on); toast(on ? "已標記為已讀" : "已取消，這節不會再自動算已讀"); renderFin(); } }));
    }
    renderFin(); tail.insertBefore(finRow, tail.firstChild);
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
      var o = S.pos[RK] || {}, fin = o.fin || (done && !o.nofin && dwell() >= needMs);
      clearTimeout(endTmr);
      if (done && !fin && !o.nofin) endTmr = setTimeout(remember, Math.max(1000, needMs - dwell() + 300));   // 停在節末繼續讀也要算得到
      var pc = done ? (fin ? 100 : 99) : Math.round(p / Math.max(1, n - 1) * 100);
      if (p === lastP && !done) return; lastP = p;
      if (o.p === p && !!o.done === done && !!o.fin === !!fin) return;
      // done＝現在停在節末（下次從頭讀）；fin＝曾經讀完（章節頁顯示「已讀完」）
      setPos(RK, { p: p, pc: pc, done: done || undefined, fin: fin || undefined, nofin: o.nofin, dw: Math.round(dwell()) });
      if (fin && !o.fin) { renderFin(); toast("本節算已讀完"); }
    }
    function onScroll() { spy(); clearTimeout(tmr); tmr = setTimeout(remember, 600); }
    window.addEventListener("scroll", onScroll, { passive: true });
    // 小期限：這節還剩幾分鐘（剩餘字數÷200×實際讀速）、今天的章還差幾節（電腦版左欄）
    function paintLeft() {
      var ps = paras(sec), cur = TT.on && TT.art === art ? TT.i : topPara(), rest = 0, i;
      for (i = cur; i < ps.length; i++) rest += ps[i].length;
      var rows = [(S.pos[RK] || {}).fin && rest < 20 ? "這節已讀完" : "這節還剩 " + Math.max(1, Math.round(rest / 200 * paceOf(sid).v)) + " 分鐘"];
      var pl = S.plan[ymd(new Date())], keys = pl && pl._ch ? pl._ch.split(",") : [], miss = 0;
      keys.forEach(function (ky) { var a = ky.split(":"), c2 = chapter(a[0], a[1]); if (c2) c2.sections.forEach(function (x) { var r = S.pos["rd:" + a[0] + ":" + x.id]; if (!(r && r.fin)) miss++; }); });
      if (keys.length) rows.push(miss ? "今天的章還差 " + miss + " 節" : "今天的章都讀完了");
      var txt = rows.join("\n"); if (leftBox._t !== txt) { leftBox._t = txt; leftBox.textContent = txt; }
    }
    paintLeft();
    PT.ctx = { sid: sid, cid: cid, xid: xid, sec: sec, art: art, top: topPara, paint: paintLeft };
    setLast("#/rd/" + sid + "/" + cid + "/" + xid, (ci + 1) + "-" + (si + 1) + " " + sec.title, s.name + "・課文");
    // 回到上次讀的段落（讀完的節從頭開始）
    if (keepY == null && saved && !saved.done && saved.p > 0 && art.children[saved.p]) {
      requestAnimationFrame(function () {
        var el = art.children[saved.p]; if (!el) return;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
        lastP = saved.p; spy();
        toast("接續上次讀到的地方");
      });
    } else requestAnimationFrame(spy);
    setTimeout(function () { if (art.isConnected && tail.getBoundingClientRect().top < window.innerHeight) remember(); }, 1000);   // 短到不用捲動的節
  }

  // ---------- 回報給 Claude ----------
  function secLabel(sid, cid, xid) {
    var c = chapter(sid, cid), sc = c && xid ? section(sid, cid, xid) : null;
    return subj(sid).name + "｜" + (c ? "第 " + (chapters(sid).indexOf(c) + 1) + " 章 " + c.title : "尚未分章") + (sc ? "｜" + sc.title + "（" + sc.id + "）" : "");
  }
  function pendingReports() {
    var out = [];
    Object.keys(S.repq).forEach(function (k) {
      var r = S.repq[k]; if (r.sent || r.off) return;
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
    var list = pendingReports(), txt = reportText(list), vc = vwCard(), wc = wrCard();
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: "回報給 Claude" }),
      h("div", { class: "title", text: list.length ? list.length + " 則訂正待回報" : "目前沒有要回報的訂正" }),
      h("div", { class: "muted", text: "在題目的訂正或課文備註勾「回報給 Claude」，就會集中到這裡。複製後貼到和 Claude 的對話，Claude 會把內容補進課文。" }));
    if (!list.length) return show(topbar("#/", "首頁"), vc || wc ? null : card, wc, vc);
    var big = list.length > REP_MAX_N || txt.length > REP_MAX_C;
    card.appendChild(h("div", { class: "rep-size" + (big ? " warn" : "") },
      h("b", { text: "共 " + list.length + " 則、約 " + txt.length.toLocaleString() + " 字" }),
      h("div", { class: "small", text: big ? "一次送太多，建議用下面的「複製這章」分批送：每批 10–15 則或 6,000 字以內，最好同一章。" : "份量剛好，可以一次送出。建議每批 10–15 則或 6,000 字以內。" })));
    function markSent(sub) {
      sub.forEach(function (x) { if (x.type === "q") { x.r.sent = true; x.r.ts = Date.now(); } else { x.m.sent = true; x.m.mt = Date.now(); } });
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
            if (x.type === "q") S.repq[x.k] = { off: 1, ts: Date.now() }; else { x.m.rep = false; x.m.mt = Date.now(); }
            save(); viewReport();
          } })));
      });
    });
    show(topbar("#/", "首頁"), card, wc, vc, h("div", { class: "card" }, rows),
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

  // ---------- 排程表與【進度回報】 ----------
  function schedReport(today, L) {
    var lines = ["【進度回報】" + today, "請依實際進度重排 data/schedule.js（模擬考日期不動，目標 11/22 前讀完）。", ""], subs = {};
    L.forEach(function (c) { (subs[c.sid] = subs[c.sid] || []).push(c); });
    Object.keys(subs).forEach(function (sid) {
      var cs = subs[sid];
      lines.push("■ " + subj(sid).name + "：完成 " + cs.filter(function (c) { return c.st === "done"; }).length + "/" + cs.length + " 章");
      cs.forEach(function (c) { if (c.st !== "todo" || c.n) lines.push("  " + c.key + " 第" + c.no + "章 原訂 " + md(c.od) + "、現排 " + (c.d ? md(c.d) : "考前排不下") + "｜" + { done: "完成", now: "今天", todo: "未到" }[c.st] + (c.shift ? "（落後）" : "") + "｜" + c.n + "/" + c.tot + " 節｜實際 讀 " + chMin(c.key) + " 分＋題 " + qMinAll(c.key) + " 分（估全章 " + c.full + "＝讀 " + c.rf + "＋題 " + c.qm + "，剩 " + (c.done ? c.qm : c.min) + (c.qn ? "，題目還有 " + c.qn + " 題" : "") + "）"); });
    });
    var w = []; for (var i = 6; i >= 0; i--) { var x = new Date(); x.setDate(x.getDate() - i); var ds = ymd(x); w.push(md(ds) + " " + dayMin(ds) + "分" + ((S.plan[ds] || {})._ok ? "✓" : "")); }
    lines.push("", "最近 7 天：" + w.join("、"));
    return lines.join("\n");
  }
  function viewSchedule() {
    var today = ymd(new Date()), L = schedList(today), WD = "日一二三四五六", subs = {}, byDay = {};
    var late = L.filter(function (c) { return c.shift; }), lastD = L.filter(function (c) { return !c.done && c.d; }).map(function (c) { return c.d; }).sort().pop();
    var fin = !L.filter(function (c) { return !c.done; }).length ? "所有章都讀完了。" : L.left ? "照這個分量，考前還有 " + L.left + " 章排不下，要再多讀才趕得上。" : lastD <= SC_END ? "照這個分量，全部章節 " + md(lastD) + " 讀完，趕得上 11/23 模擬考。" : "照這個分量，全部章節 " + md(lastD) + " 讀完；11/23 起的章是模擬考之外的補讀。";
    L.forEach(function (c) { var o = subs[c.sid] = subs[c.sid] || { d: 0, t: 0, l: 0 }; o.t++; if (c.st === "done") o.d++; if (c.shift) o.l++; if (c.d) (byDay[c.d] = byDay[c.d] || []).push(c); });
    var sum = h("div", { class: "card" }, h("div", { class: "h2", text: late.length ? "比原訂慢 " + late.length + " 章，已自動往後排" : "沒有落後 👍" }),
      h("div", { class: "small", text: (today <= SC_END ? "目標 11/22 前讀完。平日每天排約 " + fmtM(L.B) + " 讀章＋章題目，週末 " + fmtM(Math.round(L.B * (SC.we || 1.5))) + "。" + fin
        : today <= MOCK_END ? "模擬期：考卷之外，每天排約 1 小時補讀。" + (L.left ? "還有 " + L.left + " 章排不下。" : "")
        : today <= EXAM_END ? "收尾期不讀新章，只看錯題與易錯。" : "地特考完了，剩下的章依序往後排。") + "提前讀完的章不會再出現在後面。" }),
      Object.keys(subs).map(function (sid) { var o = subs[sid]; return h("div", { class: "sc-sum", style: "--c:" + (COL[sid] || COL[""]) }, h("b", { text: subj(sid).name }), h("span", { text: "　完成 " + o.d + "/" + o.t + " 章" + (o.l ? "・落後 " + o.l : "") })); }),
      h("div", { class: "small", text: "讀完一章的每一節（捲到節末）就算完成。落後時分量會自動加重，連續落後再按下面的按鈕，貼給 Claude 重排。" }),
      h("button", { class: "btn", text: "複製【進度回報】", onclick: function () { copyText(schedReport(today, L)); } }));
    var list = h("div", { class: "card" }), p0 = (SC.from || today).split("-"), d1 = EXAM_END;
    d1 = lastD && lastD > d1 ? lastD : d1;
    for (var d = new Date(+p0[0], +p0[1] - 1, +p0[2]); ymd(d) <= d1; d.setDate(d.getDate() + 1)) {
      var ds = ymd(d), cs = byDay[ds] || [], buf = (SC.buf || []).indexOf(ds) >= 0, ev = null;
      if (ds >= "2026-11-23" && ds <= MOCK_END) {
        var mk = mockOf(ds), mkDone = S.plan[ds] && S.plan[ds].mk;
        ev = h("a", { class: "sc-ev" + (mkDone ? " done" : ""), href: "#/s/" + mk[0] + "/ex" }, (mkDone ? "✓ " : "") + mk[1] + " 模擬考＋檢討");
      } else if (ds >= "2026-12-02" && ds <= "2026-12-04") ev = h("span", { class: "sc-ev" }, "收尾：只看錯題與易錯，不做新題");
      else if (ds === "2026-12-05") ev = h("span", { class: "sc-ev exam" }, "考試：國文、政治學、法學知識與英文");
      else if (ds === EXAM_END) ev = h("span", { class: "sc-ev exam" }, "考試：行政法、行政學");
      list.appendChild(h("div", { class: "sc-day" + (ds === today ? " now" : "") },
        h("div", { class: "sc-d", text: md(ds) + " " + WD.charAt(d.getDay()) }),
        h("div", { class: "sc-cs" }, ev, buf && ds <= SC_END ? h("span", { class: "small", text: "另加錯題總複習＋國文測驗" }) : null,
          cs.map(function (c) {
            return h("a", { class: "sc-c " + c.st, href: c.href, style: "--c:" + (COL[c.sid] || COL[""]) },
              h("span", { class: "sc-ic", text: c.st === "done" ? "✓" : c.shift ? "!" : c.st === "now" ? "▶" : "·" }),
              h("span", { class: "sc-t", text: subj(c.sid).name + " " + c.no + "　" + c.c.title }),
              h("span", { class: "small", text: c.n + "/" + c.tot }));
          }))));
    }
    show(topbar("#/", "排程表"), sum, list);
  }

  // ---------- 時間統計頁 #/stats（只讀 S.tl 與 S.plan，不改同步格式） ----------
  var stRange = 7;
  var STN = { read: "讀課文", drill: "做題・複習", write: "寫作", voc: "單字", free: "自習", oth: "其他" };
  function tlKind(k) {
    if (!k) return "oth";
    if (!k.indexOf("ch:")) return "read";
    if (!k.indexOf("chq:") || /^(chn|eng|wr|rv|wk|hl)$/.test(k)) return "drill";
    if (k === "es") return "write";
    if (k === "voc") return "voc";
    if (!k.indexOf("free:")) return "free";
    return "oth";
  }
  function viewStats() {
    var now = new Date(), today = ymd(now), logs = [], byDay = {}, first = today, WD = "日一二三四五六";
    Object.keys(S.tl).forEach(function (id) {
      var x = S.tl[id]; if (x.del || !x.d || !(x.m > 0)) return;
      var o = { d: x.d, k: x.kd || tlKind(x.k), sid: x.sid || "", m: x.m, ts: x.ts || 0, hh: x.hh, xs: x.xs };
      logs.push(o); var b = byDay[x.d] = byDay[x.d] || { m: 0, k: {} };
      b.m += x.m; b.k[o.k] = (b.k[o.k] || 0) + x.m; if (x.d < first) first = x.d;
    });
    function dm(d) { return byDay[d] ? byDay[d].m : 0; }
    function addDays(d, n) { var p = d.split("-"); return ymd(new Date(+p[0], +p[1] - 1, +p[2] + n)); }
    function dowOf(d) { var p = d.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]).getDay(); }
    function monOf(d) { return addDays(d, -((dowOf(d) + 6) % 7)); }
    function nameOf(s) { return s && subj(s) ? subj(s).name : "其他"; }
    var from = stRange ? addDays(today, 1 - stRange) : first;
    var rl = logs.filter(function (x) { return x.d >= from && x.d <= today; });
    var rangeTxt = stRange === 7 ? "近 7 天" : stRange === 28 ? "近 4 週" : "全部時間";

    // 今日概況
    var yd = addDays(today, -1), td = dm(today), g = dayGoal(today), mon = monOf(today), wmin = 0, wgoal = 0, streak = 0, all = 0, ndays = 0, i, d;
    for (d = mon; d <= today; d = addDays(d, 1)) { wmin += dm(d); wgoal += dayGoal(d); }
    for (i = 0; i < 400; i++) { var pl = S.plan[addDays(today, -i)]; if (pl && pl._ok) streak++; else if (i === 0) continue; else break; }
    Object.keys(byDay).forEach(function (k) { all += byDay[k].m; ndays++; });
    function tile(v, l) { return h("div", { class: "st-tile" }, h("b", { text: v }), h("span", { text: l })); }
    var diff = td - dm(yd);
    var over = h("div", { class: "card" }, h("div", { class: "h2", text: "今日概況" }),
      h("div", { class: "st-tiles" }, tile(fmtM(td), "今天"), tile(fmtM(wmin), "本週"), tile(streak + " 天", "連續保底"), tile(fmtM(all), "累計 " + ndays + " 天")),
      h("div", { class: "small", text: "昨天 " + fmtM(dm(yd)) + (diff ? "，今天" + (diff > 0 ? "多" : "少") + " " + fmtM(Math.abs(diff)) : "，今天相同") + "。今日目標 " + fmtM(g) + (td >= g ? "，已達成。" : "，還差 " + fmtM(g - td) + "。") + "本週到今天的目標累計 " + fmtM(wgoal) + "，目前 " + fmtM(wmin) + "。" }));
    var seg = h("div", { class: "chips" }, [[7, "7 天"], [28, "4 週"], [0, "全部"]].map(function (r) {
      return h("button", { class: "chip", "aria-pressed": String(stRange === r[0]), text: r[1], onclick: function () { stRange = r[0]; var y = window.scrollY; route(); window.scrollTo(0, y); } });
    }));

    // A. 練習比例：每科的讀課文與做題；沒有課文的科目只顯示單色
    var subs = {};
    rl.forEach(function (x) { var o = subs[x.sid] = subs[x.sid] || { read: 0, drill: 0, oth: 0 }; if (x.k === "read") o.read += x.m; else if (x.k === "drill" || x.k === "write") o.drill += x.m; else o.oth += x.m; });
    function t3(o) { return o.read + o.drill + o.oth; }
    var sids = Object.keys(subs).sort(function (a, b) { return t3(subs[b]) - t3(subs[a]); });
    var mx = Math.max.apply(null, sids.map(function (s) { return t3(subs[s]); }).concat([1]));
    var cA = h("div", { class: "card" }, h("div", { class: "h2", text: "A．練習比例（" + rangeTxt + "）" }),
      h("div", { class: "small", text: "實心＝讀課文，斜線＝做題・複習，淺色＝單字、自習等。沒有課文的科目只有斜線；後期以刷題為主，比例偏向做題是正常的。" }),
      sids.length ? sids.map(function (s) {
        var o = subs[s], T = t3(o), lab;
        if (o.read && o.drill) lab = "課文 " + Math.round(o.read / (o.read + o.drill) * 100) + "%・做題 " + Math.round(o.drill / (o.read + o.drill) * 100) + "%";
        else if (o.read) lab = "只有讀課文";
        else if (o.drill) lab = chapters(s).length ? "只有做題" : "以做題為主";
        else lab = "單字、自習等";
        return h("div", { class: "st-row", style: "--c:" + (COL[s] || COL[""]) },
          h("div", { class: "st-hd" }, h("b", { text: nameOf(s) }), h("span", { text: fmtM(T) + "　" + lab })),
          h("div", { class: "st-bar", style: "width:" + Math.max(6, T / mx * 100) + "%" }, o.read ? h("i", { class: "rd", style: "flex:" + o.read }) : null, o.drill ? h("i", { class: "dr", style: "flex:" + o.drill }) : null, o.oth ? h("i", { class: "ot", style: "flex:" + o.oth }) : null));
      }) : h("div", { class: "small", text: "這段期間還沒有記錄。" }));

    // B. 日曆熱力圖
    function dayText(ds) {
      var b = byDay[ds], hd = md(ds) + "（週" + WD.charAt(dowOf(ds)) + "）";
      if (ds > today) return hd + "還沒到";
      if (!b) return hd + "沒有記錄";
      return hd + fmtM(b.m) + "：" + Object.keys(b.k).sort(function (x, y) { return b.k[y] - b.k[x]; }).map(function (k) { return STN[k] + " " + fmtM(b.k[k]); }).join("、") + ((S.plan[ds] || {})._ok ? "　保底完成" : "");
    }
    var det = h("div", { class: "small st-det", text: dayText(today) });
    var hs = monOf(first < (SC.from || today) ? first : (SC.from || today)), he = EXAM_END > today ? EXAM_END : today, cells = [], n = 0;
    for (d = hs; d <= he || n % 7; d = addDays(d, 1), n++) {
      (function (ds) {
        var m = dm(ds), gl = dayGoal(ds), lv = !m ? 0 : m < gl * 0.25 ? 1 : m < gl * 0.5 ? 2 : m < gl * 0.75 ? 3 : 4;
        cells.push(h("div", { class: "st-cell l" + lv + ((S.plan[ds] || {})._ok ? " ok" : "") + (ds > today ? " fut" : "") + (ds === today ? " now" : ""), "aria-label": md(ds) + " " + fmtM(m), onclick: function () { det.textContent = dayText(ds); } }));
      })(d);
    }
    var cB = h("div", { class: "card" }, h("div", { class: "h2", text: "B．日曆熱力圖" }),
      h("div", { class: "small", text: "顏色越深，當天時間越接近目標；綠框＝保底完成；點格子看當天明細。" }),
      h("div", { class: "st-heatw" }, h("div", { class: "st-heat" },
        h("div", { class: "st-wl" }, "一二三四五六日".split("").map(function (c) { return h("span", { text: c }); })),
        h("div", { class: "st-hg", style: "grid-template-columns:repeat(" + (n / 7) + ",26px)" }, cells))),
      det,
      h("div", { class: "st-lg" }, h("span", { text: "少" }), [0, 1, 2, 3, 4].map(function (l) { return h("i", { class: "st-cell l" + l }); }), h("span", { text: "多" })));

    // C. 目標對照：每天的長條與當天目標線
    var cFrom = stRange ? from : (addDays(today, -55) > first ? addDays(today, -55) : first), cd = [], mxc = 60, pastAct = 0, pastGoal = 0;
    for (d = cFrom; d <= today; d = addDays(d, 1)) { var gd = dayGoal(d), dv = dm(d); cd.push({ d: d, m: dv, g: gd }); mxc = Math.max(mxc, dv, gd); if (d < today) { pastAct += dv; pastGoal += gd; } }
    var cC = h("div", { class: "card" }, h("div", { class: "h2", text: "C．目標對照" }),
      h("div", { class: "small", text: "橫線是當天目標（平日 " + fmtM(dayGoal("2026-11-09")) + "、週末 " + fmtM(dayGoal("2026-11-07")) + "）。綠色＝達到目標，藍色＝未達。" }),
      h("div", { class: "st-dg" }, cd.map(function (x) {
        return h("div", { class: "st-dc" + (x.d === today ? " now" : ""), title: md(x.d) + " " + fmtM(x.m) }, h("i", { class: "bar" + (x.m >= x.g ? " ok" : ""), style: "height:" + (x.m / mxc * 100) + "%" }), h("i", { class: "tk", style: "bottom:" + (x.g / mxc * 100) + "%" }));
      })),
      cd.length <= 14 ? h("div", { class: "st-dl" }, cd.map(function (x) { return h("span", { text: WD.charAt(dowOf(x.d)) }); })) : h("div", { class: "small st-dl2" }, h("span", { text: md(cd[0].d) }), h("span", { text: md(today) })),
      pastGoal ? h("div", { class: "small", text: "今天以前累計 " + fmtM(pastAct) + "，目標累計 " + fmtM(pastGoal) + "（" + (pastAct >= pastGoal ? "多 " : "少 ") + fmtM(Math.abs(pastAct - pastGoal)) + "）。" }) : null);

    // D. 各科累計、科目地圖與讀章速度
    var mxs = Math.max.apply(null, sids.map(function (s) { return t3(subs[s]); }).concat([1]));
    var bub = sids.filter(function (s) { return t3(subs[s]); }).map(function (s) {
      var sz = Math.round(44 + Math.sqrt(t3(subs[s]) / mxs) * 56);
      return h("div", { class: "st-bub" }, h("div", { class: "st-bc", style: "width:" + sz + "px;height:" + sz + "px;background:" + (COL[s] || COL[""]), text: fmtM(t3(subs[s])) }), h("span", { text: nameOf(s) }));
    });
    var cD = h("div", { class: "card" }, h("div", { class: "h2", text: "D．各科投入與進度" }),
      h("div", { class: "small", text: "圓的大小是" + rangeTxt + "的投入時間。下方是章節完成數與讀章速度（依讀完的章算，和排程重排用的同一份）。" }),
      bub.length ? h("div", { class: "st-bubs" }, bub) : null,
      KS.subjects.map(function (sx) {
        var cs = chapters(sx.id), dn = 0, pc = paceOf(sx.id), r = pc.n ? pc.v / pc.base : 0, tm = subs[sx.id] ? t3(subs[sx.id]) : 0;
        cs.forEach(function (c) { var ci = chInfo(sx.id + ":" + c.id); if (ci && ci.done) dn++; });
        var sp = !cs.length ? "" : pc.n ? "　速度" + (r < 0.95 ? "比預估快 " + Math.round((1 - r) * 100) + "%" : r > 1.05 ? "比預估慢 " + Math.round((r - 1) * 100) + "%" : "和預估相近") + "（" + pc.n + " 章）" : "　還沒有讀完的章可算速度";
        return h("div", { class: "st-row", style: "--c:" + (COL[sx.id] || COL[""]) },
          h("div", { class: "st-hd" }, h("b", { text: sx.name }), h("span", { text: fmtM(tm) + (cs.length ? "　完成 " + dn + "/" + cs.length + " 章" : "") })),
          cs.length ? h("div", { class: "st-bar st-pg" }, h("i", { class: "rd", style: "flex:" + dn }), h("i", { class: "ot", style: "flex:" + (cs.length - dn) })) : null,
          sp ? h("div", { class: "small", text: sp.trim() }) : null);
      }));

    // G. 最花時間的節（ks-v65 起計時會記每節的閱讀秒數）
    var xsum = {}; rl.forEach(function (x) { if (x.xs) Object.keys(x.xs).forEach(function (k) { xsum[k] = (xsum[k] || 0) + x.xs[k]; }); });
    var xtop = Object.keys(xsum).sort(function (a, b) { return xsum[b] - xsum[a]; }).slice(0, 8);
    var cG = h("div", { class: "card" }, h("div", { class: "h2", text: "最花時間的節（" + rangeTxt + "）" }),
      xtop.length ? xtop.map(function (k) {
        var a = k.split(":"), sc = section(a[0], a[1], a[2]); if (!sc || !subj(a[0])) return null;
        return h("a", { class: "st-xs", href: "#/rd/" + a[0] + "/" + a[1] + "/" + a[2], style: "--c:" + (COL[a[0]] || COL[""]) }, h("span", { text: subj(a[0]).name + "・" + sc.title }), h("b", { text: fmtM(xsum[k] / 60) }));
      }) : h("div", { class: "small", text: "用計時讀課文之後，這裡會列出每一節花了多久。（舊紀錄沒有分節資料）" }));

    // E. 時段分布（有實際各小時分鐘數就用；舊紀錄與手動補記依記錄時間推算）
    var hr = [], htot = 0, j;
    for (i = 0; i < 24; i++) hr.push(0);
    rl.forEach(function (x) {
      if (x.hh) { Object.keys(x.hh).forEach(function (k) { hr[+k] += x.hh[k]; htot += x.hh[k]; }); return; }   // ks-v65 起有實際各小時分鐘數
      if (!x.ts) return; var st = x.ts - x.m * 6e4; for (j = 0; j < x.m; j++) { hr[new Date(st + j * 6e4).getHours()]++; htot++; }
    });
    var hmx = Math.max.apply(null, hr.concat([1])), bestS = 0, bestI = 0;
    for (i = 0; i < 24; i++) { var s2 = hr[i] + hr[(i + 1) % 24]; if (s2 > bestS) { bestS = s2; bestI = i; } }
    function bandPct(a, b) { var s = 0; for (var k = a; k <= b; k++) s += hr[k]; return htot ? Math.round(s / htot * 100) + "%" : "0%"; }
    function p2(x) { return ("0" + x).slice(-2); }
    var cE = h("div", { class: "card" }, h("div", { class: "h2", text: "E．時段分布（" + rangeTxt + "）" }),
      htot ? h("div", { class: "small", text: "最集中的兩小時是 " + p2(bestI) + ":00–" + p2((bestI + 2) % 24) + ":00（占 " + Math.round(bestS / htot * 100) + "%）。清晨 5–11 點 " + bandPct(5, 11) + "，下午 12–17 點 " + bandPct(12, 17) + "，晚上 18–23 點 " + bandPct(18, 23) + "，深夜 0–4 點 " + bandPct(0, 4) + "。" }) : h("div", { class: "small", text: "這段期間還沒有記錄。" }),
      h("div", { class: "st-hr" }, hr.map(function (v, k) { return h("i", { class: k === bestI || k === (bestI + 1) % 24 ? "pk" : "", style: "height:" + Math.max(2, v / hmx * 100) + "%", title: k + " 點 " + v + " 分" }); })),
      h("div", { class: "st-hl" }, ["0", "6", "12", "18", "24"].map(function (t) { return h("span", { text: t }); })));

    // F-2. 每週趨勢：讀課文與做題的比例怎麼變
    var wk = {}, wkeys;
    Object.keys(byDay).forEach(function (k) { var w = monOf(k), o = wk[w] = wk[w] || { read: 0, drill: 0, oth: 0 }, b = byDay[k].k; o.read += b.read || 0; o.drill += (b.drill || 0) + (b.write || 0); o.oth += (b.voc || 0) + (b.free || 0) + (b.oth || 0); });
    wkeys = []; for (d = monOf(addDays(today, -77)) > monOf(first) ? monOf(addDays(today, -77)) : monOf(first); d <= today; d = addDays(d, 7)) wkeys.push(d);
    var wmx = Math.max.apply(null, wkeys.map(function (w) { var o = wk[w]; return o ? t3(o) : 0; }).concat([1]));
    var cF = h("div", { class: "card" }, h("div", { class: "h2", text: "每週趨勢" }),
      h("div", { class: "small", text: "每週的讀課文（藍）、做題・複習（綠）、其他（灰），上方是做題占「課文＋做題」的比例。" }),
      h("div", { class: "st-wg" }, wkeys.map(function (w) {
        var o = wk[w] || { read: 0, drill: 0, oth: 0 }, rd = o.read + o.drill;
        return h("div", { class: "st-wc" }, h("span", { class: "st-wp", text: rd ? Math.round(o.drill / rd * 100) + "%" : "" }),
          h("div", { class: "st-ws", style: "height:" + (t3(o) / wmx * 100) + "%" }, h("i", { class: "o", style: "flex:" + o.oth }), h("i", { class: "d", style: "flex:" + o.drill }), h("i", { class: "r", style: "flex:" + o.read })),
          h("span", { class: "st-wd", text: md(w) }));
      })));

    // 週報：近 7 天文字摘要，可複製貼給 Claude 或存起來
    function weekReport() {
      var s7 = addDays(today, -6), tot = 0, dd = 0, okn = 0, bk = {}, bs = {};
      for (var q = s7; q <= today; q = addDays(q, 1)) { var b = byDay[q]; if (b) { tot += b.m; dd++; Object.keys(b.k).forEach(function (k) { bk[k] = (bk[k] || 0) + b.k[k]; }); } if ((S.plan[q] || {})._ok) okn++; }
      logs.forEach(function (x) { if (x.d >= s7 && x.d <= today) bs[x.sid] = (bs[x.sid] || 0) + x.m; });
      var by = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); };
      return ["【近 7 天時間摘要】" + md(s7) + "–" + md(today),
        "合計 " + fmtM(tot) + "，有記錄 " + dd + " 天，平均每天 " + fmtM(dd ? tot / dd : 0) + "，保底完成 " + okn + " 天",
        "類型：" + (by(bk).map(function (k) { return STN[k] + " " + fmtM(bk[k]); }).join("、") || "無"),
        "科目：" + (by(bs).map(function (s) { return nameOf(s) + " " + fmtM(bs[s]); }).join("、") || "無")].join("\n");
    }
    var wr = weekReport();
    var cR = h("div", { class: "card" }, h("div", { class: "h2", text: "週報" }), h("pre", { class: "st-pre", text: wr }),
      h("button", { class: "btn soft", text: "複製這份摘要", onclick: function () { copyText(wr); } }));

    show(topbar("#/", "今天"), h("h1", { class: "pg-t", text: "時間統計" }), over, ptStats(today, td), h("div", { class: "small" }, "下面幾張圖依選的範圍計算："), seg, cA, cB, cC, cD, cG, cE, cF, cR);
  }

  // ---------- 路由 ----------
  // ---------- 釋字法庭：看事實押注，再判結果、選理由、認號次。資料在 data/game.js，進度在 S.gm（會同步）。 ----------
  var GM = null;   // 進行中的一輪只放記憶體；回課文再回來可以接續，重新整理就重開
  var GM_AO = ["合憲", "違憲"];
  function gmCh(c) { return c.sec.replace(/s\d+$/, ""); }
  function gmCases(sid, scope) {
    return ((KS.game || {}).cases || []).filter(function (c) { return c.sid === sid && (scope === "all" || c.sec === scope || gmCh(c) === scope); });
  }
  function gmIsOk(c) { var g = S.gm[c.id]; return !!(g && g.m); }
  function gmDone(list) { return list.filter(gmIsOk).length; }
  function gmShuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function gmById(id) { return ((KS.game || {}).cases || []).filter(function (c) { return c.id === id; })[0]; }
  function gmScopeName(sid, scope) {
    if (scope === "all") return "全部";
    var cs = chapters(sid), i, x;
    for (i = 0; i < cs.length; i++) { if (cs[i].id === scope) return "第 " + (i + 1) + " 章 " + cs[i].title; x = section(sid, cs[i].id, scope); if (x) return x.title; }
    return "";
  }
  function viewGame(sid) {
    var all = gmCases(sid, "all"), done = gmDone(all), rows = h("div", { class: "rows" });
    chapters(sid).forEach(function (c, i) {
      var l = gmCases(sid, c.id); if (!l.length) return;
      rows.appendChild(h("a", { class: "row", href: "#/gmp/" + sid + "/" + c.id + "/w" },
        h("div", null, h("div", { class: "small", text: "第 " + (i + 1) + " 章" }), h("div", { class: "nm", text: c.title }), h("div", { class: "sub", text: "已熟 " + gmDone(l) + "/" + l.length })),
        h("span", { class: "go", text: "›" })));
    });
    show(topbar("#/s/" + sid, subj(sid).name),
      h("div", { class: "card" }, h("div", { class: "title", text: "釋字法庭" }),
        h("div", { class: "muted", text: "先看事實押注，再判結果、選理由、認號次。三項都對才算熟，答錯的案子會再回來。" }),
        h("div", { class: "goal-b gm-meter" }, h("i", { style: "width:" + (done / all.length * 100) + "%" })),
        h("div", { class: "small", text: "已熟 " + done + "/" + all.length + " 案" }),
        h("div", { class: "btns" },
          h("a", { class: "btn", href: "#/gmp/" + sid + "/all/w", text: done < all.length ? "只練還沒熟的 " + (all.length - done) + " 案" : "全部都熟了，再練一輪" }),
          h("a", { class: "btn soft", href: "#/gmp/" + sid + "/all/a", text: "全部 " + all.length + " 案", onclick: function () { GM = null; } }))),
      h("div", { class: "card" }, h("div", { class: "h2", text: "依章練習" }), rows));
  }
  function gmStart(sid, scope, mode, key) {
    var list = gmCases(sid, scope), pool = mode === "a" ? list : list.filter(function (c) { return !gmIsOk(c); });
    if (!pool.length) pool = list;
    var ids = {}; list.forEach(function (c) { ids[c.id] = 1; });
    var q = gmShuffle(pool).map(function (c) { return { c: c }; });
    gmShuffle(((KS.game || {}).twins || []).filter(function (t) { return ids[t.a] && ids[t.b]; })).forEach(function (t, i) { q.splice(Math.min(q.length, (i + 1) * 5), 0, { t: t }); });
    GM = { key: key, sid: sid, scope: scope, mode: mode, q: q, total: q.length, score: 0, streak: 0, cur: null };
    gmNext();
  }
  function gmNext() {
    var it = GM.q.shift();
    if (!it) { GM.cur = null; return; }
    var cur = GM.cur = { it: it, step: "bet", bet: 0 };
    if (it.c) { cur.ao = it.c.ao ? gmShuffle(it.c.ao) : GM_AO; cur.rs = gmShuffle([it.c.w].concat(it.c.d)); cur.ns = gmShuffle(it.c.n); }
    else { cur.flip = Math.random() < .5; cur.rs = gmShuffle([it.t.w].concat(it.t.d)); }
  }
  function viewGamePlay(sid, scope, mode) {
    var key = [sid, scope, mode].join("|");
    if (!GM || GM.key !== key || !GM.cur) gmStart(sid, scope, mode, key);
    gmDraw();
  }
  function gmSettle(right, c) {
    var cur = GM.cur; cur.right = right; cur.step = "done";
    GM.score += right ? cur.bet : -cur.bet; GM.streak = right ? GM.streak + 1 : 0;
    if (c) { var g = S.gm[c.id] || { r: 0, w: 0 }; S.gm[c.id] = { m: right ? 1 : 0, r: g.r + (right ? 1 : 0), w: g.w + (right ? 0 : 1), ts: Date.now() }; save(); }
    if (!right) GM.q.splice(Math.min(GM.q.length, 3), 0, cur.it);
  }
  function gmOpts(cls, list, step, ans, picked, onpick) {
    var cur = GM.cur, live = cur.step === step, box = h("div", { class: cls });
    list.forEach(function (t) {
      var st = live ? "" : t === ans ? " ok" : t === cur[picked] ? " no" : "";
      box.appendChild(h("button", { type: "button", class: "gm-o" + st, disabled: !live, text: t, onclick: live ? function () { cur[picked] = t; onpick(t); gmDraw(true); } : null }));
    });
    return box;
  }
  function gmDraw(keep) {
    var sid = GM.sid, back = topbar("#/gm/" + sid, "釋字法庭");
    var list = gmCases(sid, GM.scope);
    var stat = h("div", { class: "gm-stat" }, h("span", { text: "分數 " + GM.score }), h("span", { text: "連對 " + GM.streak }), h("span", { text: "待審 " + GM.q.length }), h("span", { text: "已熟 " + gmDone(list) + "/" + list.length }));
    if (!GM.cur) return gmEnd(back, stat);
    var cur = GM.cur, it = cur.it, card = h("div", { class: "card gm-card" }), last = null;
    function add(el) { card.appendChild(el); return el; }
    function ruling() {
      return h("div", { class: "gm-rule" }, h("div", { class: "gm-stamp " + (cur.right ? "good" : "bad"), text: cur.right ? "判決正確 +" + cur.bet : "發回重審 −" + cur.bet }));
    }
    function nextBtn() { return h("button", { type: "button", class: "btn gm-next", text: GM.q.length ? "下一案" : "看結果", onclick: function () { gmNext(); window.scrollTo(0, 0); gmDraw(); } }); }
    function betRow() {
      add(h("p", { class: "gm-q", text: "你有多確定？" }));
      var r = h("div", { class: "gm-row" });
      [[1, "有點猜 ±1"], [2, "還算確定 ±2"], [3, "很確定 ±3"]].forEach(function (x) { r.appendChild(h("button", { type: "button", class: "gm-o", text: x[1], onclick: function () { cur.bet = x[0]; cur.step = "v"; gmDraw(true); } })); });
      add(r);
    }
    if (it.c) {
      var c = it.c;
      add(h("div", { class: "eyebrow", text: "案件" }));
      add(h("p", { class: "gm-fact", text: c.f }));
      if (cur.step === "bet") betRow();
      else {
        add(h("div", { class: "small", text: "押注 " + cur.bet + " 分" }));
        last = add(h("p", { class: "gm-q", text: "一、大法官怎麼判？" }));
        add(gmOpts(cur.ao.join("").length > 12 ? "gm-col" : "gm-row", cur.ao, "v", c.a, "pv", function () { cur.step = "r"; }));
        if (cur.step !== "v") {
          last = add(h("p", { class: "gm-q", text: "二、理由是哪一個？" }));
          add(gmOpts("gm-col", cur.rs, "r", c.w, "pr", function () { cur.step = "n"; }));
        }
        if (cur.step === "n" || cur.step === "done") {
          last = add(h("p", { class: "gm-q", text: "三、這是哪一號？" }));
          add(gmOpts("gm-row", cur.ns, "n", c.k, "pn", function () {
            gmSettle(cur.pv === c.a && cur.pr === c.w && cur.pn === c.k, c);
          }));
        }
        if (cur.step === "done") {
          var R = ruling(), miss = [];
          if (cur.pv !== c.a) miss.push("結果");
          if (cur.pr !== c.w) miss.push("理由");
          if (cur.pn !== c.k) miss.push("號次");
          R.appendChild(h("p", { text: c.no + "：" + c.a + "。" + c.w }));
          if (c.note) R.appendChild(h("p", { class: "muted", text: c.note }));
          if (miss.length) R.appendChild(h("p", { class: "muted", text: "這次卡在：" + miss.join("、") + "。三項都對才算熟，這案稍後會再回來。" }));
          R.appendChild(h("a", { class: "pill", href: "#/rd/" + sid + "/" + gmCh(c) + "/" + c.sec, text: "回課文看這一節 ›" }));
          R.appendChild(nextBtn());
          last = add(R);
        }
      }
    } else {
      var t = it.t, A = gmById(cur.flip ? t.b : t.a), B = gmById(cur.flip ? t.a : t.b), bad = cur.flip ? "甲" : "乙";
      add(h("div", { class: "eyebrow", text: "雙胞胎案：看起來像，結果相反" }));
      add(h("div", { class: "gm-twin" }, h("p", { text: "甲：" + A.f }), h("p", { text: "乙：" + B.f })));
      if (cur.step === "bet") betRow();
      else {
        add(h("div", { class: "small", text: "押注 " + cur.bet + " 分" }));
        last = add(h("p", { class: "gm-q", text: "一、" + (t.ask || "哪一案違憲？") }));
        add(gmOpts("gm-row", ["甲", "乙"], "v", bad, "pv", function () { cur.step = "r"; }));
        if (cur.step !== "v") {
          last = add(h("p", { class: "gm-q", text: "二、" + t.q }));
          add(gmOpts("gm-col", cur.rs, "r", t.w, "pr", function () { gmSettle(cur.pv === bad && cur.pr === t.w, null); }));
        }
        if (cur.step === "done") {
          var R2 = ruling();
          R2.appendChild(h("p", { text: "甲是" + A.no + "（" + A.a + "），乙是" + B.no + "（" + B.a + "）。" + t.w }));
          R2.appendChild(nextBtn());
          last = add(R2);
        }
      }
    }
    show(back, stat, card);
    if (keep && last && last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
  }
  function gmEnd(back, stat) {
    var sid = GM.sid, list = gmCases(sid, GM.scope), tb = h("div", { class: "rows" });
    list.forEach(function (c) {
      var g = S.gm[c.id];
      tb.appendChild(h("div", { class: "row" }, h("div", null, h("div", { class: "nm gm-nm", text: c.no }), h("div", { class: "sub", text: c.a + (g ? "・對 " + g.r + " 次、錯 " + g.w + " 次" : "") })),
        h("span", { class: "pill " + (gmIsOk(c) ? "green" : "red"), text: gmIsOk(c) ? "已熟" : "再練" })));
    });
    function again(mode) { return function () { var sp = GM.scope, to = "#/gmp/" + sid + "/" + sp + "/" + mode; GM = null; if (location.hash === to) route(); else location.hash = to; }; }
    show(back, stat, h("div", { class: "card" }, h("div", { class: "eyebrow", text: "本庭審結" }), h("div", { class: "title", text: gmScopeName(sid, GM.scope) }),
      h("p", { text: "這一輪 " + GM.score + " 分，已熟 " + gmDone(list) + "/" + list.length + " 案。" }),
      h("div", { class: "btns" }, h("button", { type: "button", class: "btn", text: "只練還沒熟的", onclick: again("w") }), h("button", { type: "button", class: "btn soft", text: "全部重來", onclick: again("a") })), tb));
  }

  function route() {
    paceCache = {}; paceGen++;
    var p = (location.hash || "#/").replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    window.scrollTo(0, 0); vHide();
    document.body.classList.remove("rd-fm");
    app.className = "v-" + (p[0] || "home");
    var PAGES = { s: 1, c: 1, x: 1, p: 1, g: 1, r: 1, es: 1, rd: 1, rep: 1, sch: 1, stats: 1, print: 1, gm: 1, gmp: 1 };
    setTabbar(PAGES[p[0]] ? null : (p[0] === "subjects" || p[0] === "wrong" || p[0] === "db" || p[0] === "settings" ? p[0] : ""));
    switch (p[0]) {
      case "subjects": return viewSubjects();
      case "wrong": return viewWrong();
      case "db": return viewDb();
      case "settings": return viewSettings();
      case "s": if (subj(p[1])) return viewSubject(p[1], p[2]); break;
      case "c": if (subj(p[1]) && (p[2] === "_none" || chapter(p[1], p[2]))) return viewChapter(p[1], p[2]); break;
      case "x": if (exam(p[1])) return viewExam(p[1]); break;
      case "p": if (getSet(p[1])) return viewPractice(p[1], parseInt(p[2], 10) || 1); break;
      case "g": if (getSet(p[1])) return viewGrade(p[1]); break;
      case "r": if (getSet(p[1])) return viewResult(p[1]); break;
      case "es": if (essay(p[1])) return viewEssay(p[1]); break;
      case "rd": if (subj(p[1]) && section(p[1], p[2], p[3])) return viewRead(p[1], p[2], p[3]); break;
      case "gm": if (subj(p[1]) && gmCases(p[1], "all").length) return viewGame(p[1]); break;
      case "gmp": if (subj(p[1]) && gmCases(p[1], p[2]).length) return viewGamePlay(p[1], p[2], p[3]); break;
      case "rep": return viewReport();
      case "sch": return viewSchedule();
      case "stats": return viewStats();
      case "print": if (getSet(p[1])) return viewPrint(p[1], p[2]); break;
    }
    setTabbar(""); viewHome();
  }
  window.addEventListener("hashchange", route);
  load(); try { if (localStorage.getItem(SIGK) == null) markSynced(); } catch (e) {} applyTheme(); route(); runInit();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {});
  if (/^https?:$/.test(location.protocol)) setTimeout(function () { checkUpdate(null, true); }, 1500);
})();
