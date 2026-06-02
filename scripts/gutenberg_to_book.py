"""
Gutenberg kitabı -> Gemini ile Türkçeye çevrilmiş gömülü kitap (.ts).

İngilizce düz metni indirir, boilerplate kırpar, blocks.ts ile AYNI kuralla
(~22000 karakter, paragraf sınırı) bloklara böler, her bloğu Gemini 3.1 Flash
Lite ile (geminiTranslate.ts ile AYNI prompt) çevirir ve src/books/<slug>.ts
üretir. İstekler arası 4.5 sn delay (429 yememek için).

Kullanim:
    set EXPO_PUBLIC_GEMINI_API_KEY=...   (Windows; veya export)
    python scripts/gutenberg_to_book.py <gutenberg_id> <slug> "<Baslik>" "<Yazar>"
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse

BOOKS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "books")
API_KEY = os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY", "")
MODEL = os.environ.get("EXPO_PUBLIC_GEMINI_MODEL", "gemini-flash-lite-latest")

# geminiTranslate.ts TRANSLATE_PROMPT ile BİREBİR AYNI.
TRANSLATE_PROMPT = (
    "Bu İngilizce metni edebî, akıcı Türkçeye çevir. Paragraf yapısını "
    "(boş satırları) koru. Sadece çeviriyi yaz; açıklama, başlık veya not ekleme."
)


def fetch_gutenberg(book_id):
    urls = [
        f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt",
        f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt",
    ]
    for u in urls:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            continue
    raise RuntimeError("Gutenberg metni indirilemedi: " + str(book_id))


def strip_boilerplate(text):
    text = text.replace("\r\n", "\n")
    start = re.search(r"\*\*\*\s*START OF TH(E|IS) PROJECT GUTENBERG.*?\*\*\*", text, re.I)
    if start:
        text = text[start.end():]
    end = re.search(r"\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG", text, re.I)
    if end:
        text = text[:end.start()]
    return text.strip()


def split_into_blocks(text, target_chars=22000):
    """blocks.ts splitIntoBlocks ile aynı mantık."""
    if not text:
        return []
    cut_points = [m.end() for m in re.finditer(r"\n{2,}", text)]
    cut_points.append(len(text))
    blocks = []
    start = 0
    safe_cut = 0
    for cp in cut_points:
        if cp - start > target_chars and safe_cut > start:
            blocks.append(text[start:safe_cut])
            start = safe_cut
        safe_cut = cp
    if start < len(text):
        blocks.append(text[start:])
    return blocks


def translate(block):
    if not API_KEY:
        raise RuntimeError("EXPO_PUBLIC_GEMINI_API_KEY ayarlı değil")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}"
        f":generateContent?key={API_KEY}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": TRANSLATE_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": block}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 8192},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read().decode("utf-8"))
    return resp["candidates"][0]["content"]["parts"][0]["text"].strip()


def write_ts(slug, book_id, title, author, text):
    path = os.path.join(BOOKS_DIR, slug + ".ts")
    aliases = [title.lower()]
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


def main():
    if len(sys.argv) < 5:
        print('Kullanim: python scripts/gutenberg_to_book.py <gutenberg_id> <slug> "<Baslik>" "<Yazar>"')
        sys.exit(1)
    gid, slug, title, author = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    book_id = "bundled-" + slug

    raw = strip_boilerplate(fetch_gutenberg(gid))
    blocks = split_into_blocks(raw)
    print(f"{len(blocks)} blok çevriliyor (~{len(raw):,} karakter)...")

    translated = []
    for i, b in enumerate(blocks):
        translated.append(translate(b))
        print(f"  blok {i + 1}/{len(blocks)} bitti")
        if i < len(blocks) - 1:
            time.sleep(4.5)  # RPM koruması

    path = write_ts(slug, book_id, title, author, "".join(translated))
    print("OK:", os.path.basename(path))


if __name__ == "__main__":
    main()
