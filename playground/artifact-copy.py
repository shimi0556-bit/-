"""Write the claude.ai Artifact copy of the hub: index.html minus the document wrapper.

The Artifact publisher adds its own <!doctype>/<html>/<head>/<body>, so the
published page must start at <title>. Usage: python3 playground/artifact-copy.py OUT.html
"""
import sys
from pathlib import Path

WRAPPER = {
    '<!doctype html>', '<html lang="he" dir="rtl">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '</head>', '<body>', '</body>', '</html>',
}
src = Path(__file__).resolve().parent.parent / 'index.html'
lines = [l for l in src.read_text(encoding='utf-8').split('\n') if l.strip() not in WRAPPER]
out = '\n'.join(lines).strip() + '\n'
assert out.startswith('<title>')
Path(sys.argv[1]).write_text(out, encoding='utf-8')
