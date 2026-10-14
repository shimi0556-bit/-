#!/usr/bin/env python3
"""Generates the flat-vector cartoon art used by the deck -> assets/art/*.svg

Everything is code (no raster), so the art stays crisp at any size and stays
editable. Run:  python3 tools/art.py
"""
import math
import pathlib
import random

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "art"

INK = "#0B1A33"
NAVY = "#0A1630"
NAVY2 = "#12244A"
NAVY3 = "#1B3A6B"
CYAN = "#22D3EE"
CYAN_D = "#0E7490"
ORANGE = "#FF8A3D"
ORANGE_D = "#E8590C"
YELLOW = "#FFC93C"
WHITE = "#F4F7FB"
GRAY = "#B8C6D9"
GRAY_D = "#5B6B84"
GREEN = "#3DDC97"
GREEN_D = "#1FA56B"
RED = "#FF5D73"
WOOD = "#D9A066"
WOOD_D = "#B67A3F"
SKIN = "#F2B988"
PANTS = "#27408B"


# ---------------------------------------------------------------- primitives
def n(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def _stroke(stroke, sw):
    if not stroke:
        return ""
    return f'stroke="{stroke}" stroke-width="{n(sw)}" stroke-linejoin="round" stroke-linecap="round"'


def rect(x, y, w, h, fill, rx=0, stroke=INK, sw=4, extra=""):
    return (f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}" rx="{n(rx)}" '
            f'fill="{fill}" {_stroke(stroke, sw)} {extra}/>')


def circ(cx, cy, r, fill, stroke=INK, sw=4, extra=""):
    return (f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}" fill="{fill}" '
            f'{_stroke(stroke, sw)} {extra}/>')


def ell(cx, cy, rx, ry, fill, stroke=None, sw=4, extra=""):
    return (f'<ellipse cx="{n(cx)}" cy="{n(cy)}" rx="{n(rx)}" ry="{n(ry)}" fill="{fill}" '
            f'{_stroke(stroke, sw)} {extra}/>')


def line(x1, y1, x2, y2, stroke, sw, extra=""):
    return (f'<line x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}" stroke="{stroke}" '
            f'stroke-width="{n(sw)}" stroke-linecap="round" {extra}/>')


def path(d, fill="none", stroke=INK, sw=4, extra=""):
    return f'<path d="{d}" fill="{fill}" {_stroke(stroke, sw)} {extra}/>'


def poly(pts, fill, stroke=INK, sw=4, extra=""):
    p = " ".join(f"{n(x)},{n(y)}" for x, y in pts)
    return f'<polygon points="{p}" fill="{fill}" {_stroke(stroke, sw)} {extra}/>'


def grp(body, tf="", extra=""):
    t = f'transform="{tf}"' if tf else ""
    return f"<g {t} {extra}>{body}</g>"


def svg(w, h, body, defs="", extra=""):
    d = f"<defs>{defs}</defs>" if defs else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" '
            f'height="{h}" {extra}>{d}{body}</svg>')


def lin(idn, stops, x1=0, y1=0, x2=0, y2=1):
    s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{idn}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def rad(idn, stops):
    s = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return f'<radialGradient id="{idn}">{s}</radialGradient>'


def sparkle(x, y, r, fill=WHITE, op=0.9):
    d = (f"M{n(x)} {n(y - r)} Q{n(x)} {n(y)} {n(x + r)} {n(y)} Q{n(x)} {n(y)} {n(x)} {n(y + r)} "
         f"Q{n(x)} {n(y)} {n(x - r)} {n(y)} Q{n(x)} {n(y)} {n(x)} {n(y - r)}Z")
    return f'<path d="{d}" fill="{fill}" opacity="{op}"/>'


def cloud(x, y, s, fill=WHITE, stroke=None, extra=""):
    b = (circ(0, 0, 34, fill, stroke, 4) + circ(38, -18, 42, fill, stroke, 4) +
         circ(84, -4, 34, fill, stroke, 4) + rect(-8, 0, 126, 34, fill, 17, stroke, 4) +
         circ(0, 0, 34, fill, None) + circ(38, -18, 42, fill, None) + circ(84, -4, 34, fill, None) +
         rect(-8, 0, 126, 34, fill, 17, None))
    return grp(b, f"translate({n(x)} {n(y)}) scale({n(s)})", extra)


# ---------------------------------------------------------------- characters
def limb(pts, w, fill=WHITE, joint=GRAY_D, jr=0.6):
    d = "M" + " L".join(f"{n(x)} {n(y)}" for x, y in pts)
    s = path(d, "none", INK, w + 9) + path(d, "none", fill, w)
    for x, y in pts[1:-1]:
        s += circ(x, y, w * jr, joint, INK, 4)
    return s


