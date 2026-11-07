"""Genera los fondos en acuarela (SVG con filtros) en img/. Uso: python generar_acuarelas.py
Técnica: lavados translúcidos que se multiplican (como veladuras), bordes que se corren por
desplazamiento de turbulencia, pigmento granulado y textura de papel por encima."""
import math, os, random, sys

W, H = 1920, 1080
# Versión vertical (teléfono): la misma escena, pegada abajo, con el cielo prolongado hacia arriba.
VERT = "--v" in sys.argv
CW, CH = (1080, 2160) if VERT else (W, H)     # tamaño del lienzo visible
DY = CH - H if VERT else 0                    # cuánto cielo se añade por encima
X0 = {"amarillo": 840, "azul": 380, "rosado": 100, "verde": 420, "morado": 840, "naranja": 480,
      "turquesa": 330, "rojo": 330, "aurora": 420, "niebla": 420}
VX = 0                                        # borde izquierdo visible (se fija por escena)
AQUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("ACUARELA_OUT") or os.path.join(AQUI, "img")


# ---------------------------------------------------------------- utilidades
def n(v):
    return f"{v:.1f}"


def suave(pts, cerrado=False):
    """Curva Catmull-Rom -> cúbicas de Bézier."""
    P = ([pts[-1]] + pts + [pts[0], pts[1]]) if cerrado else ([pts[0]] + pts + [pts[-1]])
    d = f"M{n(P[1][0])} {n(P[1][1])}"
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{n(c1[0])} {n(c1[1])} {n(c2[0])} {n(c2[1])} {n(p2[0])} {n(p2[1])}"
    return d + ("Z" if cerrado else "")


class Esc:
    def __init__(s, seed, papel="#fbf5e9"):
        s.r = random.Random(seed)
        s.papel = papel
        s.defs, s.b, s.k = [], [], 0

    # --- formas
    def blob(s, cx, cy, rx, ry, k=9, jit=.18, rot=0):
        pts = []
        for i in range(k):
            a = 2 * math.pi * i / k + rot
            m = 1 + s.r.uniform(-jit, jit)
            pts.append((cx + math.cos(a) * rx * m, cy + math.sin(a) * ry * m))
        return suave(pts, True)

    def cresta(s, base, amp, paso=150, x0=-100, x1=W + 100, fondo=H + 100):
        pts, x = [], x0
        while x <= x1:
            pts.append((x, base + s.r.uniform(-amp, amp)))
            x += paso * s.r.uniform(.7, 1.3)
        pts.append((x1, base + s.r.uniform(-amp, amp)))
        return suave(pts) + f" L{x1} {fondo} L{x0} {fondo} Z"

    def grad(s, stops, x2=0, y2=1):
        s.k += 1
        st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        s.defs.append(f'<linearGradient id="g{s.k}" x1="0" y1="0" x2="{x2}" y2="{y2}">{st}</linearGradient>')
        return f"url(#g{s.k})"

    def rad(s, color, op=.8):
        s.k += 1
        s.defs.append(f'<radialGradient id="g{s.k}"><stop offset="0" stop-color="{color}" stop-opacity="{op}"/>'
                      f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>')
        return f"url(#g{s.k})"

    # --- pintura
    def p(s, d, c, op=.6, rim=True, sw=3):
        st = f' stroke="{c}" stroke-opacity="{op * .55:.2f}" stroke-width="{sw}"' if rim else ""
        return f'<path d="{d}" fill="{c}" fill-opacity="{op:.2f}"{st}/>'

    def linea(s, d, c, w, op=.7):
        return (f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w:.1f}" stroke-opacity="{op:.2f}" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')

    def circ(s, x, y, r, c, op=.7):
        return f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(r)}" fill="{c}" fill-opacity="{op:.2f}"/>'

    def g(s, items, filtro="agua", mult=True, extra=""):
        m = ' style="mix-blend-mode:multiply"' if mult else ""
        s.b.append(f'<g filter="url(#{filtro})"{m}{extra}>' + "".join(items) + "</g>")

    def full(s, fill, op=1):
        return f'<rect x="-100" y="{-100 - DY}" width="{W + 200}" height="{H + 200 + DY}" fill="{fill}" fill-opacity="{op}"/>'

    def salpicar(s, n_, c, x0, y0, x1, y1, rmax=7, op=.5):
        out = []
        for _ in range(n_):
            out.append(s.circ(s.r.uniform(x0, x1), s.r.uniform(y0, y1), s.r.uniform(1.5, rmax), c, op * s.r.uniform(.5, 1)))
        return out

    def svg(s):
        defs = "".join(s.defs)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VX} {-DY} {CW} {CH}" preserveAspectRatio="xMidYMid slice">'
            f'<defs>{defs}'
            # lavado: bordes que se corren + pigmento granulado
            f'<filter id="agua" filterUnits="userSpaceOnUse" x="-150" y="{-150 - DY}" width="{W + 300}" height="{H + 300 + DY}">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.011 0.015" numOctaves="3" seed="4" result="t"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="t" scale="38" xChannelSelector="R" yChannelSelector="G" result="d"/>'
            f'<feGaussianBlur in="d" stdDeviation="1.3" result="b"/>'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="9" result="gr"/>'
            f'<feColorMatrix in="gr" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55" result="ga"/>'
            f'<feComposite in="b" in2="ga" operator="in"/></filter>'
            # detalles pequeños: menos desplazamiento
            f'<filter id="fino" filterUnits="userSpaceOnUse" x="-150" y="{-150 - DY}" width="{W + 300}" height="{H + 300 + DY}">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="2" result="t"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/>'
            f'<feGaussianBlur in="d" stdDeviation=".7"/></filter>'
            f'<filter id="brillo" filterUnits="userSpaceOnUse" x="-150" y="{-150 - DY}" width="{W + 300}" height="{H + 300 + DY}">'
            f'<feGaussianBlur stdDeviation="28"/></filter>'
            f'<filter id="bokeh" filterUnits="userSpaceOnUse" x="-150" y="{-150 - DY}" width="{W + 300}" height="{H + 300 + DY}">'
            f'<feGaussianBlur stdDeviation="9"/></filter>'
            f'<filter id="papel" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="5" result="n"/>'
            f'<feDiffuseLighting in="n" lighting-color="#fffaf0" surfaceScale="1.8"><feDistantLight azimuth="45" elevation="62"/></feDiffuseLighting></filter>'
            f'<filter id="manchas" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.0035 0.005" numOctaves="3" seed="12" result="n"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 .9  0 0 0 0 .82  0 0 0 0 .7  0 0 0 1.4 -.45"/></filter>'
            f'</defs>'
            f'<rect x="{VX}" y="{-DY}" width="{CW}" height="{CH}" fill="{s.papel}"/>'
            + "".join(s.b) +
            f'<rect x="{VX}" y="{-DY}" width="{CW}" height="{CH}" filter="url(#manchas)" style="mix-blend-mode:multiply" opacity=".55"/>'
            f'<rect x="{VX}" y="{-DY}" width="{CW}" height="{CH}" filter="url(#papel)" style="mix-blend-mode:multiply" opacity=".55"/>'
            f'</svg>')


def halo(e, x, y, r, color, op=.8):
    e.g([f'<circle cx="{x}" cy="{y}" r="{r}" fill="{e.rad(color, op)}"/>'], "fino", mult=False)


