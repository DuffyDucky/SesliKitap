"""
SesliKitap uygulama ikonu üreteci.
Tema: kitap (ortada) + kulaklık kemeri (üstten kavrar) — sesli kitap.
Koyu mavi gradyan zemin, beyaz kulaklık, amber kitap.

Çıktılar:
  - assets/icon.png, splash-icon.png, android-icon-{foreground,background,monochrome}.png, favicon.png
  - android/.../res/mipmap-*/ic_launcher*.webp  (adaptive + legacy + round + mono + bg)
"""
import os
import math
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
SS = 4  # supersampling

# --- renkler ---
BG_TOP = (79, 125, 240)      # parlak mavi
BG_BOT = (12, 18, 42)        # koyu lacivert
WHITE = (248, 250, 252, 255)
PAD = (203, 213, 225, 255)   # kulaklık iç ped
PAGE = (248, 250, 252, 255)
PAGE2 = (226, 232, 240, 255)
SPINE = (245, 158, 11, 255)  # amber
LINE = (148, 163, 184, 255)
MONO = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def make_gradient(W):
    """Köşegen gradyan (sol-üst -> sağ-alt)."""
    base = Image.new("RGB", (W, W))
    px = base.load()
    for y in range(W):
        for x in range(W):
            t = (x + y) / (2 * (W - 1))
            px[x, y] = lerp(BG_TOP, BG_BOT, t)
    return base.convert("RGBA")


def P(W, s, fx, fy):
    """Fraksiyon koordinatı -> piksel, merkez 0.5 etrafında s ile ölçekli."""
    return (
        (0.5 + (fx - 0.5) * s) * W,
        (0.5 + (fy - 0.5) * s) * W,
    )


def rounded_poly_book(d, W, s, mono):
    """Açık kitap: iki sayfa + amber sırt + satır çizgileri."""
    page_col = MONO if mono else PAGE
    page_col2 = MONO if mono else PAGE2
    spine_col = MONO if mono else SPINE
    line_col = MONO if mono else LINE

    # Sol sayfa (hafif yelpaze)
    left = [(0.50, 0.605), (0.345, 0.565), (0.315, 0.715), (0.50, 0.735)]
    right = [(0.50, 0.605), (0.655, 0.565), (0.685, 0.715), (0.50, 0.735)]
    d.polygon([P(W, s, x, y) for x, y in left], fill=page_col)
    d.polygon([P(W, s, x, y) for x, y in right], fill=page_col2)

    # Sırt (orta dikey amber şerit)
    sp_w = 0.018
    d.polygon(
        [
            P(W, s, 0.50 - sp_w, 0.598),
            P(W, s, 0.50 + sp_w, 0.598),
            P(W, s, 0.50 + sp_w, 0.742),
            P(W, s, 0.50 - sp_w, 0.742),
        ],
        fill=spine_col,
    )

    # Satır çizgileri
    lw = max(1, int(0.006 * W * s))
    for i, fy in enumerate((0.635, 0.665, 0.695)):
        # sol
        x0 = 0.355 + i * 0.004
        d.line([P(W, s, x0, fy + 0.004), P(W, s, 0.475, fy)], fill=line_col, width=lw)
        # sağ
        x1 = 0.645 - i * 0.004
        d.line([P(W, s, 0.525, fy), P(W, s, x1, fy + 0.004)], fill=line_col, width=lw)


