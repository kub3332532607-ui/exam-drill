// 把 ref-prepare.py 的輸出用密碼加密成 data/ref/，只有這個輸出可以進 repo。密碼不寫進任何檔案。
// 用法：node tools/ref-encrypt.js <來源資料夾> <輸出資料夾> [--replace]
// --replace：輸出資料夾已有加密檔時先清掉（換密碼或改內容時用）。
const crypto = require("crypto"), fs = require("fs"), path = require("path");

const ITER = 600000;

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin, chars = [];
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
    const onData = (s) => {
      for (const c of s) {
        if (c === "\u0003") process.exit(1);
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData);
          process.stdout.write("\n"); return resolve(chars.join(""));
        }
        if (c === "\u007f" || c === "\b") chars.pop(); else chars.push(c);
      }
    };
    stdin.on("data", onData);
  });
}

function seal(key, buf) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
}

async function main() {
  const [src, out, flag] = process.argv.slice(2);
  if (!src || !out) { console.log("用法：node tools/ref-encrypt.js <來源資料夾> <輸出資料夾> [--replace]"); process.exit(1); }
  const map = JSON.parse(fs.readFileSync(path.join(src, "map.json"), "utf8"));
  fs.mkdirSync(out, { recursive: true });
  const old = fs.readdirSync(out).filter((f) => f.endsWith(".bin") || f === "meta.json");
  if (old.length && flag !== "--replace") { console.log("輸出資料夾已有加密檔，要覆蓋請加 --replace"); process.exit(1); }

  let pw = process.env.REF_TEST_PASS; // 只給自動測試用
  if (!pw) {
    if (!process.stdin.isTTY) { console.log("請在終端機視窗執行，才能輸入密碼"); process.exit(1); }
    pw = await ask("設定密碼（至少 12 字，輸入時不顯示）：");
    if (pw.length < 12) { console.log("密碼太短，至少 12 字"); process.exit(1); }
    if (pw !== await ask("再輸入一次：")) { console.log("兩次不同，沒有產生任何檔案"); process.exit(1); }
  }

  old.forEach((f) => fs.unlinkSync(path.join(out, f)));
  const salt = crypto.randomBytes(16), key = crypto.pbkdf2Sync(pw.normalize("NFC"), salt, ITER, 32, "sha256");
  const man = {};
  let bytes = 0;
  for (const id of Object.keys(map)) {
    const names = map[id].f.map((f) => {
      const name = crypto.randomBytes(8).toString("hex") + ".bin", sealed = seal(key, fs.readFileSync(path.join(src, f)));
      fs.writeFileSync(path.join(out, name), sealed); bytes += sealed.length;
      return name;
    });
    man[id] = { f: names, t: map[id].t };
  }
  fs.writeFileSync(path.join(out, "manifest.bin"), seal(key, Buffer.from(JSON.stringify(man), "utf8")));
  fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify({ salt: salt.toString("base64"), iter: ITER, ids: Object.keys(man) }));
  console.log("完成：" + Object.keys(man).length + " 題，" + (bytes / 1048576).toFixed(1) + " MB");
}

main();