# ---------------------------------------------------------------- AMARILLO: girasoles
def girasol(e, x, y, s, base_y, pet1="#ffcc2a", pet2="#f5a91d"):
    r = e.r
    tallo = []
    ex = x + r.uniform(-40, 40)
    d = f"M{n(ex)} {n(base_y)} Q{n(x + r.uniform(-60, 60))} {n((y + base_y) / 2)} {n(x)} {n(y + s * .3)}"
    tallo.append(e.linea(d, "#6d8c34", max(4, s * .13), .8))
    for sgn in (-1, 1):
        ly = y + (base_y - y) * r.uniform(.35, .65)
        lx = x + (ex - x) * .4
        tallo.append(e.p(e.blob(lx + sgn * s * .38, ly, s * .42, s * .17, 7, .12, sgn * -.5), "#7aa23c", .7))
    cab = []
    k = 18
    for i in range(k):
        deg = 360 * i / k + r.uniform(-4, 4)
        col = pet1 if i % 2 else pet2
        cab.append(f'<ellipse cx="{n(x)}" cy="{n(y - s * .6)}" rx="{n(s * .15)}" ry="{n(s * .36)}" fill="{col}" '
                   f'fill-opacity=".72" transform="rotate({n(deg)} {n(x)} {n(y)})"/>')
    cab.append(e.circ(x, y, s * .42, "#7a4416", .88))
    cab.append(e.circ(x, y, s * .27, "#432512", .65))
    cab.append(e.circ(x - s * .08, y - s * .08, s * .1, "#a8641f", .5))
    return tallo, cab


def amarillo():
    e = Esc(11, "#fcf5e2")
    r = e.r
    e.g([e.full(e.grad([(0, "#fff4c9"), (.55, "#ffe28f"), (1, "#ffd25e")]))])
    halo(e, 1380, 300, 420, "#ffd54a", .9)
    e.g([e.p(e.blob(1380, 300, 125, 125, 11, .04), "#ffc72a", .72)], "fino")
    # nubes de papel
    e.g([e.p(e.blob(r.uniform(150, 1750), r.uniform(100, 330), r.uniform(180, 300), r.uniform(28, 48), 9, .2), "#fffaf0", .8, False)
         for _ in range(6)], mult=False)
    # colinas lejanas
    e.g([e.p(e.cresta(610, 40, 200), "#cdd98f", .6)])
    e.g([e.p(e.cresta(670, 30, 160), "#c6d27e", .55)])
    # campo
    e.g([e.p(e.cresta(720, 25, 220), "#f6d460", .9)], mult=False)
    e.g([e.p(e.cresta(840, 40, 260), "#efc450", .85)], mult=False)
    hierba = []
    for _ in range(320):
        x, y = r.uniform(0, W), r.uniform(720, H)
        hh = 16 + (y - 700) * .13
        hierba.append(e.linea(f"M{n(x)} {n(y)} q{n(r.uniform(-8, 8))} {n(-hh / 2)} {n(r.uniform(-12, 12))} {n(-hh)}",
                              r.choice(["#c99a2a", "#e0b43e", "#8aa63e"]), r.uniform(1.5, 3.5), .42))
    e.g(hierba, "fino")
    # girasoles: fondo -> frente
    plan = ([(r.uniform(40, 1880), r.uniform(690, 760), r.uniform(26, 40)) for _ in range(22)]
            + [(r.uniform(60, 1860), r.uniform(770, 880), r.uniform(55, 80)) for _ in range(9)]
            + [(260, 590, 170), (1030, 640, 150), (1650, 560, 185)])
    for (x, y, s) in plan:
        t, c = girasol(e, x, y, s, H + 60)
        e.g(t, "fino")
        e.g(c, "fino")
    e.g(e.salpicar(40, "#ff9f1c", 0, 0, W, H, 7, .5), "fino")
    return e


# ---------------------------------------------------------------- AZUL: velero nocturno
def azul():
    e = Esc(23, "#f4f1ea")
    r = e.r
    hz = 640
    e.g([e.full(e.grad([(0, "#14235a"), (.55, "#3d6fc2"), (1, "#a6cdf0")]), 1)])
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(60, 420), r.uniform(180, 380), r.uniform(30, 55), 9, .25), "#2a4d9b", .22, False)
         for _ in range(8)])
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(100, 520), r.uniform(150, 320), r.uniform(25, 45), 9, .25), "#e6f0fb", .65, False)
         for _ in range(6)], mult=False)
    # estrellas (gouache blanco)
    e.g([e.circ(r.uniform(0, W), r.uniform(0, 430), r.uniform(1.5, 3.4), "#fffdf0", r.uniform(.5, .95)) for _ in range(60)], "fino", mult=False)
    halo(e, 480, 250, 380, "#f5fbff", .75)
    e.g([e.p(e.blob(480, 250, 82, 82, 11, .03), "#fffbe8", .97, False)], "fino", mult=False)
    # islas lejanas
    e.g([e.p(e.cresta(hz - 20, 18, 90, 1450, 1900, hz + 4), "#4a72b5", .6)])
    # mar
    e.g([e.p(f"M-100 {hz} L{W + 100} {hz} L{W + 100} {H + 100} L-100 {H + 100} Z", e.grad([(0, "#86b8e8"), (.45, "#2f5eae"), (1, "#112f6e")]), 1, False)], mult=False)
    olas = []
    for _ in range(110):
        y = hz + 10 + (r.random() ** 1.4) * (H - hz)
        k = (y - hz) / (H - hz)
        rx = r.uniform(90, 260) * (.5 + k)
        ry = r.uniform(2.5, 6) * (.5 + k * 1.6)
        col = r.choice(["#0f2c6c", "#2c5aa8", "#7fb1e6", "#173d86", "#a9cdf1"])
        olas.append(e.p(e.blob(r.uniform(-50, W + 50), y, rx, ry, 8, .25), col, r.uniform(.25, .5), False))
    e.g(olas)
    # reflejo de la luna
    e.g([e.p(e.blob(480 + r.uniform(-40, 40), hz + 25 + i * 22, 70 - i * 2.2 + r.uniform(-10, 10), 4 + i * .15, 8, .3), "#fff3c8", .6 - i * .012, False)
         for i in range(17)], "fino", mult=False)
    # velero
    bx, by = 1300, 690
    barco = [
        e.p(f"M{bx + 10} {by - 20} L{bx + 10} {by - 275} L{bx + 130} {by - 28} Z", "#fff8ea", .96, True, 2),
        e.p(f"M{bx - 10} {by - 22} L{bx - 10} {by - 215} L{bx - 100} {by - 30} Z", "#f5dcc3", .95, True, 2),
        e.p(f"M{bx - 120} {by - 4} L{bx + 150} {by - 4} L{bx + 112} {by + 36} L{bx - 84} {by + 36} Z", "#7b3a2c", .95, True, 2),
        e.linea(f"M{bx} {by - 6} L{bx} {by - 290}", "#3c2a2a", 5, .9),
        e.linea(f"M{bx} {by - 290} L{bx + 36} {by - 280} L{bx} {by - 268} Z", "#e8453c", 3, .9),
    ]
    e.g(barco, "fino", mult=False)
    e.g([f'<g transform="translate(0 {2 * (by + 36)}) scale(1 -1)" opacity=".28">' + "".join(barco[:3]) + "</g>"], "fino", mult=False)
    # barquito lejano
    e.g([e.p(f"M1640 {hz + 6} l50 0 l-8 12 l-36 0 Z", "#2a2f5a", .8, False),
         e.p(f"M1665 {hz + 4} l0 -44 l26 40 Z", "#f6ead6", .85, False)], "fino", mult=False)
    e.g(e.salpicar(35, "#ffffff", 0, 0, W, H, 6, .7), "fino", mult=False)
    return e


# ---------------------------------------------------------------- ROSADO: rama de cerezo
def flor(e, x, y, s, cols):
    r = e.r
    out = []
    rot = r.uniform(0, 6.28)
    for i in range(5):
        a = rot + i * 2 * math.pi / 5
        out.append(e.p(e.blob(x + math.cos(a) * s * .52, y + math.sin(a) * s * .52, s * .5, s * .5, 7, .12), r.choice(cols), .62, True, 2))
    out.append(e.circ(x, y, s * .16, "#d8396f", .8))
    for i in range(6):
        a = r.uniform(0, 6.28)
        out.append(e.linea(f"M{n(x)} {n(y)} L{n(x + math.cos(a) * s * .34)} {n(y + math.sin(a) * s * .34)}", "#b52459", 1.6, .8))
    return out


