"""Protrusion heights of riblet surfaces (Bechert & Bartenwerfer 1989; Luchini, Manzo & Pozzi 1991).

In the viscous limit, a riblet wall looks to the longitudinal (streamwise) flow like a flat wall
h_par below the riblet tips, and to the transverse (spanwise) flow like a flat wall h_perp below
the tips. The near-wall turbulent eddies induce spanwise motion, so the difference
    dh = h_par - h_perp
is how far the eddies are pushed away from the wall relative to the mean flow. Luchini's
theory gives a velocity shift dU+ = mu0 * dh+ (mu0 ~ 1) in the viscous regime (small s+).

Both problems are solved here on a uniform staggered grid over one riblet period:
  longitudinal:  Laplace(u) = 0,                       u = 0 on walls, du/dy = 1 far above
  transverse:    Stokes: Laplace(w,v) = grad p, div = 0, no-slip,     dw/dy = 1, v = 0 far above
Far above the riblets u -> y - y_tip + h_par and w -> y - y_tip + h_perp.

Usage: python3 protrusion.py            (runs the validation cases and the table in the report)
"""
import sys, json
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla


def mask_for(shape, n, h_over_s, t_over_s=0.0, ny_above=3.0):
    """Solid mask over one period: rows j (y up from the valley floor), cols i (z). Cell size d = 1/n (s = 1)."""
    h = h_over_s
    ny = int(round((h + ny_above) * n))
    d = 1.0 / n
    zc = (np.arange(n) + 0.5) * d
    yc = (np.arange(ny) + 0.5) * d
    Z, Y = np.meshgrid(zc, yc)
    zr = (Z - 0.5 * d) % 1.0
    zd = np.minimum(zr, 1 - zr)  # distance from the riblet crest, centred on cell 0 (periodic)
    if shape == 'flat':
        solid = np.zeros_like(Z, bool)
    elif shape == 'blade':  # thin blade, thickness t (at least one cell)
        tt = max(t_over_s, d)
        solid = (Y < h) & (zd < tt / 2 + 1e-9)
    elif shape == 'triangle':  # sawtooth: crest at z = 0, valleys at z = 1/2
        solid = Y < h * (1 - 2 * zd)
    elif shape == 'trapezoid':  # flat-bottomed groove, sloped walls, crest width t
        wall = 0.5 * (1 - t_over_s) * 0.35  # sloped-wall half-width
        top = t_over_s / 2
        prof = np.where(zd <= top, h, np.where(zd <= top + wall, h * (1 - (zd - top) / wall), 0.0))
        solid = Y < prof
    elif shape == 'scallop':  # thin blades with a semicircular-ish (cosh) valley
        tt = max(t_over_s, d)
        valley = h * (1 - np.sin(np.pi * np.clip(zd * 2, 0, 1)) ** 0.5) * 0.6
        solid = ((Y < h) & (zd < tt / 2)) | (Y < valley)
    else:
        raise ValueError(shape)
    return solid, ny, d


def longitudinal(solid, d):
    ny, n = solid.shape
    fluid = ~solid
    idx = -np.ones(solid.shape, int)
    idx[fluid] = np.arange(fluid.sum())
    rows, cols, vals = [], [], []
    b = np.zeros(fluid.sum())
    for j in range(ny):
        for i in range(n):
            k = idx[j, i]
            if k < 0:
                continue
            diag = 0.0
            for (jj, ii) in ((j, (i + 1) % n), (j, (i - 1) % n), (j + 1, i), (j - 1, i)):
                if jj == ny:  # top: du/dy = 1 -> ghost = u + d
                    b[k] -= d
                    continue
                if jj < 0 or solid[jj, ii]:  # wall at the face: ghost = -u
                    diag -= 2
                    continue
                diag -= 1
                rows.append(k); cols.append(idx[jj, ii]); vals.append(1.0)
            rows.append(k); cols.append(k); vals.append(diag)
    A = sp.csc_matrix((vals, (rows, cols)), shape=(fluid.sum(), fluid.sum()))
    u = spla.spsolve(A, b)
    U = np.zeros(solid.shape)
    U[fluid] = u
    top = U[-1][fluid[-1]].mean() + d / 2
    return top, U