def claw(x, y, ang, opening=1.0):
    fingers = ""
    for sx in (-1, 1):
        fx = sx * (8 + 5 * opening)
        fingers += line(sx * 8, 8, fx, 36, INK, 13) + line(sx * 8, 8, fx, 36, GRAY, 7)
    palm = rect(-14, -11, 28, 24, GRAY_D, 7)
    return grp(fingers + palm, f"translate({n(x)} {n(y)}) rotate({n(ang)})")


def _dir_angle(p0, p1):
    return math.degrees(math.atan2(-(p1[0] - p0[0]), p1[1] - p0[1]))


def robot(x, y, s=1.0, armL=((-108, -272), (-104, -192)), armR=((108, -272), (104, -192)),
          legL=((-40, -112), (-40, -20)), legR=((40, -112), (40, -20)),
          openL=1.0, openR=1.0, back="", front="", tilt=0, visor=CYAN):
    """Friendly white humanoid. Local origin = between the feet on the ground."""
    sL, sR = (-84, -350), (84, -350)
    b = back
    # legs + shoes
    for hip, (knee, ank) in (((-36, -205), legL), ((36, -205), legR)):
        b += limb([hip, knee, ank], 36, WHITE, GRAY_D, 0.62)
        b += rect(ank[0] - 30, ank[1] - 4, 64, 28, NAVY3, 13)
        b += rect(ank[0] + 14, ank[1] + 4, 20, 14, ORANGE, 7, None)
    # hips + torso + backpack bumps
    b += rect(-62, -236, 124, 54, GRAY, 22)
    b += rect(-76, -396, 152, 178, WHITE, 38)
    b += rect(-46, -362, 92, 74, NAVY2, 24)
    b += circ(0, -325, 21, CYAN, INK, 4)
    b += circ(0, -325, 33, "none", CYAN, 4, 'opacity="0.55"')
    b += rect(-76, -254, 152, 22, ORANGE, 9)
    b += circ(-58, -312, 5, ORANGE, None) + circ(58, -312, 5, ORANGE, None)
    # head
    h = line(0, -392, 0, -404, INK, 22) + line(0, -392, 0, -404, GRAY, 12)
    h += circ(-58, -440, 14, ORANGE, INK, 4) + circ(58, -440, 14, ORANGE, INK, 4)
    h += rect(-54, -482, 108, 84, WHITE, 32)
    h += rect(-41, -470, 82, 58, NAVY, 24, INK, 3)
    h += circ(-18, -441, 14, visor, None, 0, 'opacity="0.35"') + circ(18, -441, 14, visor, None, 0, 'opacity="0.35"')
    h += circ(-18, -441, 8, visor, None) + circ(18, -441, 8, visor, None)
    h += circ(-15, -444, 2.6, WHITE, None) + circ(21, -444, 2.6, WHITE, None)
    h += path("M-9 -424 Q0 -417 9 -424", "none", visor, 3.5)
    h += line(0, -482, 0, -506, INK, 4) + circ(0, -511, 8, ORANGE, INK, 4)
    b += grp(h, f"rotate({n(tilt)} 0 -400)")
    # arms
    b += limb([sL, *armL], 30, WHITE, GRAY_D, 0.62)
    b += limb([sR, *armR], 30, WHITE, GRAY_D, 0.62)
    b += circ(*sL, 21, GRAY_D, INK, 4) + circ(*sR, 21, GRAY_D, INK, 4)
    b += claw(*armL[1], _dir_angle(armL[0], armL[1]), openL)
    b += claw(*armR[1], _dir_angle(armR[0], armR[1]), openR)
    b += front
    return grp(b, f"translate({n(x)} {n(y)}) scale({n(s)})")


def plank(x, y, length, ang, thick=24):
    b = rect(-length / 2, -thick / 2, length, thick, WOOD, 5)
    for i, o in enumerate((-0.3, 0.05, 0.33)):
        b += line(-length / 2 + 14 + i * 20, o * thick, length / 2 - 18 - i * 30, o * thick, WOOD_D, 3, 'opacity="0.7"')
    return grp(b, f"translate({n(x)} {n(y)}) rotate({n(ang)})")


def toolbag(x, y, s=1.0, rot=0):
    b = path("M-30 -42 Q0 -78 30 -42", "none", INK, 11) + path("M-30 -42 Q0 -78 30 -42", "none", GRAY, 5)
    b += path("M-44 -34 L44 -34 L52 26 Q52 36 42 36 L-42 36 Q-52 36 -52 26 Z", ORANGE, INK, 4)
    b += rect(-44, -34, 88, 18, ORANGE_D, 6)
    b += rect(-30, 2, 60, 22, YELLOW, 6, INK, 3)
    b += circ(0, -24, 4.5, YELLOW, INK, 2)
    b += grp(rect(-4, -62, 8, 30, GRAY, 3, INK, 3) + rect(-12, -70, 24, 12, GRAY_D, 4, INK, 3), "translate(30 -12) rotate(18)")
    return grp(b, f"translate({n(x)} {n(y)}) scale({n(s)}) rotate({n(rot)})")


