// Gist 同步：合併規則（merge）與 GitHub Gist 讀寫。不碰畫面。
// 權杖與 Gist id 存在 localStorage "ks_sync_v1"，不放進進度 S，匯出進度時不會帶出去。
(function (root) {
  "use strict";
  var FN = "ks_progress.json", DESC = "國考刷題本進度（自動同步，請勿手動修改）";
  var FIELDS = ["stats", "attempts", "notes", "nts", "essay", "marks", "repq", "del", "qm", "qx", "pos", "plan", "vw"];
  // 裝置自己的設定（theme、print、read）不同步：手機與電腦的字級、版面本來就不一樣。

  function num(x) { return +x || 0; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function pick(o) { var r = {}; FIELDS.forEach(function (k) { r[k] = o[k] === undefined ? (k === "attempts" ? [] : {}) : o[k]; }); return r; }

  // 合併兩份進度。兩邊都改過同一筆時，取修改時間較新的；畫線與回報取聯集。
  function merge(L, R) {
    L = pick(clone(L)); R = pick(clone(R));
    var out = clone(L), k;

    // 答題統計：每題取最後作答時間較新的一份
    Object.keys(R.stats).forEach(function (q) {
      var a = L.stats[q], b = R.stats[q];
      if (!a || num(b.ts) > num(a.ts)) out.stats[q] = b;
    });

    // 對答案紀錄：以「題組＋時間」去重，依時間排序
    var seen = {}, att = [];
    L.attempts.concat(R.attempts).forEach(function (a) {
      var id = a.set + "|" + a.ts; if (seen[id]) return; seen[id] = 1; att.push(a);
    });
    att.sort(function (a, b) { return num(a.ts) - num(b.ts); });
    out.attempts = att;

    // 題目訂正：依 nts 取較新的；沒有 nts 的舊資料視為 0
    Object.keys(R.notes).forEach(function (q) {
      if (!(q in L.notes) || num(R.nts[q]) > num(L.nts[q])) { out.notes[q] = R.notes[q]; if (R.nts[q]) out.nts[q] = R.nts[q]; }
    });

    // 申論：取 ts 較新的
    Object.keys(R.essay).forEach(function (q) {
      var a = L.essay[q], b = R.essay[q];
      if (!a || num(b.ts) > num(a.ts)) out.essay[q] = b;
    });

    // 已刪除畫線的墓碑：聯集（取較新時間）
    out.del = clone(L.del);
    Object.keys(R.del).forEach(function (id) { out.del[id] = Math.max(num(out.del[id]), num(R.del[id])); });

    // 課文畫線（marks）與題目劃記（qm）：以 id 聯集，已刪的不復活；同一條兩邊都有時取較新（mt 或 ts）
    function unionMarks(A, B) {
      var keys = {}, res = {}; Object.keys(A).concat(Object.keys(B)).forEach(function (x) { keys[x] = 1; });
      Object.keys(keys).forEach(function (mkey) {
        var byId = {}, order = [];
        (A[mkey] || []).concat(B[mkey] || []).forEach(function (m) {
          if (out.del[m.id]) return;
          var cur = byId[m.id];
          if (!cur) { byId[m.id] = m; order.push(m.id); }
          else if (num(m.mt || m.ts) > num(cur.mt || cur.ts)) byId[m.id] = m;
        });
        if (order.length) res[mkey] = order.map(function (id) { return byId[id]; });
      });
      return res;
    }
    out.marks = unionMarks(L.marks, R.marks);
    out.qm = unionMarks(L.qm, R.qm);

    // 讀到哪（pos）：每個鍵（rd:科目:節、pr:題組、last）取 ts 較新的
    Object.keys(R.pos).forEach(function (q) {
      var a = L.pos[q], b = R.pos[q];
      if (!a || num(b.ts) > num(a.ts)) out.pos[q] = b;
    });

    // 刪去法：每題取 ts 較新的
    Object.keys(R.qx).forEach(function (q) {
      var a = L.qx[q], b = R.qx[q];
      if (!a || num(b.ts) > num(a.ts)) out.qx[q] = b;
    });

    // 每日任務：每天每個任務取聯集（任一邊打勾就算完成；_t 為最後修改，較新的一邊決定取消勾選）
    Object.keys(R.plan).forEach(function (day) {
      var a = L.plan[day], b = R.plan[day];
      if (!a) { out.plan[day] = b; return; }
      var w = num(b._t) > num(a._t) ? b : a, o = out.plan[day] = Object.assign({}, a, b);
      Object.keys(o).forEach(function (t) { if (t.charAt(0) !== "_" && !w[t]) delete o[t]; });
      o._t = Math.max(num(a._t), num(b._t));
    });

    // 生字（vw）：每個字取 ts 較新的（移出清單記為 del，不會被舊資料復活）
    Object.keys(R.vw).forEach(function (w) {
      var a = L.vw[w], b = R.vw[w];
      if (!a || num(b.ts) > num(a.ts)) out.vw[w] = b;
    });

    // 回報清單：聯集；任一邊已回報（sent）就算已回報
    Object.keys(R.repq).forEach(function (q) {
      var a = L.repq[q], b = R.repq[q];
      if (!a) out.repq[q] = b;
      else { var w = num(b.ts) > num(a.ts) ? b : a; out.repq[q] = Object.assign({}, w, { sent: !!(a.sent || b.sent) }); }
    });
    return out;
  }

  // ---------- 設定（權杖、gist id） ----------
  var CK = "ks_sync_v1";
  function cfg() { try { return JSON.parse(localStorage.getItem(CK)) || {}; } catch (e) { return {}; } }
  function setCfg(c) { try { localStorage.setItem(CK, JSON.stringify(c)); } catch (e) {} }

  // ---------- GitHub API ----------
  function gh(token, path, method, body) {
    return fetch("https://api.github.com" + path, {
      method: method || "GET",
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
      return r.json();
    });
  }
  function readFile(f) {
    if (!f) return Promise.resolve(null);
    if (f.truncated && f.raw_url) return fetch(f.raw_url).then(function (r) { return r.text(); }).then(JSON.parse);
    return Promise.resolve(JSON.parse(f.content));
  }
  // 取得遠端進度：回傳 {gid, data|null}
  function pull(token, gid) {
    function fromGist(id) {
      return gh(token, "/gists/" + id).then(function (g) { return readFile(g.files && g.files[FN]).then(function (d) { return { gid: id, data: d }; }); });
    }
    if (gid) {
      return fromGist(gid).catch(function (e) { if (e.status === 404) return find(); throw e; });
    }
    return find();
    function find() {
      return gh(token, "/gists?per_page=100").then(function (list) {
        var g = list.filter(function (x) { return x.files && x.files[FN]; })[0];
        return g ? fromGist(g.id) : { gid: null, data: null };
      });
    }
  }
  function push(token, gid, data) {
    var files = {}; files[FN] = { content: JSON.stringify({ v: 1, ts: Date.now(), data: data }) };
    return gid ? gh(token, "/gists/" + gid, "PATCH", { files: files }).then(function () { return gid; })
      : gh(token, "/gists", "POST", { description: DESC, public: false, files: files }).then(function (g) { return g.id; });
  }

  // 同步：下載 → 合併 → 回傳合併結果；是否需要上傳由 changed 決定
  // apply(merged) 由呼叫端把結果寫回本機並存檔
  function sync(local, apply) {
    var c = cfg(); if (!c.token) return Promise.reject(Object.assign(new Error("no token"), { status: 0 }));
    return pull(c.token, c.gid).then(function (r) {
      var remote = r.data;
      if (remote && remote.v > 1) { var e = new Error("version"); e.status = -1; throw e; }
      var rdata = remote ? remote.data : null;
      var merged = rdata ? merge(local, rdata) : pick(clone(local));
      apply(merged);
      var same = rdata && JSON.stringify(pick(merged)) === JSON.stringify(pick(rdata));
      if (same && r.gid) { c.gid = r.gid; c.last = Date.now(); setCfg(c); return { up: false, down: !!rdata }; }
      return push(c.token, r.gid, pick(merged)).then(function (gid) { c.gid = gid; c.last = Date.now(); setCfg(c); return { up: true, down: !!rdata }; });
    });
  }

  root.KSSync = { merge: merge, cfg: cfg, setCfg: setCfg, sync: sync, FIELDS: FIELDS };
  if (typeof module !== "undefined") module.exports = root.KSSync;
})(typeof window !== "undefined" ? window : globalThis);