def rosado():
    e = Esc(37, "#fdf4ee")
    r = e.r
    e.g([e.full(e.grad([(0, "#f7c9da"), (.5, "#fbd9e2"), (1, "#fff0e4")]))])
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(60, 700), r.uniform(200, 420), r.uniform(60, 120), 9, .25), r.choice(["#ff9ec0", "#f7b6d0", "#e89fc8"]), .25, False)
         for _ in range(8)])
    halo(e, 430, 300, 300, "#fffafc", .9)
    e.g([e.p(e.blob(430, 300, 92, 92, 11, .03), "#fff6f8", .96, False)], "fino", mult=False)
    # montañas y campo en niebla (capas claras)
    e.g([e.p(e.cresta(690, 70, 300), "#d9b6d6", .45)])
    e.g([e.p(e.cresta(770, 45, 240), "#c79bc8", .45)])
    e.g([e.p(e.cresta(850, 25, 260), "#f0c3d8", .6)])
    e.g([e.p(e.cresta(930, 22, 240), "#e9a9c9", .55)])
    e.g([e.p(e.cresta(1010, 18, 220), "#dc8fb8", .5)])
    # dos ramas que enmarcan: una desde arriba a la derecha, otra desde abajo a la izquierda
    principales = [[(1990, 10), (1700, 80), (1450, 170), (1190, 190), (930, 290), (740, 410)],
                   [(-60, 960), (200, 880), (440, 880), (640, 780), (800, 760)]]
    ramas = list(principales)
    for rama in principales:
        for _ in range(5):
            i = r.randint(1, len(rama) - 2)
            x, y = rama[i]
            pts = [(x, y)]
            dirx = 1 if rama[0][0] < 0 else -1
            for _ in range(3):
                x += dirx * r.uniform(-30, 120)
                y += r.uniform(60, 150) * (-1 if rama[0][1] > 500 else 1)
                pts.append((x, y))
            ramas.append(pts)
    madera = []
    for k, pts in enumerate(ramas):
        for i in range(len(pts) - 1):
            w = max(4, (44 - i * 7) if k < 2 else (17 - i * 4))
            madera.append(e.linea(f"M{n(pts[i][0])} {n(pts[i][1])} L{n(pts[i + 1][0])} {n(pts[i + 1][1])}", "#5b3a3c", w, .85))
    e.g(madera, "fino")
    cols = ["#ffc2d8", "#ff9fc2", "#ffd9e6", "#f58db5"]
    flores = []
    for pts in ramas:
        for (x, y) in pts:
            for _ in range(r.randint(3, 5)):
                flores += flor(e, x + r.uniform(-85, 85), y + r.uniform(-70, 70), r.uniform(30, 58), cols)
    e.g(flores, "fino")
    # flores grandes desenfocadas (profundidad)
    e.g([e.circ(r.uniform(900, 1900), r.uniform(20, 380), r.uniform(40, 110), r.choice(["#ffb3cf", "#ffffff"]), .2) for _ in range(8)], "bokeh", mult=False)
    e.g(flor(e, 1790, 110, 120, cols) + flor(e, 1560, 40, 100, cols) + flor(e, 60, 760, 110, cols), "bokeh")
    # pétalos cayendo
    petalos = []
    for _ in range(70):
        x, y = r.uniform(0, W), r.uniform(150, H)
        petalos.append(e.p(e.blob(x, y, r.uniform(7, 15), r.uniform(4, 8), 6, .15, r.uniform(0, 3)), r.choice(cols), .7, False))
    e.g(petalos, "fino")
    return e


# ---------------------------------------------------------------- VERDE: dentro del bosque
def tronco(e, x, ancho, ymin, ymax, c, op):
    r = e.r
    izq, der = [], []
    y = ymin
    while y <= ymax:
        w = ancho * (1 + r.uniform(-.06, .06)) * (1 + (y - ymin) / (ymax - ymin) * .25)
        off = math.sin(y / 260 + x) * 12
        izq.append((x + off - w / 2, y))
        der.append((x + off + w / 2, y))
        y += 140
    pts = izq + der[::-1]
    return e.p(suave(pts, True), c, op)


def verde():
    e = Esc(41, "#f6f4e4")
    r = e.r
    hz = 700
    e.g([e.full(e.grad([(0, "#cfe6b0"), (.5, "#e5f0c8"), (1, "#a9cf92")]))])
    # rayos de luz
    e.g([f'<polygon points="{x},{-50 - DY} {x + 160},{-50 - DY} {x + 160 + 520},{H} {x + 520},{H}" fill="#fffbe0" fill-opacity=".34"/>'
         for x in (150, 520, 900)], "brillo", mult=False)
    # troncos lejanos -> cercanos
    e.g([tronco(e, r.uniform(0, W), r.uniform(26, 44), -60 - DY, hz + 20, "#9fc294", .35) for _ in range(16)])
    e.g([tronco(e, r.uniform(0, W), r.uniform(48, 80), -60 - DY, hz + 60, "#6aa073", .5) for _ in range(9)])
    # suelo y camino sinuoso en perspectiva
    e.g([e.p(e.cresta(hz + 20, 18, 300), "#86bd78", .7)])
    e.g([e.p(suave([(930, hz + 6), (1000, hz + 6), (1050, 830), (1420, H + 90), (480, H + 90), (820, 850)], True), "#f0e4b8", .8)])
    e.g([e.p(e.blob(250, 930, 380, 150, 9, .2), "#4e9a62", .6), e.p(e.blob(1680, 940, 400, 150, 9, .2), "#4e9a62", .6)])
    # troncos grandes en primer plano + copa
    for x, a in ((120, 150), (1760, 170), (1480, 95), (440, 80)):
        e.g([tronco(e, x, a, -80 - DY, H + 60, "#2e5a3f", .72), tronco(e, x + a * .15, a * .35, -80 - DY, H + 60, "#1f4430", .35)])
    copas = []
    for _ in range(26):
        copas.append(e.p(e.blob(r.uniform(-50, W + 50), r.uniform(-60 - DY, 120 - DY), r.uniform(120, 260), r.uniform(60, 120), 9, .3), r.choice(["#3f7d52", "#2f6a46", "#58935c"]), .5, False))
    e.g(copas)
    # manchas de luz en el suelo
    e.g([e.p(e.blob(r.uniform(300, 1700), r.uniform(hz + 60, H - 30), r.uniform(40, 120), r.uniform(8, 22), 8, .3), "#fff6c0", .55, False) for _ in range(14)], mult=False)
    # helechos
    helechos = []
    for (x, y) in ((260, 1000), (1620, 1010), (700, 1060), (1250, 1050), (60, 900), (1860, 930)):
        for _ in range(11):
            a = r.uniform(-2.9, -.25)
            L = r.uniform(110, 230)
            ex, ey = x + math.cos(a) * L, y + math.sin(a) * L
            helechos.append(e.linea(f"M{x} {y} Q{n((x + ex) / 2 + r.uniform(-30, 30))} {n((y + ey) / 2 - 40)} {n(ex)} {n(ey + 40)}", r.choice(["#2d6a46", "#3f8a58", "#5aa56a"]), r.uniform(4, 9), .65))
    e.g(helechos, "fino")
    e.g(e.salpicar(40, "#fff6c0", 0, 0, W, H, 5, .8), "fino", mult=False)
    return e


