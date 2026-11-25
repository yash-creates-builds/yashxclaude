"""Builds every icon from design/iron-cutout.png (the koyla istri) on the sky-blue background.
Run: python3 scripts/make-icons.py   (needs Pillow: pip install pillow)
Then: npx capacitor-assets generate --android --ios --iconBackgroundColor '#7BCEF4' --splashBackgroundColor '#7BCEF4'
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = (123, 206, 244, 255)  # #7BCEF4, sampled from the artwork
iron = Image.open(ROOT / 'design' / 'iron-cutout.png').convert('RGBA')

def compose(size, width_ratio, bg=BG, nudge_y=0.0):
    canvas = Image.new('RGBA', (size, size), bg)
    w = round(size * width_ratio)
    h = round(iron.height * w / iron.width)
    art = iron.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(art, ((size - w) // 2, round((size - h) / 2 + size * nudge_y)))
    return canvas

def save(img, path, rgb=True):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    (img.convert('RGB') if rgb else img).save(path, optimize=True)

full = lambda s: compose(s, 0.72, nudge_y=0.01)
# Capacitor asset sources
save(full(1024), 'assets/icon-only.png')
save(Image.new('RGBA', (1024, 1024), BG), 'assets/icon-background.png')
save(compose(1024, 0.56, bg=(0, 0, 0, 0)), 'assets/icon-foreground.png', rgb=False)  # fits Android's safe circle
save(compose(2732, 0.30), 'assets/splash.png')
save(compose(2732, 0.30), 'assets/splash-dark.png')
# Website + store
save(full(512), 'public/icon-512.png')
save(full(192), 'public/icon-192.png')
save(full(180), 'public/apple-touch-icon.png')
save(full(64), 'public/favicon.png')
save(compose(512, 0.62, bg=BG), 'public/icon-maskable-512.png')
save(full(512), 'store/icon-512.png')
print('icons ready')
