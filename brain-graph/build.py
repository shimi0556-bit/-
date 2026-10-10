#!/usr/bin/env python3
"""Inline src/*.js and src/style.css into the single-file index.html."""
import pathlib

root = pathlib.Path(__file__).parent
src = root / 'src'
order = ['regions', 'store', 'layout', 'ai', 'ingest', 'view', 'exportx', 'mapat', 'app']
js = '\n'.join((src / f'{n}.js').read_text(encoding='utf-8') for n in order)
assert '</script' not in js.lower(), 'inline JS must not contain </script'
html = (src / 'index.template.html').read_text(encoding='utf-8')
html = html.replace('/*CSS*/', (src / 'style.css').read_text(encoding='utf-8')).replace('/*JS*/', js)
(root / 'index.html').write_text(html, encoding='utf-8')
print(f'index.html: {len(html):,} bytes')