# ---------------------------------------------------------------- MORADO: lavanda en perspectiva
def morado():
    e = Esc(53, "#f1ecf6")
    r = e.r
    hz = 540
    e.g([e.full(e.grad([(0, "#150f43"), (.5, "#4a2f98"), (1, "#c8a0e6")]))])
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(40, 460), r.uniform(200, 400), r.uniform(40, 90), 9, .25), r.choice(["#2c1b73", "#7a52c0"]), .28, False) for _ in range(7)])
    e.g([e.circ(r.uniform(0, W), r.uniform(0, 440), r.uniform(1.4, 3.2), "#fffdf5", r.uniform(.5, .95)) for _ in range(100)], "fino", mult=False)
    halo(e, 1380, 230, 360, "#f3e6ff", .8)
    e.g([e.p(e.blob(1380, 230, 98, 98, 11, .03), "#fffaff", .97, False)], "fino", mult=False)
    e.g([e.p(e.cresta(hz - 6, 26, 240), "#4b3590", .85)], mult=False)
    e.g([e.p(e.cresta(hz + 14, 14, 200), "#3a2878", .9)], mult=False)
    # suelo
    e.g([e.p(f"M-100 {hz + 10} L{W + 100} {hz + 10} L{W + 100} {H + 100} L-100 {H + 100} Z", e.grad([(0, "#7a58b8"), (.5, "#8f6cc8"), (1, "#b08ee0")]), .95, False)], mult=False)
    vp = 960
    R = 15
    surcos = []
    for j in range(-R, R + 1):
        xb = vp + j * 235 + 117
        surcos.append(e.p(suave([(vp - 4, hz), (vp + 4, hz), (xb + 36, H + 80), (xb - 36, H + 80)], True), "#3a2a78", .5, False))
    e.g(surcos)
    mata = []
    for k in range(1, 23):
        t = (k / 22) ** 1.9
        y = hz + (H - hz) * t
        esc = .12 + t * 1.05
        for j in range(-R, R + 1):
            xb = vp + j * 235
            x = vp + (xb - vp) * ((y - hz) / (H - hz))
            if x < -80 or x > W + 80:
                continue
            for _ in range(3):
                dx = r.uniform(-14, 14) * esc * 2.4
                L = (28 + r.uniform(0, 26)) * esc * 1.5
                bend = r.uniform(-8, 8) * esc
                col = r.choice(["#b48cf0", "#c9a8f7", "#9d6fe0", "#dcc4fa"])
                mata.append(e.linea(f"M{n(x + dx)} {n(y)} q{n(bend)} {n(-L * .5)} {n(bend * 1.6)} {n(-L)}", "#7d9c6a", max(1, 2.4 * esc), .7))
                mata.append(e.linea(f"M{n(x + dx + bend * .9)} {n(y - L * .45)} q{n(bend * .4)} {n(-L * .28)} {n(bend * .7)} {n(-L * .55)}", col, max(2.5, 9 * esc), .9))
    e.g(mata, "fino", mult=False)
    # luciérnagas
    luz = []
    for _ in range(26):
        x, y = r.uniform(80, W - 80), r.uniform(hz + 40, H - 60)
        luz.append(e.circ(x, y, r.uniform(12, 24), "#ffe98a", .25))
        luz.append(e.circ(x, y, r.uniform(2.5, 4.5), "#fff6c0", .95))
    e.g(luz, "fino", mult=False)
    return e


# ---------------------------------------------------------------- NARANJA: globos
def globo(e, cx, cy, s, cols):
    r = e.r
    pts = [(cx, cy - s * .55), (cx + s * .5, cy - s * .2), (cx + s * .42, cy + s * .3), (cx + s * .16, cy + s * .62),
           (cx - s * .16, cy + s * .62), (cx - s * .42, cy + s * .3), (cx - s * .5, cy - s * .2)]
    it = [e.p(suave(pts, True), cols[0], .85, True, 2),
          f'<ellipse cx="{n(cx)}" cy="{n(cy - s * .03)}" rx="{n(s * .2)}" ry="{n(s * .5)}" fill="{cols[1]}" fill-opacity=".8"/>',
          f'<ellipse cx="{n(cx)}" cy="{n(cy - s * .03)}" rx="{n(s * .07)}" ry="{n(s * .5)}" fill="{cols[2]}" fill-opacity=".8"/>']
    bx, by = cx, cy + s * .76
    it.append(e.linea(f"M{n(cx - s * .16)} {n(cy + s * .6)} L{n(bx - s * .07)} {n(by)}", "#4a2a2a", max(1, s * .012), .8))
    it.append(e.linea(f"M{n(cx + s * .16)} {n(cy + s * .6)} L{n(bx + s * .07)} {n(by)}", "#4a2a2a", max(1, s * .012), .8))
    it.append(e.p(f"M{n(bx - s * .09)} {n(by)} L{n(bx + s * .09)} {n(by)} L{n(bx + s * .075)} {n(by + s * .11)} L{n(bx - s * .075)} {n(by + s * .11)} Z", "#7a4a2a", .9, False))
    return it


def naranja():
    e = Esc(67, "#fff3e2")
    r = e.r
    e.g([e.full(e.grad([(0, "#e5543a"), (.45, "#ff9a4c"), (1, "#ffe0a0")]))])
    # bandas de nubes
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(120, 720), r.uniform(240, 460), r.uniform(18, 42), 9, .3), r.choice(["#fff1d6", "#ffbf8a", "#f08aa0"]), r.uniform(.35, .7), False) for _ in range(16)])
    halo(e, 960, 760, 520, "#fff0c0", .95)
    e.g([e.p(e.blob(960, 770, 165, 165, 11, .03), "#fff3cf", .93, False)], "fino", mult=False)
    # colinas del fondo
    e.g([e.p(e.cresta(880, 40, 260), "#c4607a", .5)])
    e.g([e.p(e.cresta(950, 35, 230), "#8f3f68", .62)])
    e.g([e.p(e.cresta(1020, 25, 200), "#5a2a55", .8)])
    # globos de lejos a cerca
    paletas = [("#fff1d6", "#e8453c", "#f4a62a"), ("#e8453c", "#fff1d6", "#7a3b7a"), ("#f4a62a", "#7a3b7a", "#fff1d6"),
               ("#7a3b7a", "#f4a62a", "#fff1d6"), ("#fff1d6", "#2f7f8f", "#e8453c")]
    lista = [(1560, 300, 95), (370, 250, 115), (1790, 520, 85), (720, 430, 135), (1250, 230, 150), (170, 600, 175), (1050, 560, 230)]
    for (x, y, s) in lista:
        e.g(globo(e, x, y, s, r.choice(paletas)), "fino", mult=False)
    # pájaros
    e.g([e.linea(f"M{x} {y} q7 -9 14 0 q7 -9 14 0", "#5a2a44", 2.2, .75) for x, y in ((820, 220), (860, 245), (1420, 600), (400, 450), (1640, 180))], "fino")
    e.g(e.salpicar(35, "#fff3cf", 0, 0, W, 860, 6, .7), "fino", mult=False)
    return e


# ---------------------------------------------------------------- TURQUESA: laguna vista desde arriba (aérea)
def hoja_palma(e, x, y, a, L, col, op=.88):
    """Una fronda vista desde arriba: hoja alargada y arqueada que se afina en la punta."""
    r = e.r
    dx, dy = math.cos(a), math.sin(a)
    px, py = -dy, dx
    bend = r.uniform(-.2, .2) * L
    w = L * r.uniform(.09, .14)

    def P(t, off):
        return (x + dx * L * t + px * (bend * t * t + off), y + dy * L * t + py * (bend * t * t + off))
    pts = [P(0, 0), P(.3, -w), P(.62, -w * 1.05), P(.88, -w * .4), P(1, 0), P(.85, w * .4), P(.6, w), P(.28, w * .9)]
    return [e.p(suave(pts, True), col, op, False, 1), e.linea(f"M{n(x)} {n(y)} L{n(P(.95, 0)[0])} {n(P(.95, 0)[1])}", "#d8f2b0", max(1.5, L * .015), .45)]