def transverse(solid, d):
    """Staggered (MAC) Stokes solve. w on z-faces (left face of cell i), v on y-faces (bottom face of cell j)."""
    ny, n = solid.shape
    nW = ny * n
    nV = (ny + 1) * n
    nP = ny * n
    N = nW + nV + nP
    W = lambda j, i: j * n + (i % n)
    V = lambda j, i: nW + j * n + (i % n)
    P = lambda j, i: nW + nV + j * n + (i % n)
    S = lambda j, i: True if j < 0 else (False if j >= ny else bool(solid[j, i % n]))
    wBlocked = lambda j, i: j < 0 or j >= ny or S(j, i - 1) or S(j, i)
    vBlocked = lambda j, i: j <= 0 or j >= ny or S(j - 1, i) or S(j, i)
    rows, cols, vals = [], [], []
    b = np.zeros(N)
    add = lambda r, c, v: (rows.append(r), cols.append(c), vals.append(v))
    # w momentum
    for j in range(ny):
        for i in range(n):
            r = W(j, i)
            if wBlocked(j, i):
                add(r, r, 1.0); continue
            diag = 0.0
            for ii in (i - 1, i + 1):  # z neighbours: normal-wall faces have w = 0 at their own location
                diag -= 1
                if not wBlocked(j, ii):
                    add(r, W(j, ii), 1.0)
            for jj in (j - 1, j + 1):  # y neighbours
                if jj == ny:
                    diag -= 1; add(r, r, 0.0); diag += 1; b[r] -= d  # ghost = w + d
                    continue
                if wBlocked(jj, i):
                    diag -= 2  # tangential wall at the shared face: ghost = -w
                else:
                    diag -= 1; add(r, W(jj, i), 1.0)
            add(r, r, diag)
            # - dp/dz * d^2 -> -(p_i - p_{i-1}) * d
            add(r, P(j, i), -d); add(r, P(j, i - 1), d)
    # v momentum
    for j in range(ny + 1):
        for i in range(n):
            r = V(j, i)
            if vBlocked(j, i):
                add(r, r, 1.0); continue
            diag = 0.0
            for jj in (j - 1, j + 1):
                diag -= 1
                if not vBlocked(jj, i):
                    add(r, V(jj, i), 1.0)
            for ii in (i - 1, i + 1):
                if vBlocked(j, ii) and (S(j - 1, ii) or S(j, ii)):
                    diag -= 2  # blade side wall: ghost = -v
                else:
                    diag -= 1; add(r, V(j, ii), 1.0)
            add(r, r, diag)
            add(r, P(j, i), -d); add(r, P(j - 1, i), d)
    # continuity (and pressure gauge)
    gauge = None
    for j in range(ny):
        for i in range(n):
            r = P(j, i)
            if solid[j, i]:
                add(r, r, 1.0); continue
            if gauge is None:
                gauge = r; add(r, r, 1.0); continue
            add(r, W(j, i + 1), 1.0); add(r, W(j, i), -1.0)
            add(r, V(j + 1, i), 1.0); add(r, V(j, i), -1.0)
    A = sp.csc_matrix((vals, (rows, cols)), shape=(N, N))
    x = spla.spsolve(A, b)
    w = x[:nW].reshape(ny, n)
    top = w[-1].mean() + d / 2
    return top, w


def protrusion(shape, h_over_s, t_over_s=0.0, n=96, above=3.0):
    solid, ny, d = mask_for(shape, n, h_over_s, t_over_s, above)
    ytop = ny * d
    # the tip is the highest solid point (the staircase top of the crest)
    rows_solid = np.where(solid.any(axis=1))[0]
    ytip = (rows_solid.max() + 1) * d if len(rows_solid) else 0.0
    up, _ = longitudinal(solid, d)
    wp, _ = transverse(solid, d)
    hpar = up - (ytop - ytip)
    hperp = wp - (ytop - ytip)
    return dict(shape=shape, h_s=h_over_s, t_s=t_over_s, n=n, hpar=hpar, hperp=hperp, dh=hpar - hperp)


if __name__ == '__main__':
    out = {}
    print('Validation 1: flat wall (expect 0, 0)')
    r = protrusion('flat', 0.0, n=32); print('  ', {k: round(v, 5) if isinstance(v, float) else v for k, v in r.items()})
    out['flat'] = r
    print('Validation 2: deep thin blades, h/s = 2 (exact limit h_par = ln2/pi = %.4f s)' % (np.log(2) / np.pi))
    for n in (32, 64, 128):
        r = protrusion('blade', 2.0, 0.0, n=n); print('   n=%3d  h_par=%.4f  h_perp=%.4f  dh=%.4f' % (n, r['hpar'], r['hperp'], r['dh']))
    out['deep_blade'] = r
    print('Blade riblets h/s = 0.5 (Bechert optimum shape), thickness -> 1 cell:')
    rows = []
    for n in (32, 64, 128):
        r = protrusion('blade', 0.5, 0.0, n=n); rows.append(r)
        print('   n=%3d  t/s=%.3f  h_par=%.4f  h_perp=%.4f  dh=%.4f' % (n, 1 / n, r['hpar'], r['hperp'], r['dh']))
    out['blade_0.5'] = rows
    print('60-degree sawtooth (h/s = 0.866):')
    rows = []
    for n in (32, 64, 128):
        r = protrusion('triangle', 0.866, n=n); rows.append(r)
        print('   n=%3d  h_par=%.4f  h_perp=%.4f  dh=%.4f' % (n, r['hpar'], r['hperp'], r['dh']))
    out['saw_60'] = rows
    print('Geometries used in the 3-D DNS (as rasterised there):')
    for s_cells, hr, t in ((8, 4, 1), (16, 8, 1)):
        # exact DNS staircase: s cells per period, blade 1 cell wide, height hr cells
        n = s_cells
        solid, ny, d = mask_for('flat', n, 0.0, 0.0, 3.0 + hr / s_cells)
        solid[:hr, :t] = True
        # crest at i = 0 (one cell wide), matches the DNS mask (z % s) < t
        up, _ = longitudinal(solid, d); wp, _ = transverse(solid, d)
        ytop = ny * d; ytip = hr * d
        r = dict(s_cells=s_cells, hr=hr, t=t, hpar=up - (ytop - ytip), hperp=wp - (ytop - ytip))
        r['dh'] = r['hpar'] - r['hperp']
        # same geometry refined 8x
        n2 = s_cells * 8
        solid2, ny2, d2 = mask_for('flat', n2, 0.0, 0.0, 3.0 + hr / s_cells)
        solid2[:hr * 8, :t * 8] = True
        up2, _ = longitudinal(solid2, d2); wp2, _ = transverse(solid2, d2)
        ytop2 = ny2 * d2
        r['hpar_fine'] = up2 - (ytop2 - ytip); r['hperp_fine'] = wp2 - (ytop2 - ytip); r['dh_fine'] = r['hpar_fine'] - r['hperp_fine']
        print('   s=%2d cells hr=%d t=%d : dh/s = %.4f (DNS grid)  %.4f (8x refined)' % (s_cells, hr, t, r['dh'], r['dh_fine']))
        out['dns_s%d' % s_cells] = r
    json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else 'protrusion.json', 'w'), indent=1, default=float)
