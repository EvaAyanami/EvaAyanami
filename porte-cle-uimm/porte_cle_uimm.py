"""
Porte-cle UIMM Pole Formation - La Fabrique de l'Avenir
Genere porte_cle_uimm.step (TopSolid) et porte_cle_uimm.stl (impression 3D).
Usage : pip install cadquery && python porte_cle_uimm.py
Toutes les cotes sont en mm. Origine = coin bas-gauche, Z=0 = dessous.
"""
import cadquery as cq

# ---------------- PARAMETRES ----------------
L, H, EP = 60.0, 40.0, 8.0            # 60 x 40, epaisseur 8
CHF_BG = (15.0, 20.0)                 # pan coupe bas-gauche (sur X, sur Y)
CHF_HD = (14.0, 10.0)                 # pan coupe haut-droite (sur X, sur Y)
R_ANGLES = 1.5                        # conge des aretes verticales
CHF_DESSUS = 1.2                      # chanfrein contour dessus (45 deg)
CHF_DESSOUS = 0.5                     # chanfrein contour dessous (anti patte d'elephant)
CHF_TROU = 0.8                        # chanfrein du percage (dessus et dessous)
CHF_LOGO = 0.6                        # chanfrein bord de la cuvette du logo
TROU_D, TROU_X, TROU_Y = 5.0, 6.0, 34.0   # percage anneau (haut gauche)

GRAVURE = 3.5                         # profondeur gravure du texte
# Logo en escalier : 3 bandes a des niveaux differents (profondeur depuis le dessus)
LOGO_X0, LOGO_X1 = 14.0, 46.0         # largeur logo 32 mm, centre X=30
BANDES = [  # (y_bas, y_haut, profondeur de la marche)
    (25.0, 36.0, 1.0),   # UIMM
    (18.0, 25.0, 2.0),   # PÔLE FORMATION
    (4.0, 18.0, 3.0),    # LA FABRIQUE / DE L'AVENIR
]
POLICE = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
MARGE_TXT = 1.5                       # marge texte / bord de bande

# ---------------- CORPS ----------------
bx, by = CHF_BG
hx, hy = CHF_HD
contour = [(bx, 0), (L, 0), (L, H - hy), (L - hx, H), (0, H), (0, by)]
corps = cq.Workplane("XY").polyline(contour).close().extrude(EP)
corps = corps.edges("|Z").fillet(R_ANGLES)
corps = corps.faces(">Z").chamfer(CHF_DESSUS)
corps = corps.faces("<Z").chamfer(CHF_DESSOUS)
corps = corps.cut(
    cq.Workplane("XY").center(TROU_X, TROU_Y).circle(TROU_D / 2).extrude(EP)
)

# ---------------- CHANFREIN du bord de la cuvette du logo (45 deg) ----------------
lw, lh = LOGO_X1 - LOGO_X0, BANDES[0][1] - BANDES[-1][0]
lc = ((LOGO_X0 + LOGO_X1) / 2, (BANDES[0][1] + BANDES[-1][0]) / 2)
sur = 0.5  # depasse au-dessus du dessus pour une coupe propre
corps = corps.cut(
    cq.Workplane("XY").workplane(offset=EP - CHF_LOGO).center(*lc).rect(lw, lh)
    .workplane(offset=CHF_LOGO + sur).rect(lw + 2 * (CHF_LOGO + sur), lh + 2 * (CHF_LOGO + sur))
    .loft()
)

# ---------------- MARCHES (escalier) ----------------
for y0, y1, d in BANDES:
    marche = (cq.Workplane("XY").workplane(offset=EP - d)
              .center((LOGO_X0 + LOGO_X1) / 2, (y0 + y1) / 2)
              .rect(LOGO_X1 - LOGO_X0, y1 - y0).extrude(d + 1))
    corps = corps.cut(marche)

# ---------------- CHANFREINS percage + bord du logo ----------------
e = 0.01
corps = corps.edges(cq.selectors.AndSelector(
    cq.selectors.TypeSelector("CIRCLE"),
    cq.selectors.BoxSelector((TROU_X - 1, TROU_Y - 1, -e), (TROU_X + 1, TROU_Y + 1, EP + e)))
).chamfer(CHF_TROU)


