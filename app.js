(function () {
  "use strict";
  var SUBJECTS = window.SUBJECTS, EXAMS = window.EXAMS;
  var LET = ["A", "B", "C", "D"];
  var app = document.getElementById("app");

  // ---------- 儲存（localStorage，可匯出匯入） ----------
  var KEY = "ks_v1";
  var S = { stats: {}, attempts: [], notes: {}, theme: "" };
  function load() { try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) S = Object.assign(S, j); } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function applyTheme() { if (S.theme) document.documentElement.setAttribute("data-theme", S.theme); else document.documentElement.removeAttribute("data-theme"); }

  // ---------- 小工具 ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return el;
  }
  function go(hash) { location.hash = hash; }
  function toast(t) { var el = h("div", { class: "toast", text: t }); document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1800); }
  function examById(id) { return EXAMS.filter(function (e) { return e.id === id; })[0]; }
  function subj(id) { return SUBJECTS.filter(function (s) { return s.id === id; })[0]; }
  function qid(e, n) { return e.id + "#" + n; }
  function record(e, n, ok) {
    var k = qid(e, n), s = S.stats[k] || { w: 0, c: 0 };
    if (ok) s.c++; else s.w++;
    s.last = ok ? "c" : "w"; s.ts = Date.now(); S.stats[k] = s;
  }
  function examStats(e) {
    var done = 0, wrong = 0;
    e.questions.forEach(function (q, i) { var s = S.stats[qid(e, i + 1)]; if (s) { done++; if (s.last === "w") wrong++; } });
    return { done: done, wrong: wrong, total: e.questions.length };
  }
  function lastAttempt(e) { for (var i = S.attempts.length - 1; i >= 0; i--) if (S.attempts[i].exam === e.id && S.attempts[i].mode === "sheet") return S.attempts[i]; return null; }
  function wrongList() {
    var out = [];
    EXAMS.forEach(function (e) { e.questions.forEach(function (q, i) { var s = S.stats[qid(e, i + 1)]; if (s && s.last === "w") out.push({ e: e, n: i + 1, q: q }); }); });
    return out;
  }
  function searchUrl(q) { return "https://www.google.com/search?q=" + encodeURIComponent("阿摩 " + q.q.slice(0, 40)); }

  function topbar(back, backText) {
    return h("div", { class: "bar" },
      back ? h("a", { href: back, text: "‹ " + (backText || "返回") }) : h("span", { class: "brand", text: "國考刷題本" }),
      h("button", { class: "link", text: S.theme === "dark" ? "日間" : S.theme === "light" ? "跟隨系統" : "夜間", onclick: function () {
        S.theme = S.theme === "dark" ? "light" : S.theme === "light" ? "" : "dark"; save(); applyTheme(); route();
      } }));
  }
  function sheetHead(title, right) {
    return h("div", null, h("div", { class: "meta-line" }, h("span", { text: "一般行政" }), h("span", { text: right || "" })), h("h1", { text: title }), h("hr", { class: "dbl" }));
  }

  // ---------- 首頁 ----------
  function viewHome() {
    var wr = wrongList().length;
    var list = h("div", { class: "list" });
    SUBJECTS.forEach(function (s) {
      var ex = EXAMS.filter(function (e) { return e.subject === s.id; });
      if (s.link) {
        list.appendChild(h("a", { class: "row", href: s.link, target: "_blank", rel: "noopener" }, h("div", null, h("div", { class: "nm", text: s.name }), h("div", { class: "sub", text: "獨立的單字程式" })), h("span", { class: "badge blue", text: s.linkText || "開啟" })));
      } else if (ex.length) {
        var tot = 0, dn = 0; ex.forEach(function (e) { var st = examStats(e); tot += st.total; dn += st.done; });
        list.appendChild(h("a", { class: "row", href: "#/s/" + s.id }, h("div", null, h("div", { class: "nm", text: s.name }), h("div", { class: "sub", text: ex.length + " 份考卷　已做 " + dn + " / " + tot + " 題" })), h("span", { class: "badge", text: "進入" })));
      } else {
        list.appendChild(h("div", { class: "row off" }, h("div", null, h("div", { class: "nm", text: s.name }), h("div", { class: "sub", text: "尚未放入考卷" })), h("span", { class: "badge", text: "—" })));
      }
    });
    var wrongRow = h("a", { class: "row", href: "#/wrong" }, h("div", null, h("div", { class: "nm", text: "錯題本" }), h("div", { class: "sub", text: "最近一次答錯的題目，答對就會移出" })), h("span", { class: "badge red", text: wr + " 題" }));
    var backup = h("div", { class: "btns" },
      h("button", { class: "btn ghost", text: "匯出進度", onclick: exportData }),
      h("label", { class: "btn ghost", for: "imp", text: "匯入進度" }),
      h("input", { id: "imp", type: "file", accept: "application/json", hidden: true, onchange: importData }));
    app.replaceChildren(topbar(), h("div", { class: "sheet" }, sheetHead("科目", "今天也刷幾題"), list), h("div", { class: "sheet" }, wrongRow),
      h("div", { class: "sheet" }, h("h2", { text: "備份" }), h("div", { class: "small", text: "進度只存在這個瀏覽器。換手機或清除資料前，先匯出，再到新裝置匯入。" }), backup));
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(S)], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "刷題本進度_" + new Date().toISOString().slice(0, 10) + ".json" });
    document.body.appendChild(a); a.click(); a.remove(); toast("已匯出");
  }
  function importData(ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { try { var j = JSON.parse(r.result); if (!j.stats) throw 0; S = Object.assign(S, j); save(); applyTheme(); toast("已匯入"); route(); } catch (e) { toast("檔案格式不對"); } };
    r.readAsText(f);
  }

  // ---------- 科目、考卷 ----------
  function viewSubject(id) {
    var s = subj(id), ex = EXAMS.filter(function (e) { return e.subject === id; });
    var list = h("div", { class: "list" });
    ex.forEach(function (e) {
      var st = examStats(e), la = lastAttempt(e);
      list.appendChild(h("a", { class: "row", href: "#/e/" + e.id }, h("div", null, h("div", { class: "nm", text: e.short + " " + e.name }), h("div", { class: "sub", text: e.questions.length + " 題　" + (la ? "上次對答案 " + la.score + " 分" : "還沒對過答案") })),
        st.wrong ? h("span", { class: "badge red", text: "錯 " + st.wrong }) : h("span", { class: "badge", text: st.done + "/" + st.total })));
    });
    app.replaceChildren(topbar("#/", "科目"), h("div", { class: "sheet" }, sheetHead(s.name, ex.length + " 份考卷"), list));
  }
  function viewExam(id) {
    var e = examById(id), st = examStats(e), la = lastAttempt(e);
    var sheet = h("div", { class: "sheet" }, sheetHead(e.short + " " + e.name, "代號 " + e.code),
      h("div", { class: "small", text: e.title + "　" + e.cat + "　共 " + e.questions.length + " 題，每題 " + e.perScore + " 分" }),
      la ? h("div", { style: "margin-top:14px" }, h("span", { class: "stamp " + (la.score >= 60 ? "ok" : ""), text: "上次 " + la.score + " 分" })) : null,
      h("div", { class: "btns" },
        h("a", { class: "btn", href: "#/g/" + e.id, text: "紙本寫完，對答案" }),
        h("a", { class: "btn ghost", href: "#/p/" + e.id + "/1", text: "直接在螢幕上練習" }),
        h("a", { class: "btn ghost", href: "#/print/" + e.id, text: "列印試卷" })));
    var nodes = [topbar("#/s/" + e.subject, subj(e.subject).name), sheet];
    if (st.wrong) nodes.push(h("div", { class: "sheet" }, h("a", { class: "row", href: "#/wrong/" + e.id }, h("div", null, h("div", { class: "nm", text: "這份的錯題" }), h("div", { class: "sub", text: "重做、看詳解連結、寫筆記" })), h("span", { class: "badge red", text: st.wrong + " 題" }))));
    app.replaceChildren.apply(app, nodes);
  }

  // ---------- 螢幕練習（逐題） ----------
  var practice = { picked: null };
  function optRow(q, i, cls, onclick) {
    return h("button", { class: "opt " + (cls || ""), onclick: onclick, disabled: !onclick && undefined },
      h("span", { class: "L", text: LET[i] }), h("span", { class: "t", text: q.o[i] }));
  }
  function viewPractice(id, n, listMode) {
    var e = examById(id), q = e.questions[n - 1];
    if (!q) return go("#/e/" + id);
    var picked = practice.picked && practice.picked.k === qid(e, n) ? practice.picked.i : null;
    var opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) {
      var cls = "";
      if (picked != null) { if (i === q.a) cls = "right"; else if (i === picked) cls = "wrong"; else cls = "dim"; }
      opts.appendChild(optRow(q, i, cls, picked != null ? null : function () {
        practice.picked = { k: qid(e, n), i: i }; record(e, n, i === q.a); save(); viewPractice(id, n, listMode);
      }));
    });
    var sheet = h("div", { class: "sheet" },
      h("div", { class: "qno" }, h("span", { text: "第 " + n + " 題 / " + e.questions.length }), h("span", { class: "small", text: q.tag })),
      h("div", { class: "qtext", text: q.q }), opts);
    if (picked != null) {
      sheet.appendChild(h("hr", { class: "sgl" }));
      sheet.appendChild(h("div", null, picked === q.a ? h("span", { class: "stamp ok", text: "答對" }) : h("span", { class: "stamp", text: "答錯，正解 " + LET[q.a] })));
      sheet.appendChild(h("p", null, h("a", { class: "link-out", href: searchUrl(q), target: "_blank", rel: "noopener", text: "到阿摩找考生寫的詳解 ↗" })));
      sheet.appendChild(noteBox(e, n));
    }
    var nav = h("div", { class: "btns" },
      h("button", { class: "btn ghost", text: "上一題", disabled: n <= 1, onclick: function () { practice.picked = null; go("#/p/" + id + "/" + (n - 1)); } }),
      h("button", { class: "btn", text: n >= e.questions.length ? "完成" : "下一題", onclick: function () { practice.picked = null; go(n >= e.questions.length ? "#/e/" + id : "#/p/" + id + "/" + (n + 1)); } }));
    sheet.appendChild(nav);
    app.replaceChildren(topbar("#/e/" + id, e.short), sheet);
  }
  function noteBox(e, n) {
    var k = qid(e, n);
    var ta = h("textarea", { id: "note_" + n, placeholder: "貼上你覺得好懂的考生詳解，或自己的筆記", oninput: function () { S.notes[k] = ta.value; save(); } });
    ta.value = S.notes[k] || "";
    return h("div", null, h("div", { class: "small", text: "我的筆記" }), ta);
  }

  // ---------- 對答案（紙本作答後輸入） ----------
  var sheetAns = {};
  function viewGrade(id) {
    var e = examById(id);
    if (!sheetAns[id]) sheetAns[id] = {};
    var ans = sheetAns[id];
    var prog = h("div", { class: "progress" }, h("span", { id: "pcount" }), h("span", { class: "small", text: "沒寫的題目留空即可" }));
    function upd() { var c = Object.keys(ans).length; document.getElementById("pcount").textContent = "已輸入 " + c + " / " + e.questions.length; }
    var grid = h("div", { class: "grid" });
    e.questions.forEach(function (q, idx) {
      var n = idx + 1, row = h("div", { class: "arow" }, h("span", { class: "n", text: String(n) }));
      var btns = [];
      LET.forEach(function (L, i) {
        var b = h("button", { class: "bub", "aria-pressed": String(ans[n] === i), "aria-label": "第" + n + "題 " + L, text: L, onclick: function () {
          if (ans[n] === i) delete ans[n]; else ans[n] = i;
          btns.forEach(function (x, j) { x.setAttribute("aria-pressed", String(ans[n] === j)); }); upd();
        } });
        btns.push(b); row.appendChild(b);
      });
      grid.appendChild(row);
    });
    var submit = h("button", { class: "btn", text: "對答案", onclick: function () {
      var score = 0, tot = e.questions.length, wrongs = [];
      e.questions.forEach(function (q, idx) {
        var n = idx + 1;
        if (ans[n] == null) { record(e, n, false); wrongs.push(n); return; }
        var ok = ans[n] === q.a; record(e, n, ok); if (ok) score++; else wrongs.push(n);
      });
      var a = { exam: e.id, mode: "sheet", ts: Date.now(), correct: score, total: tot, score: score * e.perScore, ans: JSON.parse(JSON.stringify(ans)) };
      S.attempts.push(a); save(); delete sheetAns[id]; go("#/r/" + id);
    } });
    app.replaceChildren(topbar("#/e/" + id, e.short), h("div", { class: "sheet" }, sheetHead("輸入你在紙上劃的答案", e.short), prog, grid, h("div", { class: "btns" }, submit)));
    upd();
  }
  function viewResult(id) {
    var e = examById(id), a = lastAttempt(e);
    if (!a) return go("#/e/" + id);
    var wrongs = [];
    e.questions.forEach(function (q, idx) { if (a.ans[idx + 1] !== q.a) wrongs.push(idx + 1); });
    var head = h("div", { class: "sheet" }, sheetHead(e.short + " 成績", new Date(a.ts).toLocaleDateString("zh-TW")),
      h("div", { class: "score" }, String(a.score), h("small", { text: " 分　答對 " + a.correct + " / " + a.total + " 題" })));
    var nodes = [topbar("#/e/" + id, e.short), head];
    var wrap = h("div", { class: "sheet" }, h("h2", { text: wrongs.length ? "錯題與未作答（" + wrongs.length + "）" : "全對" }));
    wrongs.forEach(function (n) { wrap.appendChild(wrongBlock(e, n, a.ans[n])); });
    nodes.push(wrap);
    app.replaceChildren.apply(app, nodes);
  }
  function wrongBlock(e, n, mine) {
    var q = e.questions[n - 1], opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) { opts.appendChild(optRow(q, i, i === q.a ? "right" : i === mine ? "wrong" : "dim", null)); });
    opts.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    return h("div", { class: "wq" },
      h("div", { class: "qno" }, h("span", { text: e.short + " 第 " + n + " 題" }), h("span", { class: "small", text: q.tag + (mine == null ? "　未作答" : "") })),
      h("div", { class: "qtext", text: q.q }), opts,
      h("p", null, h("a", { class: "link-out", href: searchUrl(q), target: "_blank", rel: "noopener", text: "到阿摩找考生寫的詳解 ↗" })), noteBox(e, n));
  }

  // ---------- 錯題本 ----------
  var retry = null;
  function viewWrong(examId) {
    var list = wrongList().filter(function (x) { return !examId || x.e.id === examId; });
    var nodes = [topbar(examId ? "#/e/" + examId : "#/", examId ? examById(examId).short : "科目")];
    var sheet = h("div", { class: "sheet" }, sheetHead("錯題本", list.length + " 題"));
    if (!list.length) sheet.appendChild(h("div", { class: "empty", text: "目前沒有錯題。" }));
    else {
      sheet.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: "全部重做", onclick: function () { retry = { items: list.slice(), i: 0 }; go("#/retry"); } })));
      list.forEach(function (x) { sheet.appendChild(wrongBlock(x.e, x.n, undefined)); });
    }
    nodes.push(sheet); app.replaceChildren.apply(app, nodes);
  }
  function viewRetry() {
    if (!retry || !retry.items.length) return go("#/wrong");
    var it = retry.items[retry.i], e = it.e, q = it.q, n = it.n;
    if (!retry.picked) retry.picked = null;
    var opts = h("div", { class: "opts" });
    q.o.forEach(function (_, i) {
      var cls = ""; if (retry.picked != null) cls = i === q.a ? "right" : i === retry.picked ? "wrong" : "dim";
      opts.appendChild(optRow(q, i, cls, retry.picked != null ? null : function () { retry.picked = i; record(e, n, i === q.a); save(); viewRetry(); }));
    });
    var sheet = h("div", { class: "sheet" }, h("div", { class: "qno" }, h("span", { text: "重做 " + (retry.i + 1) + " / " + retry.items.length }), h("span", { class: "small", text: e.short + " 第 " + n + " 題" })),
      h("div", { class: "qtext", text: q.q }), opts);
    if (retry.picked != null) {
      sheet.appendChild(h("p", null, retry.picked === q.a ? h("span", { class: "stamp ok", text: "答對，移出錯題本" }) : h("span", { class: "stamp", text: "還是錯，正解 " + LET[q.a] })));
      sheet.appendChild(h("p", null, h("a", { class: "link-out", href: searchUrl(q), target: "_blank", rel: "noopener", text: "到阿摩找考生寫的詳解 ↗" })));
      sheet.appendChild(h("div", { class: "btns" }, h("button", { class: "btn", text: retry.i + 1 >= retry.items.length ? "完成" : "下一題", onclick: function () {
        if (retry.i + 1 >= retry.items.length) { retry = null; go("#/wrong"); } else { retry.i++; retry.picked = null; viewRetry(); }
      } })));
    }
    app.replaceChildren(topbar("#/wrong", "錯題本"), sheet);
  }

  // ---------- 列印 ----------
  var pr = { scope: "all", card: true, cols: 2 };
  function viewPrint(id) {
    var e = examById(id);
    var items = e.questions.map(function (q, i) { return { q: q, n: i + 1 }; }).filter(function (x) { var s = S.stats[qid(e, x.n)]; return pr.scope === "all" || (s && s.last === "w"); });
    function chip(label, on, fn) { return h("button", { class: "chip", "aria-pressed": String(on), text: label, onclick: fn }); }
    var ctl = h("div", { class: "sheet" }, sheetHead("列印設定", e.short),
      h("div", { class: "small", text: "範圍" }), h("div", { class: "chips" }, chip("全部題目", pr.scope === "all", function () { pr.scope = "all"; viewPrint(id); }), chip("只印錯題", pr.scope === "wrong", function () { pr.scope = "wrong"; viewPrint(id); })),
      h("div", { class: "small", text: "選項排列" }), h("div", { class: "chips" }, chip("兩欄", pr.cols === 2, function () { pr.cols = 2; viewPrint(id); }), chip("單欄", pr.cols === 1, function () { pr.cols = 1; viewPrint(id); })),
      h("div", { class: "small", text: "最後一頁" }), h("div", { class: "chips" }, chip("附空白答案卡", pr.card, function () { pr.card = !pr.card; viewPrint(id); })),
      h("div", { class: "small", text: "共 " + items.length + " 題。印出來沒有答案。印完回「紙本寫完，對答案」輸入。" }),
      h("div", { class: "btns" }, h("button", { class: "btn", text: "列印（A4）", disabled: !items.length, onclick: function () { window.print(); } })));
    var pp = h("div", { class: "paper-print" },
      h("div", { class: "pp-head" }, h("span", { text: "代號：" + e.code }), h("span", { text: "座號：＿＿＿＿" })),
      h("div", { class: "pp-title", text: e.title }),
      h("div", { class: "pp-sub" }, h("span", { text: "類科：" + e.cat }), h("span", { text: "科目：" + e.name }), h("span", { text: "每題 " + e.perScore + " 分" })));
    items.forEach(function (x, k) {
      var o = h("div", { class: "pp-o" + (pr.cols === 1 ? " one" : "") });
      x.q.o.forEach(function (t, i) { o.appendChild(h("div", null, h("span", { text: "(" + LET[i] + ")" }), h("span", { text: t }))); });
      pp.appendChild(h("div", { class: "pp-q" }, h("div", { class: "qt" }, h("b", { text: (pr.scope === "all" ? x.n : k + 1) + "." }), h("span", { text: x.q.q })), o));
    });
    if (pr.card && items.length) {
      var card = h("div", { class: "pp-card" }, h("h3", { text: "答案卡（" + e.short + "）" }));
      var g = h("div", { class: "pp-cg" });
      items.forEach(function (x, k) {
        var d = h("div", null, h("span", { text: String(pr.scope === "all" ? x.n : k + 1) }));
        LET.forEach(function (L) { d.appendChild(h("i", { text: L })); });
        g.appendChild(d);
      });
      card.appendChild(g); pp.appendChild(card);
    }
    app.replaceChildren(topbar("#/e/" + id, e.short), ctl, pp);
  }

  // ---------- 路由 ----------
  function route() {
    var p = (location.hash || "#/").replace(/^#\/?/, "").split("/");
    window.scrollTo(0, 0);
    var r = p[0];
    if (!r) return viewHome();
    if (r === "s" && subj(p[1])) return viewSubject(p[1]);
    if (r === "e" && examById(p[1])) return viewExam(p[1]);
    if (r === "p" && examById(p[1])) return viewPractice(p[1], parseInt(p[2], 10) || 1);
    if (r === "g" && examById(p[1])) return viewGrade(p[1]);
    if (r === "r" && examById(p[1])) return viewResult(p[1]);
    if (r === "wrong") return viewWrong(p[1] && examById(p[1]) ? p[1] : null);
    if (r === "retry") return viewRetry();
    if (r === "print" && examById(p[1])) return viewPrint(p[1]);
    viewHome();
  }
  window.addEventListener("hashchange", route);
  load(); applyTheme(); route();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
