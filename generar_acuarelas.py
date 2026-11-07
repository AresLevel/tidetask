"""Genera los fondos en acuarela (SVG con filtros) en img/. Uso: python generar_acuarelas.py
Técnica: lavados translúcidos que se multiplican (como veladuras), bordes que se corren por
desplazamiento de turbulencia, pigmento granulado y textura de papel por encima."""
import math, os, random

W, H = 1920, 1080
AQUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(AQUI, "img")


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
        return f'<rect x="-100" y="-100" width="{W + 200}" height="{H + 200}" fill="{fill}" fill-opacity="{op}"/>'

    def salpicar(s, n_, c, x0, y0, x1, y1, rmax=7, op=.5):
        out = []
        for _ in range(n_):
            out.append(s.circ(s.r.uniform(x0, x1), s.r.uniform(y0, y1), s.r.uniform(1.5, rmax), c, op * s.r.uniform(.5, 1)))
        return out

    def svg(s):
        defs = "".join(s.defs)
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
            f'<defs>{defs}'
            # lavado: bordes que se corren + pigmento granulado
            f'<filter id="agua" filterUnits="userSpaceOnUse" x="-150" y="-150" width="{W + 300}" height="{H + 300}">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.011 0.015" numOctaves="3" seed="4" result="t"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="t" scale="38" xChannelSelector="R" yChannelSelector="G" result="d"/>'
            f'<feGaussianBlur in="d" stdDeviation="1.3" result="b"/>'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="9" result="gr"/>'
            f'<feColorMatrix in="gr" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.3 1.55" result="ga"/>'
            f'<feComposite in="b" in2="ga" operator="in"/></filter>'
            # detalles pequeños: menos desplazamiento
            f'<filter id="fino" filterUnits="userSpaceOnUse" x="-150" y="-150" width="{W + 300}" height="{H + 300}">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="2" result="t"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/>'
            f'<feGaussianBlur in="d" stdDeviation=".7"/></filter>'
            f'<filter id="brillo" filterUnits="userSpaceOnUse" x="-150" y="-150" width="{W + 300}" height="{H + 300}">'
            f'<feGaussianBlur stdDeviation="28"/></filter>'
            f'<filter id="bokeh" filterUnits="userSpaceOnUse" x="-150" y="-150" width="{W + 300}" height="{H + 300}">'
            f'<feGaussianBlur stdDeviation="9"/></filter>'
            f'<filter id="papel" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="5" result="n"/>'
            f'<feDiffuseLighting in="n" lighting-color="#fffaf0" surfaceScale="1.8"><feDistantLight azimuth="45" elevation="62"/></feDiffuseLighting></filter>'
            f'<filter id="manchas" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="0.0035 0.005" numOctaves="3" seed="12" result="n"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 .9  0 0 0 0 .82  0 0 0 0 .7  0 0 0 1.4 -.45"/></filter>'
            f'</defs>'
            f'<rect width="{W}" height="{H}" fill="{s.papel}"/>'
            + "".join(s.b) +
            f'<rect width="{W}" height="{H}" filter="url(#manchas)" style="mix-blend-mode:multiply" opacity=".55"/>'
            f'<rect width="{W}" height="{H}" filter="url(#papel)" style="mix-blend-mode:multiply" opacity=".55"/>'
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
    e.g([f'<polygon points="{x},-50 {x + 160},-50 {x + 160 + 520},{H} {x + 520},{H}" fill="#fffbe0" fill-opacity=".34"/>'
         for x in (150, 520, 900)], "brillo", mult=False)
    # troncos lejanos -> cercanos
    e.g([tronco(e, r.uniform(0, W), r.uniform(26, 44), -60, hz + 20, "#9fc294", .35) for _ in range(16)])
    e.g([tronco(e, r.uniform(0, W), r.uniform(48, 80), -60, hz + 60, "#6aa073", .5) for _ in range(9)])
    # suelo y camino sinuoso en perspectiva
    e.g([e.p(e.cresta(hz + 20, 18, 300), "#86bd78", .7)])
    e.g([e.p(suave([(930, hz + 6), (1000, hz + 6), (1050, 830), (1420, H + 90), (480, H + 90), (820, 850)], True), "#f0e4b8", .8)])
    e.g([e.p(e.blob(250, 930, 380, 150, 9, .2), "#4e9a62", .6), e.p(e.blob(1680, 940, 400, 150, 9, .2), "#4e9a62", .6)])
    # troncos grandes en primer plano + copa
    for x, a in ((120, 150), (1760, 170), (1480, 95), (440, 80)):
        e.g([tronco(e, x, a, -80, H + 60, "#2e5a3f", .72), tronco(e, x + a * .15, a * .35, -80, H + 60, "#1f4430", .35)])
    copas = []
    for _ in range(26):
        copas.append(e.p(e.blob(r.uniform(-50, W + 50), r.uniform(-60, 120), r.uniform(120, 260), r.uniform(60, 120), 9, .3), r.choice(["#3f7d52", "#2f6a46", "#58935c"]), .5, False))
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


ESCENAS = dict(amarillo=amarillo, azul=azul, rosado=rosado, verde=verde, morado=morado, naranja=naranja)

if __name__ == "__main__":
    import sys
    os.makedirs(OUT, exist_ok=True)
    for nombre, fn in ESCENAS.items():
        if len(sys.argv) > 1 and nombre not in sys.argv[1:]:
            continue
        with open(os.path.join(OUT, f"{nombre}.svg"), "w", encoding="utf-8") as fh:
            fh.write(fn().svg())
        print("ok", nombre)