def vista_palmera(e, x, y, s, lean=(0, 0)):
    r = e.r
    cols = ["#1f7a52", "#2f9a68", "#3fb27a", "#2a8a5a"]
    fr = r.randint(7, 11)
    base = r.uniform(0, 6.28)
    sombra, hojas = [], []
    for i in range(fr):
        a = base + 2 * math.pi * i / fr + r.uniform(-.28, .28)
        L = s * r.uniform(.6, 1.12)
        hojas += hoja_palma(e, x, y, a, L, r.choice(cols))
        sombra += hoja_palma(e, x + lean[0], y + lean[1], a, L * .95, "#7a6a3a", .28)[:1]
    return sombra, hojas + [e.circ(x, y, s * .09, "#6b4a35", .95), e.circ(x - 3, y - 3, s * .05, "#8a6a4a", .8)]


def sombrilla(e, x, y, s):
    it = []
    for i in range(8):
        a0, a1 = 2 * math.pi * i / 8, 2 * math.pi * (i + 1) / 8
        it.append(e.p(f"M{n(x)} {n(y)} L{n(x + math.cos(a0) * s)} {n(y + math.sin(a0) * s)} L{n(x + math.cos(a1) * s)} {n(y + math.sin(a1) * s)} Z",
                      "#e8453c" if i % 2 == 0 else "#fff8ea", .95, False, 1))
    it.append(e.circ(x, y, s * .06, "#3a2a1a", .9))
    return it


def turquesa():
    e = Esc(71, "#f4f9f3")
    r = e.r
    e.g([e.full(e.grad([(0, "#0a7f94"), (.5, "#16aab8"), (1, "#4fd2cf")], 1, 1))])
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(-DY, H), r.uniform(200, 440), r.uniform(120, 280), 9, .25), r.choice(["#0b6f8a", "#1cb6c2", "#7fe6df"]), .3, False) for _ in range(16)])
    # arrecife: manchas oscuras de coral bajo el agua
    e.g([e.p(e.blob(x, y, rx, ry, 9, .3), "#0a6a80", .45, False) for (x, y, rx, ry) in ((1500, 760, 240, 120), (1700, 640, 160, 90), (360, 330, 220, 100), (200, 520, 130, 80), (1420, 160, 200, 80))], mult=False)
    # aguas someras y bancos de arena (formas irregulares, nada centrado)
    e.g([e.p(e.blob(930, 560, 760, 380, 13, .2, .25), "#79e0d8", .75, False), e.p(e.blob(900, 560, 590, 290, 13, .22, .25), "#a9f0e0", .85, False)], mult=False)
    for (x, y, rx, ry, rot) in ((1640, 250, 170, 70, .3), (360, 880, 130, 60, -.4), (1580, 930, 120, 50, .2)):
        e.g([e.p(e.blob(x, y, rx * 1.6, ry * 1.8, 9, .2, rot), "#8fe8df", .6, False), e.p(e.blob(x, y, rx, ry, 9, .25, rot), "#f3dfaa", .95, False)], mult=False)
    e.g([e.p(e.blob(880, 560, 440, 190, 14, .24, .3), "#f3dfaa", .98, False), e.p(e.blob(830, 535, 300, 120, 12, .26, .3), "#fff1cf", .85, False)], mult=False)
    e.g([e.p(e.blob(790, 520, 220, 88, 11, .25, .32), "#6cbf7a", .9, False), e.p(e.blob(1060, 600, 80, 36, 8, .25), "#6cbf7a", .85, False),
         e.p(e.blob(730, 540, 130, 50, 9, .25), "#3f9a68", .5, False)], mult=False)
    # en la versión vertical, más mar por arriba: islotes con palmera y un velero visto desde arriba
    if DY:
        for (fx_, fy_, k_) in ((.30, .22, 1.0), (.72, .52, .8), (.38, .86, .7)):
            ix, iy = VX + CW * fx_, -DY * fy_
            e.g([e.p(e.blob(ix, iy, 190 * k_, 100 * k_, 9, .2, r.uniform(-.4, .4)), '#8fe8df', .6, False), e.p(e.blob(ix, iy, 120 * k_, 62 * k_, 9, .25), '#f3dfaa', .95, False)], mult=False)
            sh_, hj_ = vista_palmera(e, ix, iy, 70 * k_, (16, 10))
            e.g(sh_, 'fino')
            e.g(hj_, 'fino', mult=False)
        vx_, vy_ = VX + CW * .68, -DY * .2
        e.g([e.p(e.blob(vx_ - 190, vy_ + 26, 230, 11, 8, .25), '#ffffff', .5, False)], 'fino', mult=False)
        e.g([f'<g transform="rotate(-8 {n(vx_)} {n(vy_)})"><ellipse cx="{n(vx_)}" cy="{n(vy_)}" rx="70" ry="20" fill="#fff8ea" fill-opacity=".95"/><path d="M{n(vx_ - 40)} {n(vy_)} L{n(vx_ + 50)} {n(vy_ - 12)} L{n(vx_ + 50)} {n(vy_ + 12)} Z" fill="#e8453c" fill-opacity=".92"/></g>'], 'fino', mult=False)
    # rocas en la orilla
    e.g([e.p(e.blob(x, y, s, s * .7, 7, .3), c, .92, False) for (x, y, s, c) in ((1280, 640, 26, "#8a8f94"), (1325, 665, 17, "#a9adb0"), (520, 590, 20, "#8a8f94"), (1210, 470, 14, "#a9adb0"))], "fino", mult=False)
    # muelle de madera hacia la izquierda con lancha amarrada
    tab = []
    for i in range(16):
        t = i / 15
        x = 520 - t * 250
        y = 680 + t * 110
        tab.append(f'<g transform="rotate(-24 {n(x)} {n(y)})"><rect x="{n(x - 6)}" y="{n(y - 24)}" width="14" height="48" fill="#8a5a34" fill-opacity=".95"/></g>')
    e.g(tab, "fino", mult=False)
    e.g([f'<g transform="rotate(-62 190 860)"><ellipse cx="190" cy="860" rx="70" ry="24" fill="#8a4b2c" fill-opacity=".95"/>'
         f'<ellipse cx="196" cy="860" rx="52" ry="14" fill="#e9c48a" fill-opacity=".95"/></g>'], "fino", mult=False)
    # toalla y sombrilla
    e.g([f'<g transform="rotate(-12 1010 590)"><rect x="960" y="560" width="100" height="56" fill="#2f7f8f" fill-opacity=".9"/><rect x="960" y="574" width="100" height="10" fill="#fff8ea" fill-opacity=".8"/></g>'], "fino", mult=False)
    e.g(sombrilla(e, 1120, 520, 62), "fino", mult=False)
    # palmeras de distinto tamaño, torcidas y desparejas
    sombras, copas = [], []
    for (x, y, s, ln) in ((700, 560, 175, (60, 40)), (905, 505, 120, (40, 30)), (1015, 640, 80, (24, 16)), (610, 610, 70, (22, 14)), (810, 650, 52, (18, 12)), (1170, 590, 60, (20, 14))):
        sh, hj = vista_palmera(e, x, y, s, ln)
        sombras += sh
        copas += hj
    e.g(sombras, "fino")
    e.g(copas, "fino", mult=False)
    # una lancha a lo lejos con su estela
    bx, by = 1560, 440
    e.g([e.p(e.blob(bx + 170, by + 38, 210, 12, 8, .25), "#ffffff", .55, False), e.p(e.blob(bx + 120, by + 24, 150, 7, 8, .25), "#ffffff", .5, False)], "fino", mult=False)
    e.g([f'<g transform="rotate(-14 {bx} {by})"><ellipse cx="{bx}" cy="{by}" rx="54" ry="19" fill="#fff8ea" fill-opacity=".95"/><ellipse cx="{bx - 4}" cy="{by}" rx="38" ry="10" fill="#2f7f8f" fill-opacity=".9"/></g>'], "fino", mult=False)
    e.g([e.linea(f"M{n(x)} {n(y)} q18 -6 36 0 q18 6 36 0", "#e6fffb", 3, r.uniform(.3, .6)) for x, y in ((r.uniform(0, W), r.uniform(-DY, H)) for _ in range(150))], "fino", mult=False)
    e.g(e.salpicar(30, "#ffffff", 0, -DY, W, H, 5, .6), "fino", mult=False)
    return e


