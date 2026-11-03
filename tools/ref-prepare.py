# 把書的截圖切成單頁 JPG，加上 OCR 文字（只供搜尋），輸出到本機資料夾給 ref-encrypt.js 加密。
# 輸出含書頁內容，只能放各科 _索引，不可放進 repo。
# 用法：python -I tools/ref-prepare.py <截圖資料夾> <OCR 資料夾> <輸出資料夾>
import json, os, re, sys, glob
import pymupdf

# 賴小節第五章：申論 id → 依序的 (截圖時間, 左右頁)。一頁可能夾到相鄰題目。
POL = {
    "p66": ["041242R", "041245L"],
    "p67": ["041245L", "041245R", "041249L"],
    "p68": ["041249L", "041249R"],
    "p69": ["041249R", "041253L"],
    "p48": ["041255R", "041256L", "041256R"],
    "p49": ["041256R", "041300L", "041300R"],
    "p62": ["041325R", "041328L"],
    "p63": ["041328L", "041328R", "041331L"],
    "p64": ["041331R", "041335L", "041335R"],
    "p65": ["041335R", "041338L", "041338R"],
    "p50": ["041342L", "041342R", "041345L"],
    "p51": ["041345L", "041345R", "041348L"],
    "p70": ["041412L", "041412R"],
    "p71": ["041412R", "041415L"],
    "p72": ["041415L", "041415R", "041418L"],
    "p73": ["041418L", "041418R", "041421L"],
    "p52": ["041421R", "041425L", "041425R"],
    "p53": ["041425R", "041428L"],
}


def find_shots(book):
    shots = {}
    for f in glob.glob(os.path.join(book, "**", "*.png"), recursive=True):
        m = re.search(r"(\d{6})\.png$", f)
        if m and m.group(1) not in shots:
            shots[m.group(1)] = f
    return shots


def read_ocr(folder):
    pages = {}
    for f in glob.glob(os.path.join(folder, "*.txt")):
        shot = side = None
        for line in open(f, encoding="utf-8-sig"):
            m = re.match(r"=== p\d+ \| .*?(\d{6})\.png", line)
            if m:
                shot, side = m.group(1), None
                continue
            m = re.match(r"--- ([LR]) ---", line)
            if m:
                side = m.group(1)
                pages.setdefault(shot + side, [])
                continue
            if shot and side and line.strip():
                pages[shot + side].append(line.strip())
    return pages


def trim(page, clip, s):
    # 切掉書頁留白與閱讀器邊框：以深色字的範圍為準，手機上字才不會太小
    g = page.get_pixmap(matrix=pymupdf.Matrix(s, s), clip=clip, colorspace=pymupdf.csGRAY)
    w, h, d, st = g.width, g.height, g.samples, g.stride
    xs, ys = [], []
    for y in range(0, h, 2):
        row = d[y * st:y * st + w]
        for x in range(0, w, 2):
            if row[x] < 110:
                xs.append(x)
                ys.append(y)
    if not xs:
        return clip
    pad = 14
    return pymupdf.Rect(clip.x0 + max(0, min(xs) - pad) / s, clip.y0 + max(0, min(ys) - pad) / s,
                        clip.x0 + min(w, max(xs) + pad) / s, clip.y0 + min(h, max(ys) + pad) / s)


def crop(path, side, out):
    doc = pymupdf.open(path)
    page = doc[0]
    r = page.rect
    mid = r.width / 2
    clip = pymupdf.Rect(0, 0, mid, r.height) if side == "L" else pymupdf.Rect(mid, 0, r.width, r.height)
    # 依原圖像素輸出，不放大也不縮小
    s = pymupdf.Pixmap(path).width / r.width
    clip = trim(page, clip, s)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(s, s), clip=clip)
    with open(out, "wb") as fh:
        fh.write(pix.tobytes("jpeg", jpg_quality=75))
    doc.close()


def main():
    book, ocr, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    shots, text = find_shots(book), read_ocr(ocr)
    mp = {}
    for eid, pages in POL.items():
        files, parts = [], []
        for i, code in enumerate(pages, 1):
            shot, side = code[:6], code[6]
            name = f"{eid}-{i}.jpg"
            crop(shots[shot], side, os.path.join(out, name))
            files.append(name)
            parts.extend(text.get(code, []))
            if code not in text:
                print("沒有 OCR：", eid, code)
        mp[eid] = {"f": files, "t": " ".join(parts)}
    with open(os.path.join(out, "map.json"), "w", encoding="utf8") as fh:
        json.dump(mp, fh, ensure_ascii=False)
    print("題數", len(mp), "頁數", sum(len(v["f"]) for v in mp.values()))


main()
