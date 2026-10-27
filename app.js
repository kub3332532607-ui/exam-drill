(function () {
  "use strict";
  var KS = window.KS, LET = ["A", "B", "C", "D"];
  var app = document.getElementById("app");

  // ---------- 儲存 ----------
  var KEY = "ks_v1";
  // marks：課文畫線 {節id: [{id,p,q,o,note,rep,sent,ts}]}；repq：題目訂正要回報 {題id: {sent,ts}}；read：閱讀設定
  var S = { stats: {}, attempts: [], notes: {}, essay: {}, theme: "", print: {}, marks: {}, repq: {}, read: {} };
  function load() {
    try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) S = Object.assign(S, j); } catch (e) {}
    migrate();
  }
  function migrate() {
    S.attempts.forEach(function (a) { if (!a.set && a.exam) a.set = "e:" + a.exam; });
    S.essay = S.essay || {}; S.print = S.print || {}; S.marks = S.marks || {}; S.repq = S.repq || {}; S.read = S.read || {};
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
  function section(sid, cid, xid) { var c = chapter(sid, cid); return c ? c.sections.filter(function (x) { return x.id === xid; })[0] : null; }
  function essay(id) { return KS.essays.filter(function (e) { return e.id === id; })[0]; }
  function qid(e, n) { return e.id + "#" + n; }
  // 答案可為單一索引或陣列（更正答案「均給分」）
  function ok(q, i) { return Array.isArray(q.a) ? q.a.indexOf(i) >= 0 : i === q.a; }
  function ansText(q) { return (Array.isArray(q.a) ? q.a : [q.a]).map(function (i) { return LET[i]; }).join(" 或 "); }
  function qno(it) { return it.q.no || it.n; }
  function passage(it) { return it.q.g && it.e.passages ? it.e.passages[it.q.g] : null; }
  function passageBox(it, open) {
    var t = passage(it); if (!t) return null;
    var d = h("details", { class: "psg" }, h("summary", { text: "短文（第 " + it.q.g + " 題起）" }), h("div", { class: "psg-t", text: t }));
    if (open) d.open = true;
    return d;
  }
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
    var rp = pendingReports().length;
    show(topbar(),
      h("div", { class: "card" }, h("div", { class: "eyebrow", text: "一般行政" }), h("div", { class: "title", text: "今天讀哪一科？" }), h("div", { class: "muted", text: wr ? "錯題本裡還有 " + wr + " 題等你回來。" : "先複習一章，再寫那一章的考古題。" })),
      h("div", { class: "card" }, rows),
      rp ? h("a", { class: "card row rep-card", href: "#/rep" }, h("div", null, h("div", { class: "nm", text: "回報給 Claude" }), h("div", { class: "sub", text: rp + " 則訂正等著補進課文" })), h("span", { class: "pill blue", text: String(rp) })) : null,
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
        var mq = set.items.filter(function (it) { return it.q.sec === sec.id; }).length;
        var mk = (S.marks[mkey(sid, sec.id)] || []).length;
        var sub = [sec.text ? "課文" : "重點條列", mq ? "選擇題 " + mq : "", mk ? "畫線 " + mk : ""].filter(Boolean).join("・");
        rr.appendChild(h("a", { class: "row", href: "#/rd/" + sid + "/" + cid + "/" + sec.id },
          h("div", null, h("div", { class: "small", text: (idx + 1) + "-" + (i + 1) }), h("div", { class: "nm", text: sec.title }), h("div", { class: "sub", text: sub })),
          h("span", { class: "go", text: "›" })));
      });
      rv.appendChild(rr);
      nodes.push(rv);
    }
    var ct = counts(set.items), la = lastAttempt(key);
    var mc = h("div", { class: "card" }, h("div", { class: "h2", text: "本章選擇題" }),
      h("div", { class: "muted", text: set.items.length ? set.items.length + " 題・已做 " + ct.done + "・錯 " + ct.wrong + (la ? "・上次紙本答對 " + la.correct + "/" + la.total : "") : "目前考卷裡還沒有對應這章的選擇題，傳更多考卷就會補上。" }));
    if (set.items.length) mc.appendChild(h("div", { class: "btns" },
      h("a", { class: "btn", href: "#/print/" + key, text: "列印本章" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" }),
      h("a", { class: "btn soft", href: "#/p/" + key + "/1", text: "線上作答" })));
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
        h("div", { class: "btns" }, h("a", { class: "btn", href: "#/print/" + key, text: "列印試卷" }), h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" }), h("a", { class: "btn soft", href: "#/p/" + key + "/1", text: "線上作答" }))));
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
      var cls = pk == null ? "" : ok(q, i) ? "right" : i === pk ? "wrong" : "dim";
      opts.appendChild(optBtn(q, i, cls, pk == null ? function () { picked[k] = i; record(it.e, it.n, ok(q, i)); save(); viewPractice(key, n); } : null));
    });
    var card = h("div", { class: "card" },
      h("div", { class: "qno" }, h("span", { text: n + " / " + set.items.length }), h("span", { text: it.e.short + " 第 " + qno(it) + " 題" })),
      passageBox(it, true), q.q ? h("div", { class: "qtext", text: q.q }) : null, opts);
    if (pk != null) {
      card.appendChild(h("div", { style: "margin-top:14px" }, h("span", { class: "verdict " + (ok(q, pk) ? "ok" : "no"), text: ok(q, pk) ? "答對了" : "答錯，正解是 " + ansText(q) })));
      if (q.note) card.appendChild(h("div", { class: "small", style: "margin-top:6px", text: "考選部更正：" + q.note }));
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
    var cb = h("input", { type: "checkbox", onchange: function () {
      if (cb.checked) { if (!(S.notes[k] || "").trim()) { cb.checked = false; return toast("先寫訂正內容"); } S.repq[k] = { sent: false, ts: Date.now() }; toast("已加入回報清單"); }
      else delete S.repq[k];
      save();
    } });
    cb.checked = !!(S.repq[k] && !S.repq[k].sent);
    return h("div", null, h("div", { class: "small", text: "我的訂正" }), ta,
      h("label", { class: "rep-ck" }, cb, h("span", { text: "回報給 Claude，補進課文" })));
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
    var q = it.q, opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) { opts.appendChild(optBtn(q, i, ok(q, i) ? "right" : i === mine ? "wrong" : "dim", null)); });
    return h("div", { class: "wq" },
      h("div", { class: "qno" }, h("span", { text: (no ? "第 " + no + " 題・" : "") + it.e.short + " #" + qno(it) }), h("span", { text: mine == null && no ? "未作答" : "" })),
      passageBox(it, false), q.q ? h("div", { class: "qtext", text: q.q }) : null, opts, q.note ? h("div", { class: "small", text: "考選部更正：" + q.note }) : null,
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
              S.marks[MK] = (S.marks[MK] || []).filter(function (x) { return x !== mk; }); close(false);
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
    if (set.items.length) tail.appendChild(h("div", { class: "btns" },
      h("a", { class: "btn", href: "#/p/" + key + "/1", text: "線上作答" }),
      h("a", { class: "btn soft", href: "#/print/" + key, text: "列印本節" }),
      h("a", { class: "btn soft", href: "#/g/" + key, text: "對答案" })));
    if (es.length) { var el2 = h("div", { class: "sec-links" }); es.forEach(function (x) { el2.appendChild(h("a", { class: "pill", href: "#/es/" + x.id, text: "申論 " + x.src })); }); tail.appendChild(el2); }
    var nav = h("div", { class: "btns rd-nav" },
      si > 0 ? h("a", { class: "btn soft", href: "#/rd/" + sid + "/" + cid + "/" + secs[si - 1].id, text: "‹ 上一節" }) : h("a", { class: "btn soft", href: "#/c/" + sid + "/" + cid, text: "‹ 章節目錄" }),
      si < secs.length - 1 ? h("a", { class: "btn soft", href: "#/rd/" + sid + "/" + cid + "/" + secs[si + 1].id, text: "下一節 ›" }) : h("a", { class: "btn soft", href: "#/c/" + sid + "/" + cid, text: "本章考古題 ›" }));
    // 目錄（電腦版顯示在左側）：本章各節，目前這節展開小標
    var toc = h("nav", { class: "toc", "aria-label": "本章目錄" }, h("a", { class: "toc-ch", href: "#/c/" + sid + "/" + cid, text: "第 " + (ci + 1) + " 章 " + c.title }));
    secs.forEach(function (x, i) {
      toc.appendChild(h("a", { class: "toc-s", href: "#/rd/" + sid + "/" + cid + "/" + x.id, "aria-current": x === sec ? "page" : null, text: (ci + 1) + "-" + (i + 1) + " " + x.title }));
      if (x === sec) paras(sec).forEach(function (raw, j) {
        if (raw.slice(0, 3) === "## ") toc.appendChild(h("button", { class: "toc-h", text: raw.slice(3), onclick: function () { var t = document.getElementById("h" + j); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); } }));
      });
    });
    show(topbar("#/c/" + sid + "/" + cid, "第 " + (ci + 1) + " 章"), h("div", { class: "rd-wrap" }, h("aside", { class: "rd-side" }, toc), h("div", { class: "rd-main" }, head, art, mine, tail, nav)), bar);
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
  function viewReport() {
    var list = pendingReports(), txt = reportText(list);
    var card = h("div", { class: "card" }, h("div", { class: "eyebrow", text: "回報給 Claude" }),
      h("div", { class: "title", text: list.length ? list.length + " 則訂正待回報" : "目前沒有要回報的訂正" }),
      h("div", { class: "muted", text: "在題目的訂正或課文備註勾「回報給 Claude」，就會集中到這裡。複製後貼到和 Claude 的對話，Claude 會把內容補進課文。" }));
    if (!list.length) return show(topbar("#/", "首頁"), card);
    var rows = h("div", { class: "rows" }), g = null;
    list.forEach(function (x) {
      if (x.grp !== g) { g = x.grp; rows.appendChild(h("div", { class: "grp", text: g })); }
      rows.appendChild(h("div", { class: "rep-item" },
        h("div", { class: "small", text: x.type === "q" ? "題目・" + x.it.e.short + " 第 " + qno(x.it) + " 題" : "課文畫線" }),
        h("div", { class: "q", text: x.type === "q" ? clip(x.it.q.q, 80) : "「" + clip(x.m.q, 80) + "」" }),
        h("div", { class: "n", text: x.note }),
        h("button", { class: "link", text: "移出清單", onclick: function () {
          if (x.type === "q") delete S.repq[x.k]; else x.m.rep = false;
          save(); viewReport();
        } })));
    });
    var ta = h("textarea", { class: "rep-txt", readonly: true }); ta.value = txt;
    function markSent() {
      list.forEach(function (x) { if (x.type === "q") x.r.sent = true; else x.m.sent = true; });
      save(); toast("已標為送出"); viewReport();
    }
    card.appendChild(h("div", { class: "btns" },
      h("button", { class: "btn", text: "複製給 Claude", onclick: function () {
        function done() { toast("已複製，貼到對話裡"); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { ta.select(); document.execCommand("copy"); done(); });
        else { ta.select(); document.execCommand("copy"); done(); }
      } }),
      h("button", { class: "btn soft", text: "已送出，清空", onclick: markSent })));
    show(topbar("#/", "首頁"), card, h("div", { class: "card" }, rows),
      h("div", { class: "card" }, h("div", { class: "small", text: "要複製的文字（也可以長按自己選取）" }), ta));
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
    window.scrollTo(0, 0);
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
  load(); applyTheme(); route();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