# ---------------------------------------------------------------- ROJO: una banca bajo el arce, con el parque desenfocado detrás
def hoja_arce(e, x, y, s, rot, col, op=.88):
    pts = []
    for i in range(10):
        a = rot + i * math.pi / 5
        rad = s if i == 0 else (s * .92 if i in (2, 8) else s * .74) if i % 2 == 0 else s * .42
        pts.append((x + math.cos(a) * rad, y + math.sin(a) * rad))
    d = "M" + " L".join(f"{n(px)} {n(py)}" for px, py in pts) + "Z"
    return [e.p(d, col, op, False, 1), e.linea(f"M{n(x)} {n(y)} L{n(x - math.cos(rot) * s * .55)} {n(y - math.sin(rot) * s * .55)}", "#6a3a20", max(1.5, s * .06), .7)]


ROJOS = ["#c8281e", "#a21c24", "#e5502a", "#d8321e", "#f08a2a"]


def rojo():
    e = Esc(83, "#fbf1e6")
    r = e.r
    e.g([e.full(e.grad([(0, "#f2a77a"), (.45, "#f9c999"), (1, "#fde3b4")]))])
    # parque desenfocado al fondo (bokeh y copas lejanas)
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(-DY, 640), r.uniform(120, 260), r.uniform(80, 180), 9, .3), r.choice(ROJOS + ["#f2b134"]), .4, False) for _ in range(24)], "brillo", mult=False)
    e.g([e.circ(r.uniform(0, W), r.uniform(-DY, 800), r.uniform(26, 80), r.choice(["#ffd88a", "#ff9a4a", "#ff6a4a", "#fff0c0"]), r.uniform(.25, .5)) for _ in range(34)], "bokeh", mult=False)
    e.g([f'<polygon points="500,{-DY - 50} 700,{-DY - 50} 1000,{H} 640,{H}" fill="#fff3cf" fill-opacity=".28"/>',
         f'<polygon points="900,{-DY - 50} 1040,{-DY - 50} 1500,{H} 1180,{H}" fill="#fff3cf" fill-opacity=".2"/>'], "brillo", mult=False)
    # suelo con alfombra de hojas
    e.g([e.p(e.cresta(780, 22, 260), "#d9964a", .95)], mult=False)
    e.g([e.p(e.cresta(880, 20, 260), "#e8b36a", .95)], mult=False)
    suelo = []
    for _ in range(300):
        y = r.uniform(800, H + 20)
        k = (y - 780) / (H - 780)
        suelo += hoja_arce(e, r.uniform(0, W), y, r.uniform(8, 20) * (.5 + k), r.uniform(0, 6.28), r.choice(ROJOS + ["#f2b134"]), r.uniform(.55, .85))
    e.g(suelo, "fino", mult=False)
    # tronco grande a la derecha: se pierde hacia arriba
    izq, der = [], []
    for k in range(10):
        t = k / 9
        y = -DY - 60 + (900 + DY + 60) * t
        w = 190 + 120 * (t ** 3) + 14 * math.sin(t * 9)
        c = 1230 + 14 * math.sin(t * 5)
        izq.append((c - w / 2, y))
        der.append((c + w / 2, y))
    e.g([e.p(suave(izq + der[::-1], True), "#5a3a2e", .96)], "fino", mult=False)
    corteza = []
    for _ in range(46):
        t0 = r.uniform(0, .8)
        y0 = -DY + (900 + DY) * t0
        x0 = r.uniform(1130, 1330)
        corteza.append(e.linea(f"M{n(x0)} {n(y0)} q{n(r.uniform(-8, 8))} 60 {n(r.uniform(-6, 6))} {n(r.uniform(90, 200))}", r.choice(["#3a2420", "#8a6a54", "#2a1810"]), r.uniform(2, 6), .45))
    for sg in (-1, 1):
        for _ in range(3):
            corteza.append(e.linea(f"M{n(1230 + sg * r.uniform(110, 140))} 880 q{n(sg * 70)} 20 {n(sg * r.uniform(150, 260))} {n(r.uniform(80, 120))}", "#5a3a2e", r.uniform(16, 34), .9))
    e.g(corteza, "fino", mult=False)
    # rama larga hacia la banca
    e.g([e.linea("M1180 330 Q1000 250 760 170", "#4a2f2a", 48, .95), e.linea("M1180 330 Q1000 250 760 170", "#6a4a3a", 14, .6),
         e.linea("M980 250 Q900 330 840 380", "#4a2f2a", 18, .9), e.linea("M860 195 Q800 140 720 130", "#4a2f2a", 14, .9)], "fino", mult=False)
    # copa
    copas = []
    for _ in range(46):
        x, y = r.uniform(520, 1920), r.uniform(-DY - 40, 360)
        s = r.uniform(120, 250)
        copas.append(e.p(e.blob(x, y, s * 1.2, s * .8, 8, .28), r.choice(ROJOS + ["#f2b134"]), r.uniform(.55, .8), False))
    for _ in range(int(DY / 45)):
        x, y = r.uniform(VX - 60, VX + CW + 60), r.uniform(-DY - 40, 40)
        s = r.uniform(120, 230)
        copas.append(e.p(e.blob(x, y, s * 1.2, s * .85, 8, .28), r.choice(ROJOS + ["#f2b134"]), r.uniform(.6, .85), False))
    e.g(copas)
    colgantes = []
    for _ in range(46):
        colgantes += hoja_arce(e, r.uniform(500, 1500), r.uniform(230, 520), r.uniform(26, 50), r.uniform(0, 6.28), r.choice(ROJOS + ["#f2b134"]))
    e.g(colgantes, "fino", mult=False)
    # banca de parque
    madera, oscuro = "#8a5a34", "#3a2a22"
    e.g([e.linea("M470 700 L470 930", oscuro, 16, .95), e.linea("M900 700 L900 930", oscuro, 16, .95),
         e.linea("M470 880 L440 960", oscuro, 12, .95), e.linea("M900 880 L930 960", oscuro, 12, .95),
         e.linea("M520 880 L500 940", oscuro, 10, .8), e.linea("M850 880 L870 940", oscuro, 10, .8)], "fino", mult=False)
    tablas = []
    for y, h_ in ((720, 34), (772, 34)):
        tablas.append(e.p(f"M455 {y} L915 {y} L915 {y + h_} L455 {y + h_} Z", madera, .97, True, 2))
    for y, d in ((850, 0), (884, 0), (918, 0)):
        tablas.append(e.p(f"M440 {y} L930 {y} L944 {y + 26} L426 {y + 26} Z", "#9a6a40" if y == 884 else madera, .97, True, 2))
    e.g(tablas, "fino", mult=False)
    sobre = []
    for _ in range(22):
        sobre += hoja_arce(e, r.uniform(470, 900), r.uniform(850, 925), r.uniform(14, 26), r.uniform(0, 6.28), r.choice(ROJOS + ["#f2b134"]))
    e.g(sobre, "fino", mult=False)
    # hojas cayendo
    caen = []
    for _ in range(46):
        caen += hoja_arce(e, r.uniform(0, W), r.uniform(-DY, 880), r.uniform(18, 34), r.uniform(0, 6.28), r.choice(ROJOS + ["#f2b134"]), .88)
    e.g(caen, "fino", mult=False)
    # hojas grandes desenfocadas en primer plano
    gr = []
    for (x, y, s) in ((150, 980, 150), (1750, 880, 120), (1010, -DY + 200, 140)):
        gr += hoja_arce(e, x, y, s, r.uniform(0, 6.28), r.choice(ROJOS), .8)
    e.g(gr, "bokeh", mult=False)
    return e


