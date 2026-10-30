// 全域搜尋小視窗（ks-v35 起）。獨立於 app.js：浮在所有畫面上（含作答、寫訂正時），
// 搜尋課文、題目、申論、單字、我的訂正與畫線備註。手機＝底部（或頂部）面板，寬螢幕＝右側面板。
// 設定只存本機（ks_search），不同步。
(function () {
  "use strict";
  var KS = window.KS;
  if (!KS) return;
  var LET = ["A", "B", "C", "D"];
  var COL = { chn: "#d0412f", con: "#3b55c4", jur: "#7a4cc4", eng: "#e08a1e", adm: "#1e8558", alaw: "#0d8aa8", pol: "#b0458a", pub: "#6a7284" };
  var LS = "ks_search";
  var cfg = { dock: "b", big: 0, top: 0, hist: [] };
  try { var j0 = JSON.parse(localStorage.getItem(LS)); if (j0) cfg = Object.assign(cfg, j0); } catch (e) {}
  function saveCfg() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} }

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
    var kids = [].concat.apply([], [].slice.call(arguments, 2));
    kids.forEach(function (c) { if (c == null || c === false) return; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  // 全形英數轉半形、轉小寫（長度不變，才能用原文位置畫螢光）
  function fold(s) {
    return String(s == null ? "" : s).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/　/g, " ").toLowerCase();
  }
  function toast(t) { var el = h("div", { class: "toast", text: t }); document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1500); }
  function subj(id) { return KS.subjects.filter(function (s) { return s.id === id; })[0]; }
  function sname(id) { var s = subj(id); return s ? s.name : id; }
  function exam(id) { return KS.exams.filter(function (e) { return e.id === id; })[0]; }
  function ansOf(q) { return (Array.isArray(q.a) ? q.a : [q.a]); }
  function copy(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast("已複製"); }, old); else old();
    function old() { var ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("已複製"); } catch (e) {} ta.remove(); }
  }
  // 目前畫面所屬科目（排序加分用）
  function curSid() {
    var p = (location.hash || "").replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    if (p[0] === "s" || p[0] === "c" || p[0] === "rd") return p[1];
    if (p[0] === "x") { var e = exam(p[1]); return e && e.subject; }
    if (p[0] === "es") { var x = KS.essays.filter(function (y) { return y.id === p[1]; })[0]; return x && x.subject; }
    if (p[0] === "p" || p[0] === "g" || p[0] === "r" || p[0] === "print") {
      var k = (p[1] || "").split(":");
      if (k[0] === "e") { var e2 = exam(k[1]); return e2 && e2.subject; }
      return k[1];
    }
    return "";
  }

  // ---------- 索引 ----------
  var IDX = null, SEC = {}, NOTES = [], VOC = null, vState = 0;   // vState：0 未載入、1 載入中、2 完成、3 失敗
  function plain(raw) {
    var t = String(raw), g = "";
    if (/^(表｜|\| |::flow|::timeline)/.test(t)) {
      t = t.split("\n").filter(function (l) { return !/^\|[\s:|-]+\|?$/.test(l); }).map(function (l) {
        if (l.slice(0, 2) === "表｜") return l.slice(2);
        var m = /^::(flow|timeline) ?(.*)$/.exec(l); if (m) return m[2];
        if (/^\|/.test(l)) return l.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(function (s) { return s.trim(); }).join(" ｜ ");
        return l;
      }).filter(Boolean).join("\n");
      g = "圖表";
    } else if (t.slice(0, 3) === "!! ") { t = t.slice(3); g = "易錯"; }
    else if (t.slice(0, 3) === "## ") { t = t.slice(3); g = "小標"; }
    return { t: t.replace(/\*\*/g, ""), g: g };
  }
  function qText(q) {
    return (q.q || "") + "\n" + (q.o || []).map(function (o, i) { return LET[i] + ". " + o; }).join("\n") + (q.note ? "\n" + q.note : "") + (q.x ? "\n" + q.x : "");
  }
  function essText(x) {
    return (x.src || "") + " " + (x.q || "") + "\n" + (x.pts || []).map(function (p) { return (p.h || "") + " " + (p.k || []).join(" ") + " " + (p.n || ""); }).join("\n");
  }
  function build() {
    if (IDX) return;
    IDX = [];
    Object.keys(KS.chapters).forEach(function (sid) {
      KS.chapters[sid].forEach(function (c) {
        (c.sections || []).forEach(function (x) {
          SEC[sid + ":" + x.id] = { c: c, x: x };
          IDX.push({ k: "s", sid: sid, c: c, x: x, f: fold(c.title + " " + x.title + " " + (x.src || "")) });
          (x.text || x.body || []).forEach(function (raw, i) {
            var pl = plain(raw); if (!pl.t) return;
            IDX.push({ k: "p", sid: sid, c: c, x: x, i: i, t: pl.t, g: pl.g, f: fold(pl.t) });
          });
        });
      });
    });
    KS.exams.forEach(function (e) {
      e.questions.forEach(function (q, i) { IDX.push({ k: "q", sid: e.subject, e: e, n: i + 1, q: q, f: fold(qText(q)) }); });
    });
    KS.essays.forEach(function (x) { IDX.push({ k: "e", sid: x.subject, x: x, f: fold(essText(x)) }); });
  }
  // 我的訂正與畫線備註：每次開啟時從本機進度重讀
  function loadNotes() {
    NOTES = [];
    var S = null;
    try { S = JSON.parse(localStorage.getItem("ks_v1")); } catch (e) {}
    if (!S) return;
    Object.keys(S.notes || {}).forEach(function (k) {
      var t = (S.notes[k] || "").trim(); if (!t) return;
      var i = k.lastIndexOf("#"), e = exam(k.slice(0, i)), n = +k.slice(i + 1);
      if (!e || !e.questions[n - 1]) return;
      NOTES.push({ k: "n", sub: "q", sid: e.subject, e: e, n: n, q: e.questions[n - 1], t: t, f: fold(t) });
    });
    Object.keys(S.marks || {}).forEach(function (mk) {
      var s = SEC[mk]; if (!s) return;
      (S.marks[mk] || []).forEach(function (m) {
        var t = ((m.q || "") + (m.note ? "\n" + m.note : "")).trim(); if (!t) return;
        NOTES.push({ k: "n", sub: "m", sid: mk.split(":")[0], c: s.c, x: s.x, m: m, t: t, f: fold(t) });
      });
    });
  }
  function loadVocab() {
    if (KS.vocab) { buildVoc(); return; }
    if (vState === 1) return;
    vState = 1;
    var tag = document.querySelector('script[src="data/vocab.js"]');
    if (!tag) { tag = document.createElement("script"); tag.src = "data/vocab.js"; document.head.appendChild(tag); }
    tag.addEventListener("load", function () { buildVoc(); run(); });
    tag.addEventListener("error", function () { vState = 3; run(); });
  }
  function buildVoc() {
    if (VOC || !KS.vocab) return;
    VOC = Object.keys(KS.vocab).map(function (w) { var d = KS.vocab[w]; return { k: "v", sid: "eng", w: w, d: d, f: fold(w + " " + (d[1] || "") + " " + (d[0] || "")) }; });
    vState = 2;
  }

  // ---------- 搜尋 ----------
  var GROUPS = [["p", "課文"], ["q", "題目"], ["e", "申論"], ["n", "我的訂正與畫線"], ["v", "單字"]];
  var SCOPES = [["all", "全部"], ["p", "課文"], ["q", "題目"], ["e", "申論"], ["n", "我的筆記"], ["v", "單字"]];
  var st = { scope: "all", sid: "" }, last = null, more = {};
  function kindOf(u) { return u.k === "s" ? "p" : u.k; }
  function score(u, terms, cur) {
    var f = u.f, s = 0, i;
    for (i = 0; i < terms.length; i++) if (f.indexOf(terms[i]) < 0) return -1;
    if (terms.length > 1) { if (f.indexOf(terms.join(" ")) >= 0 || f.indexOf(terms.join("")) >= 0) s += 3; }
    else { var c = 0, at = 0; while (c < 3 && (at = f.indexOf(terms[0], at)) >= 0) { c++; at += terms[0].length; } s += c; }
    if (u.k === "s") s += 4;
    if (u.k === "v") { var w = u.w.toLowerCase(); if (w === terms.join(" ")) s += 8; else if (w.indexOf(terms[0]) === 0) s += 4; }
    if (u.sid === cur) s += 1;
    return s;
  }
  function termsOf(q) { return fold(q).trim().split(/\s+/).filter(Boolean); }
  function run() {
    var terms = termsOf(inp.value);
    list.replaceChildren();
    if (!terms.length || (terms.length === 1 && terms[0].length < 2 && /^[\x00-\x7f]*$/.test(terms[0]))) { last = null; return empty(); }
    build();
    var needV = st.scope === "v" || (st.scope === "all" && /[a-z]/.test(fold(inp.value)));
    if (needV && !VOC) loadVocab();
    var pool = IDX.concat(NOTES, VOC || []), cur = curSid(), res = { p: [], q: [], e: [], n: [], v: [] };
    pool.forEach(function (u, o) {
      var kd = kindOf(u);
      if (st.scope !== "all" && st.scope !== kd) return;
      if (st.sid && u.sid !== st.sid) return;
      var s = score(u, terms, cur);
      if (s >= 0) res[kd].push({ u: u, s: s, o: o });
    });
    Object.keys(res).forEach(function (k) { res[k].sort(function (a, b) { return (b.s - a.s) || (a.o - b.o); }); });
    last = { terms: terms, res: res, needV: needV };
    more = {};
    paint();
  }
  function empty() {
    list.appendChild(h("div", { class: "sp-hint", text: "輸入關鍵字（兩個字以上較準，空白分隔＝都要有）。可搜尋課文、題目與解析、申論骨架、我的訂正與畫線備註、英文單字。" }));
    if (cfg.hist.length) {
      list.appendChild(h("div", { class: "sp-hh" }, h("span", { text: "最近搜尋" }), h("button", { class: "sp-link", text: "清除", onclick: function () { cfg.hist = []; saveCfg(); run(); } })));
      list.appendChild(h("div", { class: "sp-chips wrap" }, cfg.hist.map(function (q) { return h("button", { class: "sp-chip", text: q, onclick: function () { inp.value = q; run(); } }); })));
    }
  }
  function pushHist() {
    var q = inp.value.trim(); if (!q) return;
    cfg.hist = [q].concat(cfg.hist.filter(function (x) { return x !== q; })).slice(0, 6); saveCfg();
  }
  function paint() {
    list.replaceChildren();
    if (!last) return empty();
    var any = false;
    GROUPS.forEach(function (g) {
      var arr = last.res[g[0]]; if (!arr.length) return;
      any = true;
      var n = more[g[0]] || 12;
      list.appendChild(h("div", { class: "sp-gh", text: g[1] + " · " + arr.length }));
      arr.slice(0, n).forEach(function (r) { list.appendChild(row(r.u, last.terms)); });
      if (arr.length > n) list.appendChild(h("button", { class: "sp-more", text: "再顯示 " + Math.min(20, arr.length - n) + " 筆（共 " + arr.length + "）", onclick: function () { more[g[0]] = n + 20; paint(); } }));
    });
    if (last.needV && vState === 1) list.appendChild(h("div", { class: "sp-hint", text: "單字庫載入中…" }));
    if (last.needV && vState === 3) list.appendChild(h("div", { class: "sp-hint", text: "單字庫載入失敗（離線時第一次無法載入）" }));
    if (!any && vState !== 1) list.appendChild(h("div", { class: "sp-hint", text: "找不到「" + inp.value.trim() + "」。換個關鍵字，或把科目、範圍改成「全部」。" }));
  }

  // ---------- 顯示 ----------
  function hl(text, terms) {
    var f = fold(text), out = document.createDocumentFragment();
    if (f.length !== text.length) { out.appendChild(document.createTextNode(text)); return out; }
    var sp = [];
    terms.forEach(function (t) { var i = 0, p; while ((p = f.indexOf(t, i)) >= 0) { sp.push([p, p + t.length]); i = p + t.length; } });
    sp.sort(function (a, b) { return a[0] - b[0]; });
    var m = [];
    sp.forEach(function (s) { var l = m[m.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else m.push(s.slice()); });
    var at = 0;
    m.forEach(function (s) {
      if (s[0] > at) out.appendChild(document.createTextNode(text.slice(at, s[0])));
      out.appendChild(h("mark", { text: text.slice(s[0], s[1]) })); at = s[1];
    });
    if (at < text.length) out.appendChild(document.createTextNode(text.slice(at)));
    return out;
  }
  function baseText(u) {
    switch (u.k) {
      case "s": return u.c.title + " › " + u.x.title;
      case "p": return u.t;
      case "q": return qText(u.q);
      case "e": return essText(u.x);
      case "n": return u.t;
      default: return (u.d[1] || "") + "　" + (u.d[0] || "");
    }
  }
  function snippet(u, terms) {
    var t = baseText(u).replace(/\s*\n\s*/g, "　"), f = fold(t), p = -1;
    if (f.length !== t.length) return t.slice(0, 90);
    terms.forEach(function (x) { var i = f.indexOf(x); if (i >= 0 && (p < 0 || i < p)) p = i; });
    var s = Math.max(0, p - 28);
    return (s ? "…" : "") + t.slice(s, s + 92) + (s + 92 < t.length ? "…" : "");
  }
  function loc(u) {
    switch (u.k) {
      case "s": return "章節 · " + u.x.title;
      case "p": return u.x.title + " · 第 " + (u.i + 1) + " 段" + (u.g ? " · " + u.g : "");
      case "q": return u.e.short + " 第 " + (u.q.no || u.n) + " 題";
      case "e": return "申論 · " + (u.x.src || "");
      case "n": return u.sub === "q" ? u.e.short + " 第 " + (u.q.no || u.n) + " 題・訂正" : u.x.title + " · 畫線";
      default: return u.w;
    }
  }
  function row(u, terms) {
    var el = h("div", { class: "sp-row", role: "button", tabindex: "0" },
      h("div", { class: "sp-hd" }, h("span", { class: "sp-sub", style: "--c:" + (COL[u.sid] || "#6a7284"), text: u.k === "v" ? "單字" : sname(u.sid) }),
        h("span", { class: "sp-loc", text: loc(u) })),
      h("div", { class: "sp-sn" }, hl(snippet(u, terms), terms)));
    var dt = null;
    function toggle() {
      if (dt) { dt.remove(); dt = null; el.classList.remove("open"); return; }
      [].forEach.call(list.querySelectorAll(".sp-row.open"), function (o) { if (o !== el && o._close) o._close(); });
      dt = detail(u, terms); el.appendChild(dt); el.classList.add("open"); pushHist();
    }
    el._close = function () { if (dt) { dt.remove(); dt = null; el.classList.remove("open"); } };
    el.addEventListener("click", function (ev) { if (dt && dt.contains(ev.target)) return; toggle(); });
    el.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target === el) toggle(); });
    return el;
  }
  function btn(text, fn, soft) { return h("button", { class: "sp-b" + (soft ? " soft" : ""), type: "button", text: text, onclick: fn }); }
  function goBtn(text, href) { return h("a", { class: "sp-b", href: href, text: text }); }
  function secHref(sid, cid, xid) { return "#/rd/" + sid + "/" + cid + "/" + xid; }
  function detail(u, terms) {
    var box = h("div", { class: "sp-dt" });
    function acts(a) { box.appendChild(h("div", { class: "sp-acts" }, a)); }
    if (u.k === "p" || u.k === "s") {
      var ps = (u.x.text || u.x.body || []).map(function (r) { return plain(r); }), cur = u.k === "p" ? u.i : 0;
      var body = h("div", { class: "sp-par" }), pos = h("span", { class: "sp-pos" });
      var prev = btn("‹ 上一段", function () { cur--; paint2(); }, true), next = btn("下一段 ›", function () { cur++; paint2(); }, true);
      var paint2 = function () {
        var p = ps[cur] || { t: "" };
        body.replaceChildren(hl(p.t, u.k === "p" ? terms : []));
        pos.textContent = "第 " + (cur + 1) + " / " + ps.length + " 段" + (p.g ? " · " + p.g : "");
        prev.disabled = cur <= 0; next.disabled = cur >= ps.length - 1;
      };
      paint2();
      box.appendChild(body);
      acts([prev, pos, next]);
      acts([goBtn("前往全文", secHref(u.sid, u.c.id, u.x.id)), btn("複製這段", function () { copy((ps[cur] || {}).t || ""); }, true)]);
    } else if (u.k === "q") {
      var q = u.q;
      box.appendChild(h("div", { class: "sp-qt" }, hl(q.q || "", terms)));
      if (q.g && u.e.passages && u.e.passages[q.g]) box.appendChild(h("details", { class: "sp-ps" }, h("summary", { text: "短文" }), h("div", { text: u.e.passages[q.g] })));
      (q.o || []).forEach(function (o, i) { box.appendChild(h("div", { class: "sp-op" + (ansOf(q).indexOf(i) >= 0 ? " ok" : "") }, LET[i] + ". ", hl(o, terms))); });
      box.appendChild(h("div", { class: "sp-ans", text: "答案：" + ansOf(q).map(function (i) { return LET[i]; }).join(" 或 ") }));
      if (q.note) box.appendChild(h("div", { class: "sp-x" }, "更正：", hl(q.note, terms)));
      if (q.x) box.appendChild(h("div", { class: "sp-x" }, "解析：", hl(q.x, terms)));
      var a = [goBtn("前往該題", "#/p/e:" + u.e.id + "/" + u.n)];
      if (q.ch && q.sec && SEC[u.sid + ":" + q.sec]) a.push(goBtn("對應課文", secHref(u.sid, q.ch, q.sec)));
      acts(a);
    } else if (u.k === "e") {
      box.appendChild(h("div", { class: "sp-qt" }, hl(u.x.q || "", terms)));
      (u.x.pts || []).forEach(function (p) {
        box.appendChild(h("div", { class: "sp-pt" }, h("b", null, hl(p.h || "", terms)), p.k && p.k.length ? h("div", { class: "sp-kw" }, hl(p.k.join("、"), terms)) : null, p.n ? h("div", { class: "sp-x" }, hl(p.n, terms)) : null));
      });
      acts([goBtn("前往該題", "#/es/" + u.x.id)]);
    } else if (u.k === "n") {
      if (u.sub === "q") {
        box.appendChild(h("div", { class: "sp-x" }, "題目：" + (u.q.q || "").slice(0, 120) + ((u.q.q || "").length > 120 ? "…" : "")));
        box.appendChild(h("div", { class: "sp-par" }, hl(u.t, terms)));
        acts([goBtn("前往該題", "#/p/e:" + u.e.id + "/" + u.n), btn("複製", function () { copy(u.t); }, true)]);
      } else {
        box.appendChild(h("div", { class: "sp-par" }, hl(u.t, terms)));
        acts([goBtn("前往全文", secHref(u.sid, u.c.id, u.x.id)), btn("複製", function () { copy(u.t); }, true)]);
      }
    } else {
      var d = u.d;
      box.appendChild(h("div", { class: "sp-qt" }, u.w, h("span", { class: "sp-pos", text: "　" + (d[0] || "") })));
      box.appendChild(h("div", { class: "sp-par", text: d[1] || "" }));
      if (d[2]) box.appendChild(h("div", { class: "sp-x" }, d[2].replace(/\{([^}]*)\}/g, "$1"), h("br"), d[3] || ""));
      if (d[4]) box.appendChild(h("div", { class: "sp-x", text: "出處：" + d[4] + (d[5] ? " 第 " + d[5] + " 題" : "") }));
    }
    return box;
  }

  // ---------- 面板 ----------
  var inp = h("input", { type: "search", class: "sp-in", placeholder: "搜尋課文、題目、申論、單字", enterkeyhint: "search", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "搜尋" });
  var list = h("div", { class: "sp-list" });
  var scopeRow = h("div", { class: "sp-chips" }), subRow = h("div", { class: "sp-chips" });
  var dockBtn = h("button", { class: "sp-ic sp-dock", "aria-label": "換到上方或下方", text: "⇅", onclick: function () { cfg.dock = cfg.dock === "t" ? "b" : "t"; saveCfg(); layout(); } });
  var sizeBtn = h("button", { class: "sp-ic sp-size", "aria-label": "放大或縮小", text: "⤢", onclick: function () { cfg.big = cfg.big ? 0 : 1; saveCfg(); layout(); } });
  var closeBtn = h("button", { class: "sp-ic", "aria-label": "關閉搜尋", text: "✕", onclick: function () { close(); } });
  var panel = h("div", { class: "sp", role: "dialog", "aria-label": "搜尋" },
    h("div", { class: "sp-top" }, inp, dockBtn, sizeBtn, closeBtn), scopeRow, subRow, list);
  var fab = h("button", { class: "sp-fab", "aria-label": "開啟搜尋", text: "🔍" });
  var wideMQ = window.matchMedia("(min-width: 860px)");

  function chip(label, on, fn, col) {
    return h("button", { class: "sp-chip", type: "button", "aria-pressed": String(!!on), text: label, style: col ? "--c:" + col : null, onclick: fn });
  }
  function chips() {
    scopeRow.replaceChildren.apply(scopeRow, SCOPES.map(function (s) { return chip(s[1], st.scope === s[0], function () { st.scope = s[0]; chips(); run(); }); }));
    build();
    var have = {}; IDX.forEach(function (u) { have[u.sid] = 1; });
    have.eng = 1;
    var subs = KS.subjects.filter(function (s) { return have[s.id]; });
    subRow.replaceChildren.apply(subRow, [chip("全部科目", !st.sid, function () { st.sid = ""; chips(); run(); })].concat(subs.map(function (s) {
      return chip(s.name, st.sid === s.id, function () { st.sid = st.sid === s.id ? "" : s.id; chips(); run(); }, COL[s.id]);
    })));
  }
  function wide() { return wideMQ.matches; }
  function isOpen() { return panel.classList.contains("on"); }
  function inPanel() { return panel.contains(document.activeElement); }
  // 版面：手機貼著可視區（避開鍵盤），並替頁面留出空間；寬螢幕在右側
  function layout() {
    panel.classList.toggle("top", cfg.dock === "t");
    panel.classList.toggle("big", !!cfg.big);
    var b = document.body.style;
    if (!isOpen()) { b.paddingTop = b.paddingBottom = ""; document.body.classList.remove("sp-open"); return; }
    document.body.classList.add("sp-open");
    if (wide()) { panel.style.top = panel.style.bottom = panel.style.maxHeight = ""; b.paddingTop = b.paddingBottom = ""; return; }
    var vv = window.visualViewport, vh = vv ? vv.height : innerHeight, vt = vv ? vv.offsetTop : 0;
    var keyboard = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    // 鍵盤在別處（例如在寫訂正）時，面板只佔 42%，不蓋住正在輸入的框
    panel.style.maxHeight = Math.round(inPanel() || !keyboard ? vh - 10 : vh * 0.42) + "px";
    if (cfg.dock === "t") { panel.style.top = (vt + (document.body.classList.contains("has-run") ? 48 : 0)) + "px"; panel.style.bottom = "auto"; }
    else { panel.style.bottom = keyboard + "px"; panel.style.top = "auto"; }
    var ph = panel.offsetHeight;
    b.paddingTop = cfg.dock === "t" ? "calc(" + ph + "px + env(safe-area-inset-top, 0px))" : "";
    b.paddingBottom = cfg.dock === "t" ? "" : "calc(" + (ph + 28) + "px + env(safe-area-inset-bottom, 0px))";
  }
  // 在頁面上點到輸入框時，若被面板擋住就捲到看得到
  function reveal(el) {
    if (!isOpen() || wide() || panel.contains(el)) return;
    setTimeout(function () {
      var r = el.getBoundingClientRect(), pr = panel.getBoundingClientRect(), vv = window.visualViewport, top = vv ? vv.offsetTop : 0, bot = vv ? vv.offsetTop + vv.height : innerHeight;
      if (cfg.dock === "t") { if (r.top < pr.bottom + 6) window.scrollBy(0, r.top - pr.bottom - 6); }
      else { var lim = Math.min(pr.top, bot) - 6; if (r.bottom > lim) window.scrollBy(0, Math.max(0, Math.min(r.bottom - lim, r.top - top - 8))); }
    }, 380);
  }
  var lastSel = null;
  document.addEventListener("selectionchange", function () {
    var s = window.getSelection(), t = s ? s.toString().trim() : "";
    if (t && t.length <= 40 && !(s.anchorNode && panel.contains(s.anchorNode))) lastSel = { t: t.replace(/\s+/g, " "), ts: Date.now() };
  });
  function open() {
    build(); loadNotes(); chips();
    var pre = lastSel && Date.now() - lastSel.ts < 20000 ? lastSel.t : "";
    if (pre) { inp.value = pre; lastSel = null; }
    panel.classList.add("on"); fab.hidden = true;
    layout();
    run();
    if (!wide() || !inp.value) setTimeout(function () { inp.focus(); inp.select(); }, 50);
  }
  function close() { pushHist(); panel.classList.remove("on"); fab.hidden = false; inp.blur(); layout(); }
  function route() {
    var pr = /^#\/print/.test(location.hash || "");
    fab.style.display = pr ? "none" : "";
    if (pr && isOpen()) close();
    else if (isOpen()) { layout(); if (last) paint(); }   // 換頁後重排；排序加分用的目前科目也跟著變
  }

  var tmr = null;
  inp.addEventListener("input", function () { clearTimeout(tmr); tmr = setTimeout(run, 160); });
  inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { clearTimeout(tmr); run(); pushHist(); inp.blur(); } });
  list.addEventListener("touchstart", function () { if (document.activeElement === inp) inp.blur(); }, { passive: true });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && isOpen()) close();
    else if (ev.key === "/" && !isOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && !(document.activeElement && document.activeElement.isContentEditable)) { ev.preventDefault(); open(); }
  });
  document.addEventListener("focusin", function (ev) { layout(); if (/^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) reveal(ev.target); });
  document.addEventListener("focusout", function () { setTimeout(layout, 60); });
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", layout); window.visualViewport.addEventListener("scroll", layout); }
  window.addEventListener("resize", function () { fabPlace(); layout(); });
  window.addEventListener("hashchange", route);

  // 浮動鈕：貼右緣，可上下拖動，位置記在本機
  var drag = null;
  function fabPlace() { var t = cfg.top || Math.round(innerHeight * 0.58); fab.style.top = Math.max(70, Math.min(innerHeight - 110, t)) + "px"; }
  fab.addEventListener("pointerdown", function (ev) { drag = { y: ev.clientY, t: fab.offsetTop, m: false }; try { fab.setPointerCapture(ev.pointerId); } catch (e) {} });
  fab.addEventListener("pointermove", function (ev) {
    if (!drag) return; var dy = ev.clientY - drag.y;
    if (Math.abs(dy) > 8) drag.m = true;
    if (drag.m) fab.style.top = Math.max(70, Math.min(innerHeight - 110, drag.t + dy)) + "px";
  });
  fab.addEventListener("pointerup", function () {
    if (!drag) return;
    if (drag.m) { cfg.top = fab.offsetTop; saveCfg(); } else open();
    drag = null;
  });
  fab.addEventListener("pointercancel", function () { drag = null; });
  fab.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } });

  document.body.appendChild(panel);
  document.body.appendChild(fab);
  fabPlace(); route();
  window.KSSearch = { open: open, close: close };
})();
