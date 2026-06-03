"""
PDF -> gömülü kitap (.ts) dönüştürücü.

Bir PDF'in metnini çıkarır, TTS için temizler (tireleme birleştirme, satır
kırılması açma, sayfa numarası/filigran/çöp satır temizliği) ve
src/books/<slug>.ts dosyası üretir (BundledBook default export).

Kullanım:
    python scripts/pdf_to_book.py <slug>

Türkçe karakterli yollar Windows konsolunda sorun çıkardığı için PDF'i
klasör + anahtar kelime ile bulur.
"""
import fitz  # PyMuPDF
import re
import json
import sys
import glob
import os

PDF_FOLDER = r"C:\Users\Victus\OneDrive\Masaüstü\Library\Okunmamış Kitaplar"
BOOKS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "books")

# Tek başına atılacak satır kalıpları.
JUNK_LINE = [
    re.compile(r"^\s*OceanofPDF\.com\s*$", re.I),  # filigran
    re.compile(r"^\s*\d{1,4}\s*$"),                # tek başına sayfa numarası
    re.compile(r"^[\W_]+$"),                       # yalnızca noktalama/süs
]


def find_pdf(keyword):
    matches = [p for p in glob.glob(os.path.join(PDF_FOLDER, "*.pdf"))
               if keyword.lower() in os.path.basename(p).lower()]
    if not matches:
        raise FileNotFoundError("PDF bulunamadi: " + keyword)
    return matches[0]


def extract(pdf_path, start_page, end_page):
    doc = fitz.open(pdf_path)
    end = end_page if end_page is not None else doc.page_count - 1
    parts = [doc[i].get_text() for i in range(start_page, end + 1)]
    doc.close()
    return "\n".join(parts)


def clean(text):
    text = text.replace("\r\n", "\n")

    # 1) Cop satirlari at.
    kept = []
    for ln in text.split("\n"):
        s = ln.strip()
        if any(p.match(s) for p in JUNK_LINE):
            continue
        # Kisa + harf orani dusuk sus/cop satiri (or. "B-B-B II").
        if s and len(s) < 40:
            letters = sum(c.isalpha() for c in s)
            if letters / len(s) < 0.5:
                continue
        kept.append(ln)
    text = "\n".join(kept)

    # 2) Satir SONU tirelemesi: "kelime-\nparca" -> "kelimeparca".
    text = re.sub(r"([a-zcgiosuçğıöşü])[-‐­]\n[ \t]*([a-zcgiosuçğıöşü])", r"\1\2", text)
    # 3) Satir ICI yumusak tireleme (OCR): kucuk-kucuk -> birlestir.
    text = re.sub(r"([a-zçğıöşü])[-‐­]([a-zçğıöşü])", r"\1\2", text)

    # 4) Paragraflari koru, tek satir kirilmasini bosluga cevir.
    SEP = "␟"  # paragraf sinir sentineli (metinde gecmez)
    text = re.sub(r"\n{2,}", SEP, text)
    text = re.sub(r"[ \t]*\n[ \t]*", " ", text)
    text = text.replace(SEP, "\n\n")

    # 5) Bosluk normalizasyonu.
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def write_ts(slug, book_id, title, author, aliases, text):
    path = os.path.join(BOOKS_DIR, slug + ".ts")
    body = (
        "import { BundledBook } from './types';\n\n"
        "const book: BundledBook = {\n"
        "  id: " + json.dumps(book_id, ensure_ascii=False) + ",\n"
        "  title: " + json.dumps(title, ensure_ascii=False) + ",\n"
        "  author: " + json.dumps(author, ensure_ascii=False) + ",\n"
        "  aliases: " + json.dumps(aliases, ensure_ascii=False) + ",\n"
        "  text: " + json.dumps(text, ensure_ascii=False) + ",\n"
        "};\n\n"
        "export default book;\n"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return path


# slug -> { keyword, id, title, author, aliases, start_page, end_page }
BOOKS_CONFIG = {
    "atomik-aliskanliklar": {
        "keyword": "Atomik",
        "id": "james-clear-atomik-aliskanliklar",
        "title": "Atomik Alışkanlıklar",
        "author": "James Clear",
        "aliases": ["atomik alışkanlıklar", "atomik aliskanliklar",
                    "atomik", "james clear", "atomic habits"],
        "start_page": 8,
        "end_page": 223,  # 224+ teşekkürler/Notlar kaynakçası (TTS için gereksiz)
        # Sayfa 8'in başında içindekiler kalıntısı var; Giriş'in gerçek açılışından başla.
        "start_marker": "Giriş",
    },
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in BOOKS_CONFIG:
        print("Kullanim: python scripts/pdf_to_book.py <slug>")
        print("Mevcut slug'lar:", ", ".join(BOOKS_CONFIG))
        sys.exit(1)
    slug = sys.argv[1]
    cfg = BOOKS_CONFIG[slug]
    pdf = find_pdf(cfg["keyword"])
    raw = extract(pdf, cfg["start_page"], cfg["end_page"])
    # Sayfa sinirlari kaba; gercek icerigin basi/sonu icin metin ici isaret kullan.
    sm = cfg.get("start_marker")
    if sm:
        i = raw.find(sm)
        if i > 0:
            raw = raw[i:]
    em = cfg.get("end_marker")
    if em:
        i = raw.rfind(em)
        if i > 0:
            raw = raw[:i]
    text = clean(raw)
    path = write_ts(slug, cfg["id"], cfg["title"], cfg["author"],
                    cfg["aliases"], text)
    print("OK:", os.path.basename(path))
    print("  kaynak:", os.path.basename(pdf))
    print("  metin uzunlugu:", format(len(text), ","), "karakter")
    print("  paragraf:", text.count("\n\n") + 1)
    print("  --- ilk 300 ---")
    print(" ", repr(text[:300]))
    print("  --- son 300 ---")
    print(" ", repr(text[-300:]))


if __name__ == "__main__":
    main()