# ---------------------------------------------------------------- AURORA: desde dentro de la tienda de campaña
def pino(e, x, base, alto, c, op):
    ancho = alto * .38
    der = [(x, base - alto)]
    for i in range(1, 5):
        t = i / 4
        der += [(x + ancho * t * .5, base - alto * (1 - t) + alto * .08), (x + ancho * t * .28, base - alto * (1 - t) + alto * .02)]
    der += [(x + ancho * .52, base)]
    izq = [(2 * x - px, py) for px, py in der[:0:-1]]
    return e.p(suave(der + izq, True), c, op, False)


def llama(fx, fy, s):
    return (f"M{n(fx - 38 * s)} {n(fy)} C{n(fx - 52 * s)} {n(fy - 60 * s)} {n(fx - 12 * s)} {n(fy - 90 * s)} {n(fx - 4 * s)} {n(fy - 160 * s)} "
            f"C{n(fx + 22 * s)} {n(fy - 96 * s)} {n(fx + 58 * s)} {n(fy - 56 * s)} {n(fx + 38 * s)} {n(fy)} Z")


def aurora():
    e = Esc(97, "#eef4f4")
    r = e.r
    hz = 690
    fx, fy = 1030, 930                      # la fogata
    e.g([e.full(e.grad([(0, "#050c26"), (.5, "#0c2f4c"), (1, "#145a66")]))])
    e.g([e.circ(r.uniform(380, 1540), r.uniform(-DY, 560), r.uniform(1.4, 3.6), "#f4fffb", r.uniform(.5, .98)) for _ in range(130)], "fino", mult=False)
    # aurora: cortinas anchas + rayos verticales
    cortinas, rayos = [], []
    cols = ["#3cf2a2", "#35d6d8", "#7be8c8", "#9a86ff", "#3cf2a2"]
    for i, col in enumerate(cols):
        pts = [(x, 150 + 60 * i + math.sin(x / 190 + i * 1.3) * 95 + r.uniform(-18, 18)) for x in range(300, 1700, 140)]
        g = e.grad([(0, col), (.6, col), (1, "#06122e")], 0, 1)
        cortinas.append(f'<path d="{suave(pts)} L1700 {hz} L300 {hz} Z" fill="{g}" fill-opacity=".62"/>')
        for _ in range(16):
            x = r.uniform(380, 1540)
            y0 = 150 + 60 * i + math.sin(x / 190 + i * 1.3) * 95
            rayos.append(e.linea(f"M{n(x)} {n(y0)} L{n(x + r.uniform(-20, 20))} {n(y0 + r.uniform(160, 330))}", col, r.uniform(7, 16), r.uniform(.15, .3)))
    e.g(cortinas, "brillo", mult=False)
    e.g(rayos, "bokeh", mult=False)
    # montañas con nieve y reflejo en el lago
    e.g([e.p(e.cresta(hz - 100, 70, 170, 300, 1700, hz + 4), "#2a5878", .92)], mult=False)
    e.g([e.p(e.cresta(hz - 50, 40, 150, 300, 1700, hz + 4), "#1b3d56", .95)], mult=False)
    e.g([e.p(e.blob(r.uniform(420, 1500), hz - 105 + r.uniform(-30, 30), r.uniform(50, 100), 12, 7, .3), "#dff6f4", .55, False) for _ in range(7)], "fino", mult=False)
    e.g([e.p(f"M300 {hz} L1700 {hz} L1700 {H + 100} L300 {H + 100} Z", e.grad([(0, "#2a8a8a"), (.45, "#12485e"), (1, "#06182f")]), 1, False)], mult=False)
    e.g([e.p(e.blob(r.uniform(520, 1400), hz + 30 + i * 22, r.uniform(160, 340), 7 + i * .6, 8, .3), cols[i % 4], .3, False) for i in range(10)], "fino", mult=False)
    # orilla con nieve y pinos
    e.g([e.p(e.cresta(850, 24, 170, 300, 1700, H + 100), "#07181c", .97)], mult=False)
    e.g([e.p(e.blob(r.uniform(420, 1500), r.uniform(880, 1020), r.uniform(70, 170), r.uniform(10, 24), 8, .3), "#bfd8e0", .4, False) for _ in range(9)], mult=False)
    pinos = [pino(e, r.uniform(430, 1500), hz + r.uniform(0, 30), r.uniform(70, 190), "#07201f", .9) for _ in range(22)]
    pinos += [pino(e, x, 880 + r.uniform(0, 30), a, "#041411", .95) for x, a in ((470, 420), (590, 300), (1450, 400), (1330, 280))]
    e.g(pinos, "fino", mult=False)
    # fogata en la orilla
    halo(e, fx, fy - 60, 330, "#ffb040", .85)
    e.g([e.p(e.blob(fx + math.cos(a) * 112, fy + 6 + math.sin(a) * 34, r.uniform(15, 24), 12, 7, .3), r.choice(["#6a7077", "#8a9096", "#555b61"]), .95, False)
         for a in [i * math.pi / 5 + r.uniform(-.1, .1) for i in range(10)]], "fino", mult=False)
    e.g([e.linea(f"M{fx - 80} {fy + 14} L{fx + 70} {fy - 14}", "#3a2418", 26, .95), e.linea(f"M{fx + 80} {fy + 14} L{fx - 70} {fy - 14}", "#2a180e", 24, .95)], "fino", mult=False)
    e.g([e.p(llama(fx, fy, 1), "#e8531c", .92, False), e.p(llama(fx + 6, fy, .72), "#ff9a2a", .94, False), e.p(llama(fx + 2, fy, .42), "#ffe27a", .96, False)], "fino", mult=False)
    e.g([e.circ(fx + r.uniform(-80, 110), fy - r.uniform(120, 360), r.uniform(2, 5), r.choice(["#ffd27a", "#ff9a2a"]), r.uniform(.5, 1)) for _ in range(26)], "fino", mult=False)
    # tela de la tienda: todo lo que queda fuera de la entrada
    arco = suave([(290, H + 160), (370, 780), (500, 450), (740, 250), (960, 190), (1180, 250), (1420, 450), (1550, 780), (1630, H + 160)], True)
    e.b.append(f'<path d="M-400 {-DY - 400} H{W + 400} V{H + 400} H-400 Z {arco}" fill="#0c1326" fill-opacity=".97" fill-rule="evenodd"/>')
    # costuras y pliegues
    cost = []
    for x in range(-200, 2200, 190):
        cost.append(e.linea(f"M{x} {-DY - 60} L{n(960 + (x - 960) * .72)} 170", "#1b274a", 5, .6))
    e.g(cost, "fino", mult=False)
    e.g([e.p(e.blob(r.choice([180, 1760]), r.uniform(150, 800), 150, 420, 8, .2), "#1a2442", .5, False) for _ in range(6)], "fino", mult=False)
    puntadas = f'<path d="{arco}" fill="none" stroke="#ffb55a" stroke-opacity=".45" stroke-width="3" stroke-dasharray="14 12"/>'
    e.g([e.linea(arco, "#ffb55a", 9, .3), puntadas], "fino", mult=False)
    # la luz de la fogata baña la tela de abajo
    halo(e, fx, fy, 620, "#ff9a3a", .5)
    # farol colgado
    lx, ly = 520, 400
    halo(e, lx, ly + 26, 330, "#ffb040", .75)
    e.g([e.linea(f"M{lx} {-DY - 60} L{lx} {ly - 22}", "#2a2018", 4, .9), e.p(e.blob(lx, ly + 22, 26, 38, 8, .1), "#ffd27a", .96, False),
         e.p(f"M{lx - 20} {ly - 12} L{lx + 20} {ly - 12} L{lx + 14} {ly - 26} L{lx - 14} {ly - 26} Z", "#3a2a1a", .95, False)], "fino", mult=False)
    # saco de dormir, botas y taza con vapor en primer plano
    e.g([e.p(e.blob(150, 1010, 440, 160, 11, .13, -.1), "#b4482a", .97, False)], "fino", mult=False)
    e.g([e.linea(f"M{x} 880 Q{x + 20} 1010 {x - 10} 1120", "#7a2a14", 4, .55) for x in (-40, 80, 200, 320, 440)], "fino", mult=False)
    e.g([e.p(e.blob(560, 1040, 54, 30, 8, .2, -.3), "#3a2a1a", .96, False), e.p(e.blob(640, 1062, 50, 28, 8, .2, -.2), "#2a1c10", .96, False)], "fino", mult=False)
    mx, my = 1640, 1010
    e.g([e.p(f"M{mx - 34} {my - 40} L{mx + 34} {my - 40} L{mx + 28} {my + 36} L{mx - 28} {my + 36} Z", "#d9d2c4", .96, False), e.linea(f"M{mx + 34} {my - 20} q34 8 0 40", "#d9d2c4", 8, .95),
         e.linea(f"M{mx - 14} {my - 64} q-12 -30 8 -56 q14 -22 -6 -48", "#ffffff", 5, .4), e.linea(f"M{mx + 8} {my - 64} q14 -30 -6 -56", "#ffffff", 4, .3)], "fino", mult=False)
    return e