def worker(x, y, s=1.0, armL=((-52, -168), (-60, -226)), armR=((52, -168), (60, -226)), lean=0, look=0):
    b = ""
    for hx in (-16, 16):
        b += limb([(hx, -112), (hx, -58), (hx, -14)], 22, PANTS, NAVY3, 0.5)
        b += rect(hx - 17, -22, 40, 24, "#3A2A1E", 10)
    b += rect(-38, -224, 76, 124, ORANGE, 26)
    for yy in (-186, -150):
        b += rect(-38, yy, 76, 11, WHITE, 0, None)
    b += path("M-38 -224 Q0 -190 38 -224", "none", ORANGE_D, 5)
    for (sx, sy), (el, ha) in ((( -34, -206), armL), ((34, -206), armR)):
        b += limb([(sx, sy), el, ha], 18, PANTS, NAVY3, 0.5)
        b += circ(ha[0], ha[1], 12, SKIN, INK, 4)
    h = circ(0, -258, 29, SKIN, INK, 4)
    h += circ(-10 + look, -260, 3, INK, None) + circ(10 + look, -260, 3, INK, None)
    h += path("M-9 -246 Q0 -238 9 -246", "none", INK, 3.5)
    h += path("M-33 -266 A33 33 0 0 1 33 -266 Z", YELLOW, INK, 4)
    h += rect(-39, -268, 78, 11, YELLOW, 5, INK, 4)
    h += rect(-6, -300, 12, 14, YELLOW, 4, INK, 3)
    b += grp(h, f"rotate({n(lean)} 0 -230)")
    return grp(b, f"translate({n(x)} {n(y)}) scale({n(s)})")


