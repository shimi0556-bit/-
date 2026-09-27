"""Build index.html from build/index.template: inline the local @font-face rules."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
tpl = (root / 'build' / 'index.template').read_text(encoding='utf-8')
fonts = (root / 'assets' / 'fonts.css').read_text(encoding='utf-8').replace('url(./fonts/', 'url(assets/fonts/')
(root / 'index.html').write_text(tpl.replace('/*FONTS*/', fonts), encoding='utf-8')