def draw_headphones(d, W, s, mono):
    band_col = MONO if mono else WHITE
    pad_col = MONO if mono else PAD

    # Kemer: üst yarım arc
    lft = P(W, s, 0.255, 0.205)
    rgt = P(W, s, 0.745, 0.625)
    bbox = [lft[0], lft[1], rgt[0], rgt[1]]
    band_w = int(0.052 * W * s)
    d.arc(bbox, start=180, end=360, fill=band_col, width=band_w)
    # Arc uçlarına yuvarlak kapak
    cap_r = band_w / 2
    for fx in (0.255, 0.745):
        cx, cy = P(W, s, fx, 0.415)
        d.ellipse([cx - cap_r, cy - cap_r, cx + cap_r, cy + cap_r], fill=band_col)

    # Kulaklıklar (iki yuvarlak köşeli dikdörtgen, kitabın yanlarında)
    for fx in (0.255, 0.745):
        cw, ch = 0.085, 0.20
        x0, y0 = P(W, s, fx - cw / 2, 0.435)
        x1, y1 = P(W, s, fx + cw / 2, 0.435 + ch)
        rad = int((x1 - x0) * 0.42)
        d.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=band_col)
        # iç ped
        ix0, iy0 = P(W, s, fx - cw / 2 + 0.018, 0.435 + 0.028)
        ix1, iy1 = P(W, s, fx + cw / 2 - 0.018, 0.435 + ch - 0.028)
        irad = int((ix1 - ix0) * 0.45)
        d.rounded_rectangle([ix0, iy0, ix1, iy1], radius=irad, fill=pad_col)


def draw_logo(img, scale, mono=False):
    W = img.size[0]
    d = ImageDraw.Draw(img)
    rounded_poly_book(d, W, scale, mono)
    draw_headphones(d, W, scale, mono)


def render(out_size, *, bg=True, logo=True, scale=0.92, mono=False, round_mask=False):
    W = out_size * SS
    if bg:
        img = make_gradient(W)
    else:
        img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    if logo:
        layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        draw_logo(layer, scale, mono=mono)
        img = Image.alpha_composite(img, layer)
    if round_mask:
        mask = Image.new("L", (W, W), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, W, W], fill=255)
        img.putalpha(mask)
    return img.resize((out_size, out_size), Image.LANCZOS)


def save_png(im, path):
    im.save(path, "PNG")
    print("PNG ", os.path.relpath(path, ROOT))


def save_webp(im, path):
    im.save(path, "WEBP", lossless=True, quality=100)
    print("WEBP", os.path.relpath(path, ROOT))


def main():
    # --- Expo assets (PNG) ---
    save_png(render(1024, bg=True, scale=0.92), os.path.join(ASSETS, "icon.png"))
    # adaptive foreground: güvenli bölge için küçült + sadece logo
    save_png(render(1024, bg=False, scale=0.68), os.path.join(ASSETS, "android-icon-foreground.png"))
    save_png(render(1024, bg=True, logo=False), os.path.join(ASSETS, "android-icon-background.png"))
    save_png(render(1024, bg=False, scale=0.68, mono=True), os.path.join(ASSETS, "android-icon-monochrome.png"))
    # splash: koyu zemin app.json'da, logo ortada
    save_png(render(1024, bg=False, scale=0.85), os.path.join(ASSETS, "splash-icon.png"))
    save_png(render(96, bg=True, scale=0.92), os.path.join(ASSETS, "favicon.png"))

    # --- Android mipmap webp ---
    dens = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
            "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}
    for d, (legacy, adaptive) in dens.items():
        folder = os.path.join(RES, f"mipmap-{d}")
        # legacy kare + yuvarlak (tam tasarım)
        save_webp(render(legacy, bg=True, scale=0.92), os.path.join(folder, "ic_launcher.webp"))
        save_webp(render(legacy, bg=True, scale=0.92, round_mask=True), os.path.join(folder, "ic_launcher_round.webp"))
        # adaptive katmanlar (güvenli bölge için scale 0.68)
        save_webp(render(adaptive, bg=False, scale=0.68), os.path.join(folder, "ic_launcher_foreground.webp"))
        save_webp(render(adaptive, bg=True, logo=False), os.path.join(folder, "ic_launcher_background.webp"))
        save_webp(render(adaptive, bg=False, scale=0.68, mono=True), os.path.join(folder, "ic_launcher_monochrome.webp"))

    print("\nBitti.")


if __name__ == "__main__":
    main()
