// 加密的書上參考回答（ks-v44 起）。data/ref/ 只有亂碼，輸入密碼才在瀏覽器解開，產生方式見 tools/ref-encrypt.js。
// 解開用的金鑰只存本機（ks_ref_key），不放進進度 S，匯出與同步都不會帶出去。
(function () {
  "use strict";
  var KS = window.KS;
  if (!KS) return;
  var LS = "ks_ref_key", BASE = "data/ref/";
  var metaP = null, key = null, man = null, urls = {}, openId = null;

  function toB64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function fromB64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function meta() {
    if (!metaP) metaP = fetch(BASE + "meta.json").then(function (r) {
      if (!r.ok) throw new Error("no meta");
      return r.json();
    }).catch(function (e) { metaP = null; throw e; });
    return metaP;
  }
  function open(k, name) {
    return fetch(BASE + name).then(function (r) {
      if (!r.ok) throw new Error("fetch " + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, k, buf.slice(12));
    });
  }
  function loadMan(k) {
    return open(k, "manifest.bin").then(function (buf) {
      man = JSON.parse(new TextDecoder().decode(buf)); key = k;
      document.dispatchEvent(new Event("ks-ref-ready"));
    });
  }
  function importAes(raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]); }
  function unlock(pw) {
    return meta().then(function (m) {
      return crypto.subtle.importKey("raw", new TextEncoder().encode(pw.normalize("NFC")), "PBKDF2", false, ["deriveBits"]).then(function (base) {
        return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(m.salt), iterations: m.iter }, base, 256);
      });
    }).then(function (raw) {
      return importAes(raw).then(loadMan).then(function () {
        try { localStorage.setItem(LS, toB64(raw)); } catch (e) {}
      });
    });
  }
  function lock() {
    try { localStorage.removeItem(LS); } catch (e) {}
    key = null; man = null; urls = {};
    document.dispatchEvent(new Event("ks-ref-ready"));
  }
  function auto() {
    var s = null;
    try { s = localStorage.getItem(LS); } catch (e) {}
    if (!s || !window.crypto || !crypto.subtle) return;
    importAes(fromB64(s)).then(loadMan).catch(function (e) {
      // 換過密碼時舊金鑰解不開，清掉重新輸入；斷線則留著
      if (e && e.name === "OperationError") { try { localStorage.removeItem(LS); } catch (x) {} }
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function pageUrl(name) {
    if (urls[name]) return Promise.resolve(urls[name]);
    return open(key, name).then(function (buf) {
      return (urls[name] = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" })));
    });
  }
  function showPages(id, body, redraw) {
    body.textContent = "";
    body.appendChild(el("div", "small", "書頁可能夾到相鄰題目。書上內容不一定正確，與骨架的「待核對」不同時請查證。"));
    var box = el("div"); body.appendChild(box);
    man[id].f.forEach(function (name) {
      var img = el("img", "es-refimg"); img.alt = "書頁"; box.appendChild(img);
      pageUrl(name).then(function (u) { img.src = u; }).catch(function () { img.replaceWith(el("div", "small", "這一頁載入失敗，請連上網路再試。")); });
    });
    var off = el("button", "btn soft", "在這台裝置上鎖");
    off.onclick = function () { lock(); redraw(); };
    body.appendChild(off);
  }
  function showForm(body, redraw) {
    body.textContent = "";
    if (!window.crypto || !crypto.subtle) { body.appendChild(el("div", "small", "這個瀏覽器不支援解密。")); return; }
    var pw = el("input", "es-refpw"); pw.type = "password"; pw.placeholder = "輸入密碼"; pw.autocomplete = "current-password";
    var go = el("button", "btn", "解鎖"), msg = el("div", "small");
    function submit() {
      if (!pw.value) return;
      go.disabled = true; msg.textContent = "解鎖中…";
      unlock(pw.value).then(redraw).catch(function (e) {
        go.disabled = false;
        msg.textContent = e && e.name === "OperationError" ? "密碼不對。" : "載入失敗，請連上網路再試。";
      });
    }
    go.onclick = submit;
    pw.onkeydown = function (ev) { if (ev.key === "Enter") submit(); };
    body.appendChild(pw); body.appendChild(go); body.appendChild(msg);
  }
  // 掛在申論題的檢討頁；這題沒有參考回答就什麼都不顯示
  function mount(id, box) {
    meta().then(function (m) {
      if (m.ids.indexOf(id) < 0) return;
      var d = el("details", "es-tips"), body = el("div");
      d.appendChild(el("summary", null, "書上的參考回答")); d.appendChild(body);
      function redraw() { if (man && man[id]) showPages(id, body, redraw); else showForm(body, redraw); }
      d.addEventListener("toggle", function () {
        openId = d.open ? id : null;
        if (d.open) redraw();
      });
      box.appendChild(d);
      if (openId === id) d.open = true;
    }).catch(function () {});
  }

  KS.ref = {
    mount: mount,
    text: function (id) { return man && man[id] ? man[id].t : ""; }
  };
  auto();
})();
