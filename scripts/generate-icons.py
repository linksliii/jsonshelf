#!/usr/bin/env python3
"""Generate JSONShelf app icons + menu-bar template icon from the source artwork.

Run: python3 scripts/generate-icons.py
Outputs: src-tauri/icons/*, assets/tray-template.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "logo-source.png")
ICONS = os.path.join(ROOT, "src-tauri", "icons")
os.makedirs(ICONS, exist_ok=True)

BG_TOP = (36, 44, 86)
BG_BOTTOM = (10, 12, 22)
GLOW = (86, 116, 226)


def load_cutout() -> Image.Image:
    """Return the character with the flat dark backdrop removed (RGBA)."""
    im = Image.open(SRC).convert("RGBA")
    arr = np.asarray(im).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr[..., :3].max(axis=2)
    mn = arr[..., :3].min(axis=2)
    # backdrop = dark + desaturated; everything else is artwork
    bg_like = ((mx <= 76) & ((mx - mn) <= 18)).astype(np.uint8)
    canvas = np.where(bg_like == 1, 0, 255).astype(np.uint8)
    fill = Image.fromarray(canvas, mode="L").copy()
    # flood fill only the connected backdrop from the border, so black eyes/outlines survive
    ImageDraw.floodfill(fill, (0, 0), 128, thresh=0)
    ImageDraw.floodfill(fill, (fill.width - 1, 0), 128, thresh=0)
    ImageDraw.floodfill(fill, (0, fill.height - 1), 128, thresh=0)
    # anything still 0 is backdrop-ish but enclosed (eyes etc.) -> keep
    filled = np.asarray(fill)
    bg_mask = (filled == 128)
    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    # soften the cut edge a touch
    a = Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(1.1))
    a = a.point(lambda v: 0 if v < 20 else (255 if v > 200 else int(v * 1.25)))
    out = im.copy()
    out.putalpha(a)
    return out


def squircle_mask(size: int, art_ratio: float = 0.82, radius_ratio: float = 0.223) -> Image.Image:
    """Rounded-rect (Apple icon grid) mask, supersampled for clean edges."""
    art = int(size * art_ratio)
    pad = (size - art) // 2
    ss = 4
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    r = int(art * radius_ratio) * ss
    d.rounded_rectangle(
        [pad * ss, pad * ss, (pad + art) * ss, (pad + art) * ss],
        radius=r, fill=255,
    )
    return m.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4))


def gradient(size: int, top, bottom) -> Image.Image:
    col = Image.new("RGB", (1, size))
    px = col.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return col.resize((size, size), Image.BILINEAR)


def build_icon(size: int = 1024) -> Image.Image:
    char = load_cutout()
    art = int(size * 0.82)
    pad = (size - art) // 2
    radius = int(art * 0.223)

    # diagonal base gradient
    base = Image.new("RGB", (size, size))
    px = base.load()
    for y in range(size):
        ty = y / (size - 1)
        for x in range(0, size):  # noqa: PERF
            tx = x / (size - 1)
            t = min(1.0, max(0.0, ty * 0.82 + tx * 0.18))
            px[x, y] = (
                int(18 * (1 - t) + 5 * t),
                int(23 * (1 - t) + 7 * t),
                int(48 * (1 - t) + 13 * t),
            )
    plate = base.convert("RGBA")

    # halo behind the head
    glow = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy = size * 0.52, size * 0.33
    for i in range(30, 0, -1):
        rr = size * 0.045 * i
        gd.ellipse([cx - rr, cy - rr * 0.92, cx + rr, cy + rr * 0.92], fill=int(3.4 * (31 - i)))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.045))
    tint = Image.new("RGBA", (size, size), (110, 142, 255, 255))
    plate = Image.alpha_composite(plate, Image.merge("RGBA", (*tint.split()[:3], glow)))

    # character, anchored to the bottom of the plate
    cw = int(art * 1.035)
    ch = int(char.height * cw / char.width)
    portrait = char.resize((cw, ch), Image.LANCZOS)
    px0 = pad + (art - cw) // 2
    py0 = pad + art - ch + int(art * 0.015)
    plate.alpha_composite(portrait, (max(pad, px0), max(pad, py0)))

    # soft diagonal sheen
    sheen = Image.new("L", (size, size), 0)
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(0, 0), (size * 0.72, 0), (0, size * 0.78)], fill=26)
    sheen = sheen.filter(ImageFilter.GaussianBlur(size * 0.06))
    plate = Image.alpha_composite(plate, Image.merge("RGBA", (Image.new("L", (size, size), 255),) * 3 + (sheen,)))

    # rim: inner light stroke + outer dark edge
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle([pad + 1, pad + 1, pad + art - 1, pad + art - 1], radius=radius - 1,
                         outline=(255, 255, 255, 54), width=max(2, size // 300))
    plate = Image.alpha_composite(plate, rim)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(plate, (0, 0), squircle_mask(size))
    return canvas


def save_icon(img: Image.Image, path: str, size: int | None = None) -> None:
    """体积优先:量化到 256 色 + 优化压缩(透明通道用调色板 tRNS 保留)。"""
    im = img.resize((size, size), Image.LANCZOS) if size else img
    im = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    im.save(path, optimize=True)


def build_portrait(size: int) -> Image.Image:
    """从原图提取"竖眼小人"剪影:头发/眼睛不透明,脸/皮肤/白衣透明。"""
    im = Image.open(SRC).convert("RGBA")
    arr = np.asarray(im).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr[..., :3].max(axis=2)
    mn = arr[..., :3].min(axis=2)

    bg_like = ((mx <= 76) & ((mx - mn) <= 18)).astype(np.uint8)
    canvas = np.where(bg_like == 1, 0, 255).astype(np.uint8)
    fill = Image.fromarray(canvas, mode="L").copy()
    for xy in ((0, 0), (1023, 0), (0, 1023), (1023, 1023)):
        ImageDraw.floodfill(fill, xy, 128, thresh=0)
    bg = np.asarray(fill) == 128

    hair = (b > r + 22) & (b > 55) & ~bg
    dark = (mx < 80) & ~bg
    skin = (r > 205) & (g > 175) & (b > 150) & ~hair & ~bg
    white = (r > 215) & (g > 215) & (b > 215) & ~hair
    blush = (r > 225) & (g > 130) & (g < 215) & (b > 130) & (b < 215) & ~hair

    alpha = np.where(hair | dark, 255, np.where(skin | white | blush | bg, 0, 255)).astype(np.uint8)
    alpha = Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.7))

    ys, xs = np.nonzero(hair)
    x0 = max(0, int(xs.min()) - 24)
    y0 = max(0, int(ys.min()) - 16)
    x1 = min(im.width, int(xs.max()) + 24)
    y1 = 700
    head = alpha.crop((x0, y0, x1, y1))
    side = max(head.size)
    sq = Image.new("L", (side, side), 0)
    sq.paste(head, ((side - head.width) // 2, 0))

    small = sq.resize((size, size), Image.LANCZOS)
    a = np.asarray(small)
    crisp = np.where(a > 120, 255, 0).astype(np.uint8)
    out = np.zeros((size, size, 4), np.uint8)
    out[..., 3] = crisp
    return Image.fromarray(out, "RGBA")


def save_icon(img: Image.Image, path: str, size: int | None = None) -> None:
    """体积优先:量化到 256 色 + 优化压缩(透明通道用调色板 tRNS 保留)。"""
    im = img.resize((size, size), Image.LANCZOS) if size else img
    im = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    im.save(path, optimize=True)


def main():
    icon = build_icon(1024)
    save_icon(icon, os.path.join(ICONS, "icon.png"))
    # README 用的产品 logo(264px,调色板压缩)
    logo = icon.resize((264, 264), Image.LANCZOS).quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    logo.save(os.path.join(ROOT, "assets", "logo.png"), optimize=True)

    # macOS .iconset
    iconset = os.path.join(ROOT, "build", "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for scale, suffix in ((1, ""), (2, "@2x")):
            px = base * scale
            save_icon(icon, os.path.join(iconset, f"icon_{base}x{base}{suffix}.png"), px)
    subprocess_icns = os.path.join(ICONS, "icon.icns")
    os.system(f'iconutil -c icns "{iconset}" -o "{subprocess_icns}"')

    # 32x32 是 tauri-codegen 嵌入的默认窗口图标,必须是 RGBA(不能是调色板 PNG)。
    icon.resize((32, 32), Image.LANCZOS).save(os.path.join(ICONS, "32x32.png"), optimize=True)
    save_icon(icon, os.path.join(ICONS, "128x128.png"), 128)
    save_icon(icon, os.path.join(ICONS, "128x128@2x.png"), 256)
    icon.resize((256, 256), Image.LANCZOS).save(os.path.join(ICONS, "icon.ico"),
                                               sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    for name, px in {
        "Square30x30Logo.png": 30, "Square44x44Logo.png": 44, "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89, "Square107x107Logo.png": 107, "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150, "Square284x284Logo.png": 284, "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }.items():
        save_icon(icon, os.path.join(ICONS, name), px)

    # 菜单栏模板图标(原图剪影)
    tray = build_portrait(36)
    tray.save(os.path.join(ROOT, "assets", "tray-template.png"))
    with open(os.path.join(ROOT, "assets", "tray-template.rgba"), "wb") as f:
        f.write(tray.tobytes())
    build_portrait(144).save(os.path.join(ROOT, "assets", "tray-preview.png"))
    print("done")


if __name__ == "__main__":
    main()