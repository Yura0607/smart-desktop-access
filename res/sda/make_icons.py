#!/usr/bin/env python3
"""Draw the Smart Desktop Access icon and write every launcher asset.

The source art supplied with the project was a blue rounded-square icon:
a white monitor with a picture inside, and a glowing arrow curving into it.
This script redraws that icon so the repo can regenerate the files.
"""

from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SIZE = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size: int) -> Image.Image:
    top = (10, 79, 219)
    bottom = (46, 200, 255)
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        color = lerp(top, bottom, y / (size - 1)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    return image


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def stroke_curve(draw: ImageDraw.ImageDraw, points, color, width: int, cap_end: bool = True) -> None:
    draw.line(points, fill=color, width=width, joint="curve")
    r = width // 2
    ends = (points[0], points[-1]) if cap_end else (points[0],)
    for x, y in ends:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def bezier(p0, p1, p2, steps=48):
    points = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        points.append((x, y))
    return points


def arrow_head(draw, tip, back, color, size):
    dx, dy = tip[0] - back[0], tip[1] - back[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    left = (tip[0] - ux * size + px * size * 0.55, tip[1] - uy * size + py * size * 0.55)
    right = (tip[0] - ux * size - px * size * 0.55, tip[1] - uy * size - py * size * 0.55)
    draw.polygon([tip, left, right], fill=color)


def draw_symbol(base: Image.Image) -> Image.Image:
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    curve = bezier((150, 760), (90, 360), (390, 250))
    stroke_curve(g, curve, (140, 235, 255, 220), 70, cap_end=False)
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    image = Image.alpha_composite(base, glow)
    draw = ImageDraw.Draw(image)

    # Three short motion ticks above the arrow.
    for start, end in (
        ((145, 300), (185, 270)),
        ((190, 255), (230, 225)),
        ((235, 215), (275, 185)),
    ):
        draw.line([start, end], fill=(255, 255, 255, 255), width=18)

    stroke_curve(draw, curve, (255, 255, 255, 255), 34, cap_end=False)
    arrow_head(draw, curve[-1], curve[-4], (255, 255, 255, 255), 70)

    # Monitor.
    draw.rounded_rectangle((430, 210, 880, 620), radius=46, outline=(255, 255, 255, 255), width=34)
    draw.polygon([(520, 530), (650, 330), (760, 530)], fill=(255, 255, 255, 255))
    draw.polygon([(680, 530), (790, 390), (840, 530)], fill=(255, 255, 255, 255))
    draw.rounded_rectangle((615, 620, 695, 700), radius=8, fill=(255, 255, 255, 255))
    draw.rounded_rectangle((500, 690, 810, 760), radius=28, fill=(255, 255, 255, 255))
    return image


def master() -> Image.Image:
    base = gradient(SIZE)
    base.putalpha(rounded_mask(SIZE, 230))
    return draw_symbol(base)


def flatten(image: Image.Image) -> Image.Image:
    """Square icon with no transparency, for iOS and macOS."""
    background = gradient(SIZE)
    return Image.alpha_composite(background, image)


def png_bytes(image: Image.Image) -> bytes:
    from io import BytesIO

    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def write_icns(path: Path, image: Image.Image) -> None:
    # PNG-in-ICNS types understood by modern macOS.
    specs = {
        "ic07": 128,
        "ic08": 256,
        "ic09": 512,
        "ic10": 1024,
        "ic11": 32,
        "ic12": 64,
        "ic13": 256,
        "ic14": 512,
    }
    chunks = []
    for kind, side in specs.items():
        blob = png_bytes(image.resize((side, side), Image.Resampling.LANCZOS))
        chunks.append(kind.encode("ascii") + struct.pack(">I", len(blob) + 8) + blob)
    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def write_ico(path: Path, image: Image.Image) -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    image.save(path, format="ICO", sizes=[(side, side) for side in sizes])


def save_png(path: Path, image: Image.Image, side: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.resize((side, side), Image.Resampling.LANCZOS).save(path, format="PNG")


def main() -> None:
    icon = master()
    square = flatten(icon)
    out = ROOT / "res" / "sda" / "logo.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    icon.save(out)
    save_png(ROOT / "res" / "icon.png", icon, 256)
    save_png(ROOT / "res" / "mac-icon.png", square, 1024)
    for name, side in (("32x32.png", 32), ("64x64.png", 64), ("128x128.png", 128), ("128x128@2x.png", 256)):
        save_png(ROOT / "res" / name, icon, side)
    write_ico(ROOT / "res" / "icon.ico", icon)
    write_ico(ROOT / "res" / "tray-icon.ico", icon)
    write_ico(ROOT / "flutter" / "windows" / "runner" / "resources" / "app_icon.ico", icon)
    write_icns(ROOT / "flutter" / "macos" / "Runner" / "AppIcon.icns", square)

    save_png(ROOT / "flutter" / "assets" / "logo.png", icon, 256)
    save_png(ROOT / "flutter" / "assets" / "icon.png", icon, 256)
    save_png(ROOT / "server" / "companion" / "web" / "favicon.png", icon, 64)

    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    android = ROOT / "flutter" / "android" / "app" / "src" / "main" / "res"
    for density, side in densities.items():
        folder = android / f"mipmap-{density}"
        for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
            save_png(folder / name, icon, side)
        # Status-bar icon: white glyph on transparency.
        glyph = icon.resize((side, side), Image.Resampling.LANCZOS).convert("RGBA")
        pixels = glyph.load()
        for y in range(side):
            for x in range(side):
                r, g, b, a = pixels[x, y]
                if r > 210 and g > 210 and b > 210:
                    pixels[x, y] = (255, 255, 255, a)
                else:
                    pixels[x, y] = (0, 0, 0, 0)
        glyph.save(folder / "ic_stat_logo.png")

    ios = ROOT / "flutter" / "ios" / "Runner" / "Assets.xcassets" / "AppIcon.appiconset"
    mapping = {
        "Icon-App-20x20@1x.png": 20,
        "Icon-App-20x20@2x.png": 40,
        "Icon-App-20x20@3x.png": 60,
        "Icon-App-29x29@1x.png": 29,
        "Icon-App-29x29@2x.png": 58,
        "Icon-App-29x29@3x.png": 87,
        "Icon-App-40x40@1x.png": 40,
        "Icon-App-40x40@2x.png": 80,
        "Icon-App-40x40@3x.png": 120,
        "Icon-App-60x60@2x.png": 120,
        "Icon-App-60x60@3x.png": 180,
        "Icon-App-76x76@1x.png": 76,
        "Icon-App-76x76@2x.png": 152,
        "Icon-App-83.5x83.5@2x.png": 167,
        "Icon-App-1024x1024@1x.png": 1024,
    }
    for name, side in mapping.items():
        save_png(ios / name, square, side)

    # Tray template: the bright parts of the icon.
    tray = icon.resize((44, 44), Image.Resampling.LANCZOS)
    for name in ("mac-tray-dark-x2.png", "mac-tray-light-x2.png"):
        tray.save(ROOT / "res" / name)

    print(f"wrote {out}")


if __name__ == "__main__":
    main()