# ---------------------------------------------------------------- GRIS: puente colgante que se pierde en la niebla
def niebla():
    e = Esc(101, "#f1f2f1")
    r = e.r
    hz, cx = 560, 960
    half = lambda y: (y - hz) * .62
    e.g([e.full(e.grad([(0, "#bfcad6"), (.5, "#dde3e8"), (1, "#eef0ee")]))])
    halo(e, 1250, 250, 340, "#ffffff", .85)
    e.g([e.p(e.blob(1250, 250, 80, 80, 11, .03), "#fbfbf6", .9, False)], "fino", mult=False)
    capas = [(380, 80, "#9fb0c4", .5), (440, 60, "#8498b0", .55), (500, 45, "#6a809c", .62)]
    for (b, a, c, op) in capas:
        e.g([e.p(e.cresta(b, a, 230), c, op)])
        e.g([e.p(e.blob(r.uniform(300, 1700), b + 60, r.uniform(380, 640), r.uniform(24, 44), 9, .25), "#f4f6f7", .7, False) for _ in range(3)], mult=False)
    # abismo bajo el puente, con bruma
    e.g([e.p(f"M-100 {hz - 10} L{W + 100} {hz - 10} L{W + 100} {H + 100} L-100 {H + 100} Z", e.grad([(0, "#e4e9ed"), (.5, "#a8b6c6"), (1, "#5a7090")]), .95, False)], mult=False)
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(hz + 40, H), r.uniform(300, 600), r.uniform(20, 40), 9, .25), "#f4f6f7", .6, False) for _ in range(7)], mult=False)
    # riscos a los lados
    e.g([e.p(suave([(-100, 320), (240, 420), (520, 640), (640, H + 100), (-100, H + 100)], True), "#2c4260", .88, False),
         e.p(suave([(W + 100, 320), (1680, 420), (1400, 640), (1280, H + 100), (W + 100, H + 100)], True), "#2c4260", .88, False)], mult=False)
    # tablero del puente en perspectiva
    yb = H + 60
    e.g([e.p(f"M{cx - 5} {hz} L{cx + 5} {hz} L{cx + half(yb)} {yb} L{cx - half(yb)} {yb} Z", "#9a7a54", .95, False)], mult=False)
    tablas = []
    for i in range(1, 38):
        t = (i / 38) ** 2.0
        y = hz + (yb - hz) * t
        hw = half(y)
        tablas.append(e.linea(f"M{n(cx - hw)} {n(y)} L{n(cx + hw)} {n(y)}", "#4a3322", 1.5 + t * 11, .65))
    e.g(tablas, "fino", mult=False)
    # barandillas: postes y cuerdas
    cuerdas_i, cuerdas_d, postes = [], [], []
    for j in range(0, 11):
        t = (j / 10) ** 1.9
        y = hz + (yb - hz) * t
        k = (y - hz) / (yb - hz)
        alto = 190 * k + 6
        for sg, lst in ((-1, cuerdas_i), (1, cuerdas_d)):
            x = cx + sg * (half(y) + 10)
            postes.append(e.linea(f"M{n(x)} {n(y)} L{n(x)} {n(y - alto)}", "#4a3322", 3 + 11 * k, .9))
            lst.append((x, y - alto))
    for lst in (cuerdas_i, cuerdas_d):
        postes.append(e.linea(suave(lst), "#6a4a30", 5, .9))
        # cuerda baja
        postes.append(e.linea(suave([(x, y + (yb - y) * 0 + (a_ * 0.55)) for (x, y), a_ in zip(lst, [0] * len(lst))]), "#6a4a30", 3, .5))
    e.g(postes, "fino", mult=False)
    # niebla que se come el fondo del puente
    halo(e, cx, hz + 10, 360, "#f1f4f6", 1)
    e.g([e.p(e.blob(cx + r.uniform(-300, 300), r.uniform(hz - 30, hz + 90), r.uniform(260, 460), r.uniform(18, 34), 9, .25), "#f7f8f8", .8, False) for _ in range(4)], mult=False)
    e.g([e.p(e.blob(r.uniform(0, W), r.uniform(900, 1040), r.uniform(380, 620), r.uniform(24, 40), 9, .25), "#f4f6f7", .5, False) for _ in range(3)], mult=False)
    e.g(e.salpicar(30, "#ffffff", 0, 0, W, H, 5, .6), "fino", mult=False)
    return e


ESCENAS = dict(amarillo=amarillo, azul=azul, rosado=rosado, verde=verde, morado=morado, naranja=naranja,
               turquesa=turquesa, rojo=rojo, aurora=aurora, niebla=niebla)

def cielo_extra(nombre, e):
    """Cielo añadido por encima de la escena en la versión vertical."""
    r = e.r
    x0, x1, y0, y1 = VX - 80, VX + CW + 80, -DY, 0
    noche = nombre in ("azul", "morado", "aurora")
    if noche:
        e.g([e.circ(r.uniform(x0, x1), r.uniform(y0, y1 - 40), r.uniform(1.4, 3.6), "#fffdf0", r.uniform(.45, .95)) for _ in range(150)], "fino", mult=False)
    nubes = {"amarillo": "#fffaf0", "naranja": "#fff1d6", "rosado": "#ffc4da", "verde": "#e9f8d2", "azul": "#2a4d9b", "morado": "#d2aef0", "turquesa": "#ffffff", "rojo": "#ffd9b0", "aurora": "#2a7a82", "niebla": "#f4f6f7"}[nombre]
    op = .2 if noche else .7
    e.g([e.p(e.blob(r.uniform(x0, x1), r.uniform(y0 + 60, y1 - 120), r.uniform(190, 340), r.uniform(26, 50), 9, .22), nubes, op * r.uniform(.6, 1), False)
         for _ in range(9)], mult=False)
    if nombre == "naranja":
        e.g([e.linea(f"M{x} {y} q7 -9 14 0 q7 -9 14 0", "#5a2a44", 2.2, .75) for x, y in ((VX + 300, -700), (VX + 335, -678), (VX + 800, -1000))], "fino")
    e.g(e.salpicar(40, "#fffaf0", x0, y0, x1, y1, 5, .6), "fino", mult=False)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    nombres = [a for a in sys.argv[1:] if not a.startswith("--")]
    for nombre, fn in ESCENAS.items():
        if nombres and nombre not in nombres:
            continue
        if VERT:
            VX = X0[nombre]
        e = fn()
        if VERT and nombre not in ("turquesa", "rojo", "aurora"):
            cielo_extra(nombre, e)
        with open(os.path.join(OUT, f"{nombre}{'-v' if VERT else ''}.svg"), "w", encoding="utf-8") as fh:
            fh.write(e.svg())
        print("ok", nombre)