def scaffold(x, y, w, h, cols=3, decks=(0.0,), color=GRAY, deck_color=WOOD):
    """Tubular scaffold. (x,y) = top-left, h = height, decks = fractions from the bottom."""
    b = ""
    cw = w / cols
    rows = max(2, int(h // 150))
    rh = h / rows
    for i in range(cols + 1):
        b += line(x + i * cw, y, x + i * cw, y + h, INK, 13) + line(x + i * cw, y, x + i * cw, y + h, color, 7)
    for j in range(rows + 1):
        yy = y + j * rh
        b += line(x, yy, x + w, yy, INK, 12) + line(x, yy, x + w, yy, color, 6)
    for i in range(cols):
        for j in range(rows):
            x0, y0 = x + i * cw, y + j * rh
            a, c = ((x0, y0 + rh), (x0 + cw, y0)) if (i + j) % 2 == 0 else ((x0, y0), (x0 + cw, y0 + rh))
            b += line(*a, *c, INK, 9) + line(*a, *c, color, 4)
    for f in decks:
        yy = y + h - f * h
        b += rect(x - 14, yy - 4, w + 28, 22, deck_color, 4) + line(x - 6, yy + 7, x + w + 6, yy + 7, WOOD_D, 3, 'opacity="0.6"')
    return b


# ---------------------------------------------------------------- scenes
def art_hero():
    W, H = 760, 780
    defs = rad("hg", [(0, CYAN, 0.55), (0.55, CYAN, 0.12), (1, CYAN, 0)])
    b = circ(340, 380, 340, "url(#hg)", None)
    random.seed(4)
    for _ in range(18):
        b += sparkle(random.randint(20, 740), random.randint(20, 600), random.randint(5, 12), WHITE, random.choice((0.35, 0.6, 0.9)))
    # floating tech chips
    b += grp(rect(0, 0, 70, 52, NAVY3, 12, CYAN, 4) + path("M16 20 L26 26 L16 32 M34 34 L50 34", "none", CYAN, 5), "translate(40 150) rotate(-10)")
    b += grp(circ(0, 0, 30, NAVY3, ORANGE, 4) + path("M-12 0 L-4 8 L12 -8", "none", ORANGE, 6), "translate(70 470)")
    b += grp(rect(0, 0, 60, 60, NAVY3, 14, CYAN, 4) + circ(30, 30, 12, CYAN, None) + circ(30, 30, 20, "none", CYAN, 3), "translate(660 560) rotate(12)")
    b += ell(330, 742, 190, 22, "#000", None, 0, 'opacity="0.28"')
    walk = robot(330, 736, 1.32,
                 armL=((-122, -290), (-112, -204)), armR=((146, -318), (150, -396)),
                 legL=((-62, -108), (-78, -22)), legR=((54, -114), (86, -14)),
                 openR=0.45, tilt=-5, back=plank(112, -402, 380, -20),
                 front=toolbag(-112, -160, 0.9, 6))
    b += walk
    return svg(W, H, b, defs)


def art_world():
    W, H = 1200, 620
    defs = (lin("wsky", [(0, "#0A1630"), (0.55, "#2A2A78"), (1, "#E4608A")]) +
            rad("wglow", [(0, ORANGE, 0.9), (1, ORANGE, 0)]) +
            lin("wb1", [(0, "#1B3A6B"), (1, "#0F2347")]) + lin("wb2", [(0, "#27408B"), (1, "#122244")]))
    b = rect(0, 0, W, H, "url(#wsky)", 0, None)
    random.seed(7)
    for _ in range(46):
        b += circ(random.randint(10, 1190), random.randint(8, 250), random.choice((1.4, 2, 2.6)), WHITE, None, 0, f'opacity="{random.choice((0.4, 0.7, 0.95))}"')
    b += circ(880, 400, 190, "url(#wglow)", None) + circ(880, 400, 96, ORANGE, None, 0, 'opacity="0.9"')
    # skyline
    xs = [(30, 120, 240), (140, 90, 330), (225, 130, 210), (350, 100, 380), (445, 150, 270),
          (600, 110, 340), (705, 130, 230), (830, 90, 300), (915, 140, 380), (1050, 100, 260), (1140, 80, 200)]
    for i, (x0, w0, h0) in enumerate(xs):
        top = 540 - h0
        b += rect(x0, top, w0, h0 + 80, f"url(#wb{1 + i % 2})", 8, INK, 4)
        for wy in range(top + 18, 540, 30):
            for wx in range(x0 + 14, x0 + w0 - 18, 24):
                if random.random() < 0.62:
                    b += rect(wx, wy, 11, 15, random.choice((YELLOW, CYAN, YELLOW, WHITE)), 2, None, 0, 'opacity="0.9"')
        if i % 3 == 0:
            b += line(x0 + w0 / 2, top, x0 + w0 / 2, top - 40, INK, 5) + circ(x0 + w0 / 2, top - 44, 6, RED, None)
    # ground + circuit lines
    b += rect(0, 530, W, 100, "#0B1A33", 0, None)
    b += rect(0, 530, W, 8, CYAN, 0, None, 0, 'opacity="0.8"')
    for i, yy in enumerate((560, 584, 606)):
        pts = f"M0 {yy} L{180 + i * 40} {yy} L{220 + i * 40} {yy - 14} L{520 + i * 60} {yy - 14} L{560 + i * 60} {yy} L{W} {yy}"
        b += path(pts, "none", CYAN, 3, 'opacity="0.55"')
        b += circ(220 + i * 40, yy - 14, 5, CYAN, None) + circ(560 + i * 60, yy, 5, ORANGE, None)
    # cloud + data streams
    b += cloud(480, 138, 1.4, WHITE, INK)
    b += path("M610 175 L610 300", "none", CYAN, 4, 'stroke-dasharray="3 12" opacity="0.9"')
    b += path("M560 170 Q540 250 440 300", "none", CYAN, 4, 'stroke-dasharray="3 12" opacity="0.9"')
    b += path("M660 170 Q700 250 760 290", "none", CYAN, 4, 'stroke-dasharray="3 12" opacity="0.9"')
    b += path("M520 128 L560 100 M520 128 L566 150", "none", CYAN_D, 0)  # invisible spacer
    # satellite
    sat = (rect(-34, -22, 68, 44, GRAY, 8) + rect(-110, -16, 66, 32, NAVY3, 4, CYAN, 3) + rect(44, -16, 66, 32, NAVY3, 4, CYAN, 3) +
           line(-88, -16, -88, 16, CYAN, 2) + line(-66, -16, -66, 16, CYAN, 2) + line(66, -16, 66, 16, CYAN, 2) + line(88, -16, 88, 16, CYAN, 2) +
           path("M-10 -22 L-10 -44 M10 -22 L10 -44", "none", INK, 5) + circ(0, -52, 14, ORANGE, INK, 4))
    b += grp(sat, "translate(165 120) rotate(-18) scale(0.9)")
    # phone
    ph = (rect(-58, -104, 116, 208, NAVY2, 22, CYAN, 5) + rect(-48, -88, 96, 170, NAVY, 12, None, 0) +
          "".join(rect(-38 + c * 28, -76 + r * 28, 22, 22, random.choice((ORANGE, CYAN, GREEN, YELLOW)), 6, None, 0) for r in range(3) for c in range(3)) +
          path("M-30 14 Q0 -8 30 14 M-20 30 Q0 14 20 30", "none", CYAN, 5) + circ(0, 40, 5, CYAN, None) +
          rect(-24, 58, 48, 12, CYAN, 6, None, 0, 'opacity="0.7"'))
    b += grp(ph, "translate(275 330) rotate(-12)")
    # drones
    def drone(x, y, s):
        d = (line(-52, -26, -22, -8, INK, 7) + line(52, -26, 22, -8, INK, 7) +
             ell(-52, -34, 30, 6, GRAY, INK, 3) + ell(52, -34, 30, 6, GRAY, INK, 3) +
             rect(-26, -14, 52, 28, WHITE, 12) + circ(0, 0, 9, CYAN, INK, 3) + circ(0, 18, 4, RED, None))
        return grp(d, f"translate({x} {y}) scale({s})")
    b += drone(940, 140, 1.15) + drone(1070, 230, 0.8)
    # street life
    b += robot(1010, 560, 0.3, armL=((-110, -270), (-120, -190)), armR=((108, -272), (118, -208)), openR=0.8)
    b += worker(1080, 560, 0.3, armL=((-52, -168), (-58, -112)), armR=((52, -168), (62, -112)))
    b += worker(120, 560, 0.3, armL=((-52, -168), (-58, -112)), armR=((52, -168), (62, -224)))
    for (sx, sy, r) in ((60, 70, 14), (395, 48, 9), (790, 60, 11), (1150, 90, 14)):
        b += sparkle(sx, sy, r, YELLOW, 0.95)
    return svg(W, H, b, defs)


def icon_gear():
    b = ""
    cx = cy = 120
    pts = []
    teeth = 12
    for i in range(teeth * 2):
        a = i * math.pi / teeth
        r = 96 if i % 2 == 0 else 74
        a0, a1 = a - math.pi / teeth * 0.28, a + math.pi / teeth * 0.28
        pts += [(cx + r * math.cos(a0), cy + r * math.sin(a0)), (cx + r * math.cos(a1), cy + r * math.sin(a1))]
    b += poly(pts, ORANGE, INK, 6) + circ(cx, cy, 52, ORANGE_D, INK, 5) + circ(cx, cy, 24, NAVY, INK, 5)
    for k in range(6):
        a = k * math.pi / 3
        b += line(cx + 28 * math.cos(a), cy + 28 * math.sin(a), cx + 50 * math.cos(a), cy + 50 * math.sin(a), INK, 5, 'opacity="0.5"')
    b += cloud(150, 60, 0.5, WHITE, None, 'opacity="0.9"')
    return svg(240, 240, b)


def icon_computer():
    b = rect(40, 38, 160, 128, GRAY, 16) + rect(54, 52, 132, 94, NAVY, 10, INK, 4)
    for i, w in enumerate((88, 60, 100, 44)):
        b += rect(66, 62 + i * 18, w, 8, CYAN, 4, None, 0, 'opacity="0.9"')
    b += rect(104, 166, 32, 20, GRAY_D, 4) + rect(70, 184, 100, 14, GRAY, 6)
    b += rect(34, 204, 172, 22, GRAY, 8)
    for i in range(10):
        b += rect(42 + i * 16.5, 209, 11, 6, GRAY_D, 2, None, 0)
    b += circ(176, 154, 5, GREEN, None)
    return svg(240, 240, b)


def icon_phone():
    b = rect(66, 18, 108, 204, NAVY2, 24, INK, 5) + rect(76, 34, 88, 160, NAVY, 12, None, 0)
    cols = (ORANGE, CYAN, GREEN, YELLOW, RED, CYAN, GREEN, ORANGE, YELLOW)
    for k in range(9):
        b += rect(84 + (k % 3) * 28, 44 + (k // 3) * 28, 22, 22, cols[k], 6, None, 0)
    b += path("M92 154 Q120 132 148 154 M102 168 Q120 154 138 168", "none", CYAN, 5) + circ(120, 178, 4, CYAN, None)
    b += rect(104, 203, 32, 8, GRAY_D, 4, None, 0)
    b += path("M42 70 Q28 100 42 130 M26 56 Q4 100 26 144", "none", CYAN, 5, 'opacity="0.7"')
    return svg(240, 240, b)


def icon_chip():
    b = ""
    for i in range(6):
        p = 66 + i * 22
        b += rect(p - 5, 22, 10, 30, GRAY, 3, INK, 3) + rect(p - 5, 188, 10, 30, GRAY, 3, INK, 3)
        b += rect(22, p - 5, 30, 10, GRAY, 3, INK, 3) + rect(188, p - 5, 30, 10, GRAY, 3, INK, 3)
    b += rect(46, 46, 148, 148, NAVY3, 22, INK, 6) + rect(62, 62, 116, 116, NAVY2, 14, CYAN, 4)
    b += circ(120, 120, 40, CYAN, None, 0, 'opacity="0.2"')
    b += (f'<text x="120" y="141" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" '
          f'font-weight="900" font-size="68" fill="{CYAN}">AI</text>')
    b += path("M84 160 L156 160", "none", ORANGE, 5)
    for (px, py) in ((78, 78), (162, 78), (78, 162), (162, 162)):
        b += circ(px, py, 4, CYAN, None)
    return svg(240, 240, b)


def icon_robot():
    b = ell(120, 226, 70, 10, "#000", None, 0, 'opacity="0.28"')
    b += robot(120, 224, 0.4, armL=((-114, -268), (-134, -196)), armR=((114, -268), (134, -196)), openL=1.2, openR=1.2)
    return svg(240, 240, b)


def art_anatomy():
    W, H = 1000, 960
    defs = rad("ag", [(0, CYAN, 0.45), (0.6, CYAN, 0.08), (1, CYAN, 0)])
    b = circ(500, 470, 440, "url(#ag)", None)
    # blueprint grid
    for i in range(0, W + 1, 50):
        b += line(i, 0, i, H, CYAN, 1, 'opacity="0.10"')
    for j in range(0, H + 1, 50):
        b += line(0, j, W, j, CYAN, 1, 'opacity="0.10"')
    S, X0, Y0 = 1.62, 500, 920
    b += ell(X0, Y0 + 6, 240, 22, "#000", None, 0, 'opacity="0.3"')
    b += robot(X0, Y0, S, armL=((-132, -268), (-164, -192)), armR=((132, -268), (164, -192)),
               legL=((-44, -112), (-50, -20)), legR=((44, -112), (50, -20)), openL=1.25, openR=1.25)

    def T(lx, ly):
        return X0 + lx * S, Y0 + ly * S

    marks = {
        "eyes": T(46, -441),
        "brain": T(0, -500),
        "core": T(0, -325),
        "joints": T(-44, -112),
        "grip": T(164, -192),
    }
    # leader lines to left / right label columns
    lines = [("eyes", "R", 1), ("brain", "L", 2), ("core", "R", 3), ("joints", "L", 4), ("grip", "R", 5)]
    meta = {}
    for key, side, num in lines:
        px, py = marks[key]
        # brain marker sits on the antenna ball
        ex = 986 if side == "R" else 14
        sx = px + (24 if side == "R" else -24)
        b += path(f"M{n(px)} {n(py)} L{n(sx)} {n(py)} L{n(ex)} {n(py)}", "none", ORANGE, 3, 'stroke-dasharray="2 9" opacity="0.95"')
        b += circ(px, py, 20, ORANGE, INK, 4) + (f'<text x="{n(px)}" y="{n(py + 7)}" text-anchor="middle" font-family="Arial, sans-serif" '
                                               f'font-weight="800" font-size="22" fill="{INK}">{num}</text>')
        meta[num] = (side, round(py))
    print("anatomy label rows (num: side, y):", meta)
    return svg(W, H, b, defs)


def art_team():
    W, H = 1100, 700
    defs = (lin("tsky", [(0, "#38BDF8"), (1, "#E0F2FE")]) + rad("tsun", [(0, YELLOW, 1), (1, YELLOW, 0)]))
    b = rect(0, 0, W, H, "url(#tsky)", 0, None)
    b += circ(930, 120, 140, "url(#tsun)", None) + circ(930, 120, 62, YELLOW, INK, 4)
    b += cloud(120, 140, 1.2, WHITE, None) + cloud(640, 90, 0.9, WHITE, None)
    # half-built building behind
    b += rect(620, 150, 360, 470, "#9FB3C8", 6, INK, 5)
    for k in range(4):
        b += rect(620, 150 + k * 118, 360, 14, GRAY_D, 0, INK, 3)
        for c in range(3):
            b += rect(650 + c * 108, 180 + k * 118, 70, 78, "#BFD3E6" if k < 3 else NAVY2, 6, INK, 3)
    b += rect(620, 150, 360, 12, ORANGE, 0, INK, 3)
    # crane
    b += rect(1020, 50, 18, 570, ORANGE, 3) + rect(850, 40, 230, 16, ORANGE, 3) + line(870, 56, 870, 160, INK, 4) + rect(850, 160, 40, 24, YELLOW, 4)
    # ground
    b += rect(0, 620, W, 80, "#6B7D94", 0, INK, 5) + rect(0, 620, W, 10, "#8EA0B6", 0, None)
    # scaffold
    b += scaffold(180, 140, 460, 480, cols=3, decks=(0.0, 0.5, 0.97))
    b += worker(520, 620 - 480 * 0.5 - 22 + 18, 0.78, armL=((-54, -150), (-76, -96)), armR=((54, -150), (86, -96)), lean=-6)
    # worker on upper deck (y of mid deck = 620-240 = 380) -> stands on deck at 380-4
    # robot on ground deck
    b += robot(330, 618, 0.62, armL=((-110, -270), (-106, -196)), armR=((112, -300), (150, -420)),
               legL=((-40, -112), (-40, -20)), legR=((40, -112), (42, -20)), openR=1.3, tilt=-6,
               front=toolbag(150, -470, 0.8, -10))
    b += sparkle(446, 330, 12, YELLOW, 0.95) + sparkle(470, 296, 8, WHITE, 0.9)
    b += plank(120, 604, 190, 0, 20)
    return svg(W, H, b, defs)


def art_city():
    W, H = 1500, 620
    defs = (lin("csky", [(0, "#7DD3FC"), (0.7, "#FDE68A"), (1, "#FDBA74")]) + rad("csun", [(0, "#FFF3B0", 1), (1, "#FFF3B0", 0)]))
    b = rect(0, 0, W, H, "url(#csky)", 0, None)
    b += circ(1180, 150, 170, "url(#csun)", None) + circ(1180, 150, 66, "#FFF3B0", None)
    b += cloud(200, 130, 1.1, WHITE, None) + cloud(820, 90, 0.8, WHITE, None) + cloud(1320, 260, 0.7, WHITE, None)
    random.seed(11)
    pal = ["#F8FAFC", "#E2E8F0", "#CFE8FF", "#FFE4C7", "#D8F3E3"]
    xs = [(20, 150, 320), (170, 120, 250), (290, 170, 400), (460, 130, 290), (590, 160, 360), (750, 130, 270),
          (880, 170, 420), (1050, 120, 300), (1170, 160, 350), (1330, 150, 260)]
    for i, (x0, w0, h0) in enumerate(xs):
        top = 520 - h0
        b += rect(x0, top, w0, h0 + 40, pal[i % 5], 18, INK, 4)
        for wy in range(top + 26, 505, 40):
            for wx in range(x0 + 16, x0 + w0 - 24, 30):
                b += rect(wx, wy, 18, 24, "#7DD3FC", 4, INK, 2)
        # green roof + solar
        b += rect(x0 - 4, top - 14, w0 + 8, 18, GREEN, 9, INK, 4)
        for k in range(3):
            b += circ(x0 + 24 + k * 36, top - 26, 14, GREEN_D, INK, 3) if k % 2 == 0 else ""
        if i % 2 == 1:
            b += grp(rect(0, 0, w0 - 30, 14, NAVY3, 3, INK, 3) + line(10, 0, 10, 14, CYAN, 2) + line(w0 - 50, 0, w0 - 50, 14, CYAN, 2), f"translate({x0 + 14} {top - 40}) skewX(-20)")
    # elevated rail + tram
    b += rect(0, 470, W, 14, GRAY_D, 5, INK, 4) + "".join(rect(60 + k * 240, 484, 16, 40, GRAY_D, 3, INK, 3) for k in range(7))
    tram = (rect(0, 0, 330, 66, "#F8FAFC", 26) + "".join(rect(18 + k * 62, 12, 46, 30, "#7DD3FC", 8, INK, 3) for k in range(5)) +
            rect(0, 46, 330, 12, CYAN, 0, None) + circ(60, 70, 10, GRAY_D, INK, 3) + circ(270, 70, 10, GRAY_D, INK, 3))
    b += grp(tram, "translate(560 410)")
    # drones with parcels
    def drone(x, y, s, parcel=True):
        d = (line(-52, -26, -22, -8, INK, 7) + line(52, -26, 22, -8, INK, 7) +
             ell(-52, -34, 30, 6, GRAY, INK, 3) + ell(52, -34, 30, 6, GRAY, INK, 3) + rect(-26, -14, 52, 28, WHITE, 12) +
             circ(0, 0, 9, ORANGE, INK, 3))
        if parcel:
            d += line(-10, 14, -10, 36, INK, 3) + line(10, 14, 10, 36, INK, 3) + rect(-24, 36, 48, 36, WOOD, 6) + line(0, 36, 0, 72, WOOD_D, 4)
        return grp(d, f"translate({x} {y}) scale({s})")
    b += drone(300, 150, 1.0) + drone(980, 120, 0.8) + drone(1400, 200, 0.7, False)
    # street
    b += rect(0, 540, W, 80, "#334155", 0, INK, 5) + "".join(rect(30 + k * 120, 574, 60, 8, "#FDE68A", 4, None, 0) for k in range(13))
    def car(x, col):
        c = (rect(0, 20, 150, 34, col, 14) + path("M24 22 Q40 -12 78 -12 L108 -12 Q128 -6 136 22 Z", col, INK, 4) +
             path("M44 20 Q54 0 80 0 L88 0 L88 20 Z M96 0 L108 0 Q120 4 124 20 L96 20 Z", "#BEE3F8", INK, 3) + circ(36, 56, 14, INK, "#CBD5E1", 4) + circ(116, 56, 14, INK, "#CBD5E1", 4) +
             circ(142, 34, 5, YELLOW, None))
        return grp(c, f"translate({x} 500)")
    b += car(120, CYAN) + car(980, ORANGE)
    # trees
    for tx in (50, 430, 760, 1250, 1440):
        b += rect(tx - 6, 480, 12, 62, WOOD_D, 3) + circ(tx, 470, 34, GREEN, INK, 4) + circ(tx - 18, 486, 22, GREEN_D, INK, 3) + circ(tx + 20, 488, 20, GREEN, INK, 3)
    # people + helper robot on sidewalk
    b += robot(660, 575, 0.27, armL=((-110, -270), (-120, -196)), armR=((112, -272), (122, -200)), front=toolbag(-122, -150, 0.9))
    b += worker(710, 575, 0.27, armL=((-52, -168), (-58, -112)), armR=((52, -168), (62, -112)))
    b += worker(1120, 575, 0.27, armL=((-52, -168), (-58, -112)), armR=((52, -168), (62, -224)))
    return svg(W, H, b, defs).replace('viewBox="0 0 1500 620"', 'viewBox="0 102 1500 518"')


def art_balance():
    W, H = 820, 700
    defs = rad("bg", [(0, CYAN, 0.35), (1, CYAN, 0)])
    b = circ(410, 330, 330, "url(#bg)", None)
    random.seed(3)
    for _ in range(14):
        b += sparkle(random.randint(20, 800), random.randint(20, 400), random.randint(5, 11), WHITE, random.choice((0.35, 0.7)))
    # stand
    b += poly([(300, 650), (520, 650), (480, 600), (340, 600)], NAVY3, INK, 5)
    b += rect(392, 150, 36, 460, GRAY, 12) + rect(392, 150, 14, 460, WHITE, 6, None, 0, 'opacity="0.55"')
    # beam
    b += rect(110, 138, 600, 24, ORANGE, 12) + circ(410, 150, 26, YELLOW, INK, 5) + circ(410, 150, 9, INK, None)
    b += circ(122, 150, 10, YELLOW, INK, 4) + circ(698, 150, 10, YELLOW, INK, 4)
    # strings + pans
    for cx in (122, 698):
        b += line(cx, 150, cx - 78, 380, INK, 5) + line(cx, 150, cx + 78, 380, INK, 5)
        b += line(cx, 150, cx - 78, 380, GRAY, 2.5) + line(cx, 150, cx + 78, 380, GRAY, 2.5)
        b += path(f"M{cx - 100} 380 L{cx + 100} 380 Q{cx + 90} 428 {cx} 428 Q{cx - 90} 428 {cx - 100} 380Z", NAVY3, INK, 5)
        b += rect(cx - 104, 372, 208, 14, CYAN, 7)
    # left pan: robot + gear
    b += robot(104, 376, 0.34, armL=((-110, -270), (-124, -200)), armR=((110, -270), (124, -200)), openL=1.2, openR=1.2)
    gear = []
    cx, cy = 168, 316
    for i in range(16):
        a = i * math.pi / 8
        r = 44 if i % 2 == 0 else 34
        a0, a1 = a - math.pi / 8 * 0.3, a + math.pi / 8 * 0.3
        gear += [(cx + r * math.cos(a0), cy + r * math.sin(a0)), (cx + r * math.cos(a1), cy + r * math.sin(a1))]
    b += poly(gear, ORANGE, INK, 4) + circ(cx, cy, 14, NAVY, INK, 4)
    # right pan: heart + shield
    heart = "M0 18 C-34 -8 -26 -34 -8 -32 C-2 -32 0 -26 0 -22 C0 -26 2 -32 8 -32 C26 -34 34 -8 0 18Z"
    b += grp(path(heart, RED, INK, 4), "translate(640 354) scale(2.3)")
    shield = "M0 -48 L40 -34 L40 6 Q40 38 0 56 Q-40 38 -40 6 L-40 -34Z"
    b += grp(path(shield, CYAN, INK, 5) + path("M-16 4 L-4 16 L18 -12", "none", WHITE, 8), "translate(752 332) scale(0.95)")
    return svg(W, H, b, defs)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = {
        "hero": art_hero, "world": art_world, "anatomy": art_anatomy, "team": art_team,
        "city": art_city, "balance": art_balance, "icon-gear": icon_gear, "icon-computer": icon_computer,
        "icon-phone": icon_phone, "icon-chip": icon_chip, "icon-robot": icon_robot,
    }
    for name, fn in jobs.items():
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("wrote", name)


if __name__ == "__main__":
    main()