def ajuste(sol, x0, x1, y0, y1):
    """Met a l'echelle (uniforme) et centre un solide dans un cadre XY."""
    bb = sol.BoundingBox()
    k = min((x1 - x0) / bb.xlen, (y1 - y0) / bb.ylen)
    sol = sol.scale(k)
    bb = sol.BoundingBox()
    return sol.translate(cq.Vector((x0 + x1) / 2 - bb.center.x,
                                   (y0 + y1) / 2 - bb.center.y, 0))


def texte(txt):
    return (cq.Workplane("XY").text(txt, 10, 1, fontPath=POLICE,
                                    halign="center", valign="center")
            .val())


def lettres_uimm():
    """Lettres UIMM redessinees d'apres le logo (unites = pixels du logo, Y vers le bas)."""
    def poly(pts):
        return cq.Workplane("XY").polyline([(x, -y) for x, y in pts]).close().extrude(1)
    # U
    cx, cy, R, r = 187.5, 240, 84.5, 50
    u = poly([(103, 105), (137, 105), (137, 240), (103, 240)])
    u = u.union(poly([(237, 105), (272, 105), (272, 240), (237, 240)]))
    anneau = (cq.Workplane("XY").center(cx, -cy).circle(R).circle(r).extrude(1)
              .intersect(cq.Workplane("XY").center(cx, -cy - R).rect(2 * R + 2, 2 * R).extrude(1)))
    u = u.union(anneau)
    # 1 (I avec drapeau)
    i = poly([(327, 325), (362, 325), (362, 103), (355, 103), (327, 119)])
    # M
    def m(dx):
        return poly([(415 + dx, 325), (415 + dx, 103), (420 + dx, 103), (526 + dx, 210),
                     (632 + dx, 103), (638 + dx, 103), (638 + dx, 325), (603 + dx, 325),
                     (603 + dx, 183), (526 + dx, 258), (452 + dx, 183), (452 + dx, 325)])
    return u.union(i).union(m(0)).union(m(275)).val()


# ---------------- GRAVURES ----------------
contenus = [
    [lettres_uimm()],
    [texte("PÔLE FORMATION")],
    [texte("LA FABRIQUE"), texte("DE L'AVENIR")],
]
for (y0, y1, d), elems in zip(BANDES, contenus):
    x0, x1 = LOGO_X0 + MARGE_TXT, LOGO_X1 - MARGE_TXT
    ya, yb = y0 + MARGE_TXT, y1 - MARGE_TXT
    n = len(elems)
    pas = (yb - ya) / n
    for k, e in enumerate(elems):
        ly1 = yb - k * pas
        ly0 = ly1 - pas + (0.8 if n > 1 else 0)   # interligne
        sol = ajuste(e, x0, x1, ly0, ly1)
        # place en Z : du fond de gravure jusqu'au-dessus de la marche
        bb = sol.BoundingBox()
        z_fond = EP - d - GRAVURE
        sol = sol.transformGeometry(cq.Matrix([[1, 0, 0, 0], [0, 1, 0, 0],
                                               [0, 0, (GRAVURE + 1) / bb.zlen, 0]]))
        bb = sol.BoundingBox()
        sol = sol.translate(cq.Vector(0, 0, z_fond - bb.zmin))
        corps = corps.cut(cq.Workplane("XY").add(sol))

if __name__ == "__main__":
    import os
    d = os.path.dirname(os.path.abspath(__file__))
    cq.exporters.export(corps, os.path.join(d, "porte_cle_uimm.step"))
    cq.exporters.export(corps, os.path.join(d, "porte_cle_uimm.stl"),
                        tolerance=0.01, angularTolerance=0.1)
    s = corps.val()
    print("valide:", s.isValid(), "volume:", round(s.Volume(), 1), "mm3")
    bb = s.BoundingBox()
    print("encombrement:", round(bb.xlen, 2), round(bb.ylen, 2), round(bb.zlen, 2))
