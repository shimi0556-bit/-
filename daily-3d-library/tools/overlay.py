#!/usr/bin/env python3
"""Overlay a model render on a reference photo taken from a matched camera.
  python3 tools/overlay.py PHOTO.jpg RENDER.png OUT.jpg
The render's background (dark studio) is keyed out; the model silhouette edge is drawn
in red and its interior edges in yellow on top of the photo, so every centimetre of
difference shows. Match the camera first with tools/camsolve.py."""
import sys
from PIL import Image, ImageFilter, ImageChops
photo, render, out = sys.argv[1:4]
P = Image.open(photo).convert('RGB'); R = Image.open(render).convert('RGB').resize(P.size)
# key out the studio background: dark and bluish, low saturation and value
g = R.convert('L')
bg = Image.eval(g, lambda v: 255 if v < 40 else 0)
mask = ImageChops.invert(bg).filter(ImageFilter.MedianFilter(5))
edge = mask.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(3))
inner = R.convert('L').filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 60 else 0)
inner = ImageChops.multiply(inner, mask)
O = Image.blend(P, R, 0.35)
O.paste((255, 230, 0), mask=inner)
O.paste((255, 0, 0), mask=edge)
O.save(out, quality=90)
