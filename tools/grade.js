// 作文批改寫入工具（ks-v59）。批改存在 data/grades.js，用 Claude 的名字做極簡單的編碼，不是真正的加密。
// 寫入：node tools/grade.js w01 1730000000000 批改.txt
// 查看：node tools/grade.js --show w01 1730000000000
// 列出：node tools/grade.js --list
"use strict";
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "data", "grades.js"), NAME = "claude";
function code(buf) { const k = Buffer.from(NAME); return Buffer.from(buf.map((b, i) => b ^ k[i % k.length])); }
function read() {
  if (!fs.existsSync(FILE)) return { ok: 1, g: {} };
  const m = fs.readFileSync(FILE, "utf8").match(/"blob":"([^"]*)"/);
  return m && m[1] ? JSON.parse(code(Buffer.from(m[1], "base64")).toString("utf8")) : { ok: 1, g: {} };
}
function write(o) {
  const ids = {}; Object.keys(o.g).forEach((k) => { ids[k] = 1; });
  const blob = code(Buffer.from(JSON.stringify(o), "utf8")).toString("base64");
  fs.writeFileSync(FILE, "// 作文批改，由 tools/grade.js 產生，請勿手改。\nKS.grades=" + JSON.stringify({ ids: ids, blob: blob }) + ";\n");
}
const a = process.argv.slice(2), o = read();
if (a[0] === "--list") Object.keys(o.g).forEach((k) => console.log(k));
else if (a[0] === "--show") console.log((o.g[a[1] + ":" + a[2]] || {}).text || "（沒有這筆）");
else if (a[0] === "--init") { write(o); console.log("ok"); }
else if (a.length === 3) { o.g[a[0] + ":" + a[1]] = { ts: Date.now(), text: fs.readFileSync(a[2], "utf8").trim() }; write(o); console.log("已寫入 " + a[0] + ":" + a[1]); }
else { console.error("用法見檔案開頭"); process.exit(1); }
