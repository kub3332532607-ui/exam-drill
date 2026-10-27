(function () {
  "use strict";
  var KS = window.KS, LET = ["A", "B", "C", "D"];
  var app = document.getElementById("app");

  // ---------- 儲存 ----------
  var KEY = "ks_v1";
  var S = { stats: {}, attempts: [], notes: {}, essay: {}, theme: "", print: {} };
  function load() {
    try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) S = Object.assign(S, j); } catch (e) {}
    migrate();
  }
  function migrate() {
    S.attempts.forEach(function (a) { if (!a.set && a.exam) a.set = "e:" + a.exam; });
    S.essay = S.essay || {}; S.print = S.print || {};
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
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return el;
  }
  function show() { app.replaceChildren.apply(app, [].slice.call(arguments).filter(Boolean)); }
  function go(hash) { location.hash = hash; }
  function toast(t) { var el = h("div", { class: "toast", text: t }); document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1800); }
  function subj(id) { return KS.subjects.filter(function (s) { return s.id === id; })[0]; }
  function exam(id) { return KS.exams.filter(function (e) { return e.id === id; })[0]; }
  function chapters(sid) { return KS.chapters[sid] || []; }
  function chapter(sid, cid) { return chapters(sid).filter(function (c) { return c.id === cid; })[0]; }
  function essay(id) { return KS.essays.filter(function (e) { return e.id === id; })[0]; }
  function qid(e, n) { return e.id + "#" + n; }
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
        var hit = p[0] === "c" ? (p[2] === "_none" ? !q.ch : q.ch === p[2]) : (stat(e, i + 1) && stat(e, i + 1).last === "w");
        if (hit) items.push({ e: e, n: i + 1, q: q });
      });
    });
    if (p[0] === "c") { var c = chapter(sid, p[2]); title = c ? c.title : "尚未分章的題目"; back = "#/c/" + sid + "/" + p[2]; }
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
    return KS.essays.filter(function (x) { return x.subject === p[1] && (p[2] === "_none" ? !x.ch : x.ch === p[2]); });
  }
  function lastAttempt(key) { for (var i = S.attempts.length - 1; i >= 0; i--) if (S.attempts[i].set === key) return S.attempts[i]; return null; }
  function counts(items) {
    var done = 0, wrong = 0;
    items.forEach(function (it) { var s = stat(it.e, it.n); if (s) { done++; if (s.last === "w") wrong++; } });
    return { done: done, wrong: wrong, total: items.length };
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
    show(topbar(),
      h("div", { class: "card" }, h("div", { class: "eyebrow", text: "一般行政" }), h("div", { class: "title", text: "今天讀哪一科？" }), h("div", { class: "muted", text: wr ? "錯題本裡還有 " + wr + " 題等你回來。" : "先複習一章，再寫那一章的考古題。" })),
      h("div", { class: "card" }, rows),
      h("div", { class: "card" }, h("div", { class: "h2", text: "備份" }), h("div", { class: "small", text: "進度只存在這支手機的瀏覽器。換裝置前先匯出，到新裝置匯入。" }),
        h("div", { class: "btns" }, h("button", { class: "btn soft", text: "匯出進度", onclick: exportData }), h("label", { class: "btn soft", for: "imp", text: "匯入進度" }),
          h("input", { id: "imp", type: "file", accept: "application/json", hidden: true, onchange: importData }))));
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
          h("div", null, h("div", { class: "nm", text: e.short }), h("div", { class: "sub", text: e.questions.length + " 題・" + (la ? "上次 " + la.score + " 分" : "還沒對過答案") })),
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
    var head = h("div", { class: "card" }, h("div", { class: "eyebrow", text: c ? "第 " + (idx + 1) + " 章" : s.name }), h("div", { class: "title", text: set.title }));
    if (c) head.appendChild(h("div", { class: "muted", text: "先讀完下面的重點，再寫本章考古題。" }));
    nodes.push(head);
    if (c) {
      var rv = h("div", { class: "card" }, h("div", { class: "h2", text: "複習" }));
      c.sections.forEach(function (sec, i) {
        var mq = set.items.filter(function (it) { return it.q.sec === sec.id; }).length;
        var eq = es.filter(function (x) { return x.sec === sec.id; });
        var d = h("details", { class: "sec" }, h("summary", null, h("span", { text: sec.title }), h("span", { class: "ar", text: "›" })));
        var ul = h("ul"); sec.body.forEach(function (t) { ul.appendChild(h("li", { text: t })); });
        var links = h("div", { class: "sec-links" });
        if (mq) links.appendChild(h("span", { class: "pill blue", text: "選擇題 " + mq }));
        eq.forEach(function (x) { links.appendChild(h("a", { class: "pill", href: "#/es/" + x.id, text: "申論 " + x.src })); });
        d.appendChild(h("div", { class: "sec-body" }, ul, h("div", { class: "small", style: "margin-top:8px", text: "出自：" + sec.src }), links.childNodes.length ? links : null));
        if (i === 0) d.open = true;
        rv.appendChild(d);
      });
      nodes.push(rv);
    }
    var ct = counts(set.items), la = lastAttempt(key);
    var mc = h("div", { class: "card" }, h("div", { class: "h2", text: "本章選擇題" }),
      h("div", { class: "muted", text: set.items.length ? set.items.length + " 題・已做 " + ct.done + "・錯 " + ct.wrong + (la ? "・上次紙本答對 " + la.correct + "/" + la.total : "") : "目前考卷裡還沒有對應這章的選擇題，傳更多考卷就會補上。" }));
    if (set.items.length) mc.appendChild(h("div", { class: "btns" },
      h("a", { class: "btn", href: "#/print/" + key, text: "列印本章" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" }),
      h("a", { class: "btn soft", href: "#/p/" + key + "/1", text: "在手機上寫" })));
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
        h("div", { class: "muted", text: e.questions.length + " 題・每題 " + e.perScore + " 分・已做 " + ct.done + "・錯 " + ct.wrong }),
        la ? h("div", { style: "margin-top:10px" }, h("span", { class: "verdict " + (la.score >= 60 ? "ok" : "no"), text: "上次 " + la.score + " 分" })) : null,
        h("div", { class: "btns" }, h("a", { class: "btn", href: "#/print/" + key, text: "列印試卷" }), h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" }), h("a", { class: "btn soft", href: "#/p/" + key + "/1", text: "在手機上寫" }))));
  }

  // ---------- 手機作答（逐題） ----------
  var picked = {};
  function optBtn(q, i, cls, fn) {
    var b = h("button", { class: "opt " + (cls || ""), onclick: fn }, h("span", { class: "L", text: LET[i] }), h("span", { class: "t", text: q.o[i] }));
    if (!fn) b.disabled = true;
    return b;
  }
  function viewPractice(key, n) {
    var set = useSet(key); if (!set || !set.items.length) return go("#/");
    var it = set.items[n - 1]; if (!it) return go(set.back);
    var k = qid(it.e, it.n), pk = picked[k], q = it.q;
    var opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) {
      var cls = pk == null ? "" : i === q.a ? "right" : i === pk ? "wrong" : "dim";
      opts.appendChild(optBtn(q, i, cls, pk == null ? function () { picked[k] = i; record(it.e, it.n, i === q.a); save(); viewPractice(key, n); } : null));
    });
    var card = h("div", { class: "card" },
      h("div", { class: "qno" }, h("span", { text: n + " / " + set.items.length }), h("span", { text: it.e.short + " 第 " + it.n + " 題" })),
      h("div", { class: "qtext", text: q.q }), opts);
    if (pk != null) {
      card.appendChild(h("div", { style: "margin-top:14px" }, h("span", { class: "verdict " + (pk === q.a ? "ok" : "no"), text: pk === q.a ? "答對了" : "答錯，正解是 " + LET[q.a] })));
      card.appendChild(h("p", null, h("a", { class: "link-out", href: search(q), target: "_blank", rel: "noopener", text: "到阿摩看考生詳解 ↗" })));
      card.appendChild(noteBox(it));
    }
    var last = n >= set.items.length;
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn soft", text: "上一題", disabled: n <= 1, onclick: function () { go("#/p/" + key + "/" + (n - 1)); } }),
      h("button", { class: "btn", text: last ? "完成" : "下一題", onclick: function () { if (last) { Object.keys(picked).forEach(function (x) { delete picked[x]; }); delete frozen[key]; go(set.back); } else go("#/p/" + key + "/" + (n + 1)); } })));
    show(topbar(set.back, set.title), card);
  }
  function noteBox(it) {
    var k = qid(it.e, it.n);
    var ta = h("textarea", { id: "nt_" + k.replace(/\W/g, "_"), placeholder: "貼上喜歡的考生詳解，或寫自己的筆記", oninput: function () { S.notes[k] = ta.value; save(); } });
    ta.value = S.notes[k] || "";
    return h("div", null, h("div", { class: "small", text: "我的筆記" }), ta);
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
        var ok = 0;
        set.items.forEach(function (it, idx) { var a = ans[idx + 1], r = a === it.q.a; record(it.e, it.n, r); if (r) ok++; });
        S.attempts.push({ set: key, ts: Date.now(), correct: ok, total: set.items.length, score: set.perScore ? ok * set.perScore : Math.round(ok / set.items.length * 100), ans: JSON.parse(JSON.stringify(ans)), items: set.items.map(function (it) { return qid(it.e, it.n); }) });
        save(); delete drafts[key]; delete frozen[key]; go("#/r/" + key);
      } }))));
  }
  function viewResult(key) {
    var set = getSet(key), a = lastAttempt(key); if (!set || !a) return go("#/");
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: set.title }),
      h("div", { class: "score" }, String(a.score), h("small", { text: " 分　答對 " + a.correct + " / " + a.total })));
    var wl = h("div", { class: "card" });
    var its = a.items ? itemsFromIds(a.items) : set.items;
    var miss = its.map(function (it, i) { return { it: it, mine: a.ans[i + 1], n: i + 1 }; }).filter(function (x) { return x.mine !== x.it.q.a; });
    wl.appendChild(h("div", { class: "h2", text: miss.length ? "要訂正的題目（" + miss.length + "）" : "全對，太好了" }));
    miss.forEach(function (x) { wl.appendChild(wrongBlock(x.it, x.mine, x.n)); });
    show(topbar(set.back, set.title), card, wl);
  }
  function wrongBlock(it, mine, no) {
    var q = it.q, opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) { opts.appendChild(optBtn(q, i, i === q.a ? "right" : i === mine ? "wrong" : "dim", null)); });
    return h("div", { class: "wq" },
      h("div", { class: "qno" }, h("span", { text: (no ? "第 " + no + " 題・" : "") + it.e.short + " #" + it.n }), h("span", { text: mine == null && no ? "未作答" : "" })),
      h("div", { class: "qtext", text: q.q }), opts,
      h("p", null, h("a", { class: "link-out", href: search(q), target: "_blank", rel: "noopener", text: "到阿摩看考生詳解 ↗" })), noteBox(it));
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
      set.items.forEach(function (it, i) {
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
    window.scrollTo(0, 0);
    switch (p[0]) {
      case "s": if (subj(p[1])) return viewSubject(p[1], p[2]); break;
      case "c": if (subj(p[1]) && (p[2] === "_none" || chapter(p[1], p[2]))) return viewChapter(p[1], p[2]); break;
      case "x": if (exam(p[1])) return viewExam(p[1]); break;
      case "p": if (getSet(p[1])) return viewPractice(p[1], parseInt(p[2], 10) || 1); break;
      case "g": if (getSet(p[1])) return viewGrade(p[1]); break;
      case "r": if (getSet(p[1])) return viewResult(p[1]); break;
      case "es": if (essay(p[1])) return viewEssay(p[1]); break;
      case "print": if (getSet(p[1])) return viewPrint(p[1], p[2]); break;
    }
    viewHome();
  }
  window.addEventListener("hashchange", route);
  load(); applyTheme(); route();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
