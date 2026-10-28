# 考卷匯入工具（Claude 用）

1. `考卷清點.py <zip資料夾> <exam-drill>`：讀考選部「考畢題答」zip 的 html，列出法學／憲法／英文相關考卷，標「已收／新」，並列出每年還沒見到的類科。
2. 解壓 PDF → `pdftotext -layout` → `parse.py <txt資料夾> <代碼...> > parsed.json`（選項符號 U+E18C–E18F，答案表依題號對位，MOD＝更正答案）。
3. `post.py parsed.json <txt資料夾> clean.json`：英文空格補 _____、短文段落、題組 g、答案轉 0–3。
4. `suggest.py`：用既有已分類題目（existing.json，由 data/*.js 以 vm 載入匯出）做 bigram 最近鄰，建議「科目:節」，產生 review.txt 給 Claude 逐題審閱；人工更正寫在 fix.txt（`代碼 題號 科目:節`，`x`＝不收）。
5. `build.py`：合併成 built.json，再依科目附加到 data/*.js（一行一份考卷，id＝`代碼-科目-科目名`，part＝選錄 N 題）。
路徑目前寫死在 /tmp/claude-0，使用前請調整。
