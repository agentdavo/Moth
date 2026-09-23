"""Analyse the riblet DNS runs and make the figures for docs/RIBLET_EVIDENCE.md.

Usage: python3 tools/riblet/report.py <run_dir> <chain.json> <out_dir>
Sign convention: dU+ = U+_riblet - U+_smooth at the same distance from the riblet tips and the same u_tau,
so dU+ > 0 means DRAG REDUCTION (the opposite sign to the "roughness function" used in some papers).
"""
import sys, os, json, glob
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

run, chain_path, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(outdir, exist_ok=True)

INK, MUTED, GRID = '#1f2328', '#6e7781', '#d8dee4'
C_SMOOTH, C_S16, C_S32 = '#6e7781', '#199e70', '#d95926'
BAND = {'light': '#3987e5', 'medium': '#199e70', 'strong': '#d95926'}
plt.rcParams.update({'font.size': 10, 'axes.edgecolor': MUTED, 'axes.labelcolor': INK, 'xtick.color': MUTED, 'ytick.color': MUTED,
                     'axes.grid': True, 'grid.color': GRID, 'grid.linewidth': 0.6, 'axes.spines.top': False, 'axes.spines.right': False,
                     'lines.linewidth': 2, 'legend.frameon': False, 'figure.dpi': 130})


def load_prof(name):
    p = os.path.join(run, name + '.prof')
    if not os.path.exists(p):
        return None
    hdr = open(p).readline()
    d = np.loadtxt(p)
    meta = dict(kv.split('=') for kv in hdr.split() if '=' in kv)
    return d, meta


def load_ts(name, t0):
    p = os.path.join(run, name + '.ts')
    d = np.loadtxt(p)
    return d[d[:, 1] >= t0]


def batch_diff(a, b, nb=6):
    """Mean and standard error of (a - b) from batch means (a, b: aligned time series)."""
    n = min(len(a), len(b)) // nb * nb
    if n < nb:
        return np.nan, np.nan
    da = (a[:n] - b[:n]).reshape(nb, -1).mean(axis=1)
    return da.mean(), da.std(ddof=1) / np.sqrt(nb)


cases = {'smooth': ('Smooth wall', C_SMOOTH), 's16': ('Blades s+ = 16', C_S16), 's32': ('Blades s+ = 32', C_S32)}
profs = {k: load_prof(k) for k in cases}
meta_s = profs['smooth'][1] if profs['smooth'] else None
t_stat = float(sys.argv[4]) if len(sys.argv) > 4 else 8.0  # start of averaging (units of H/u_tau)
res = {'t_stat': t_stat}

# --- time-series based dU+ (flow-rate and free-slip-lid velocity), paired in time with the smooth run
ts = {k: load_ts(k, t_stat) for k in cases if os.path.exists(os.path.join(run, k + '.ts'))}
for k in ('s16', 's32'):
    if k in ts and 'smooth' in ts:
        n = min(len(ts[k]), len(ts['smooth']))
        a, b = ts[k][:n], ts['smooth'][:n]
        res[k] = {
            'T_avg': float(a[-1, 1] - a[0, 1]) if n else 0,
            'dUb': batch_diff(a[:, 2], b[:, 2]), 'dUtop': batch_diff(a[:, 3], b[:, 3]),
        }

# --- profile-based dU+ in the band 30 < y+ < z_c (minimal-channel validity limit z_c = 0.4 Lz+)
Lz_plus = float(sys.argv[5]) if len(sys.argv) > 5 else 160.0
zc = 0.4 * Lz_plus
for k in ('s16', 's32'):
    if profs.get(k) and profs['smooth']:
        ds, dr = profs['smooth'][0], profs[k][0]
        yp = ds[:, 1]
        Ur = np.interp(yp, dr[:, 1], dr[:, 2])
        sel = (yp > 30) & (yp < zc)
        res.setdefault(k, {})['dU_profile'] = float(np.mean(Ur[sel] - ds[sel, 2])) if sel.any() else None

json.dump(res, open(os.path.join(outdir, 'riblet_dns.json'), 'w'), indent=1, default=float)
print(json.dumps(res, indent=1, default=float))

# --- Figure 1: mean velocity profiles and the shift
if profs['smooth']:
    fig, ax = plt.subplots(1, 2, figsize=(10, 4.2))
    yy = np.logspace(0, np.log10(180), 200)
    ax[0].plot(yy[yy < 12], yy[yy < 12], ':', color=MUTED, lw=1.2)
    ax[0].plot(yy[yy > 20], np.log(yy[yy > 20]) / 0.41 + 5.2, '--', color=MUTED, lw=1.2)
    ax[0].text(2.2, 1.2, 'U+ = y+', color=MUTED, fontsize=9)
    ax[0].text(45, 12.2, 'log law (κ 0.41, B 5.2)', color=MUTED, fontsize=9)
    for k, (lab, col) in cases.items():
        if profs[k]:
            d = profs[k][0]
            m = d[:, 0] > 0
            ax[0].plot(d[m, 1], d[m, 2], color=col, label=lab)
    ax[0].set_xscale('log'); ax[0].set_xlim(1, 200); ax[0].set_ylim(0, 24)
    ax[0].set_xlabel('y+ (distance above the riblet tips, wall units)'); ax[0].set_ylabel('U+  (mean velocity / u_τ)')
    ax[0].set_title('Mean velocity at equal wall friction', color=INK, fontsize=11, loc='left')
    ax[0].legend(loc='upper left')
    ds = profs['smooth'][0]
    for k in ('s16', 's32'):
        if profs[k]:
            d = profs[k][0]
            Ur = np.interp(ds[:, 1], d[:, 1], d[:, 2])
            m = ds[:, 1] > 1
            ax[1].plot(ds[m, 1], Ur[m] - ds[m, 2], color=cases[k][1], label=cases[k][0])
    ax[1].axhline(0, color=INK, lw=0.8)
    ax[1].axvspan(30, zc, color=GRID, alpha=0.5, lw=0)
    ax[1].text(31, ax[1].get_ylim()[0] if False else -1.6, 'averaging band\n30 < y+ < z_c', color=MUTED, fontsize=8)
    ax[1].set_xscale('log'); ax[1].set_xlim(1, 200); ax[1].set_ylim(-2, 2)
    ax[1].set_xlabel('y+'); ax[1].set_ylabel('ΔU+ = U+ riblet − U+ smooth')
    ax[1].set_title('Velocity shift (above 0 = less drag)', color=INK, fontsize=11, loc='left')
    ax[1].legend(loc='upper left')
    fig.tight_layout(); fig.savefig(os.path.join(outdir, 'riblet-dns-profiles.png')); plt.close(fig)

# --- Figure 2: dU+ vs s+ : viscous theory, published DNS, this DNS, and what the boat model assumes
fig, ax = plt.subplots(figsize=(7.6, 4.6))
sp = np.linspace(0, 40, 200)
# viscous theory for thin blades h/s = 0.5 (dh/s = 0.12 from protrusion.py), mu0 = 0.66 .. 1
dh = 0.12
ax.fill_between(sp[sp <= 14], 0.66 * dh * sp[sp <= 14], 1.0 * dh * sp[sp <= 14], color=GRID, alpha=0.8, lw=0)
ax.text(1, 2.3, 'viscous theory, thin blades h = s/2\nΔU+ = μ0·Δh+, Δh = 0.12 s, μ0 0.66–1\n(protrusion.py; linear regime only)', color=MUTED, fontsize=8)
# boat model assumption expressed as dU+ at Moth Re (Cf ~ 0.004): dU+ = DR * (1/sqrt(2Cf) + 1/(2 kappa))
curve = np.array([[0, 0], [5, -0.035], [10, -0.07], [15, -0.095], [17, -0.099], [20, -0.09], [25, -0.05], [30, 0], [35, 0.04], [40, 0.08]])
conv = 1 / np.sqrt(2 * 0.004) + 1 / (2 * 0.41)
ax.plot(curve[:, 0], -curve[:, 1] * conv, color='#8250df', lw=1.6, label='Bechert 1997 thin-blade curve, as ΔU+ at Moth Re (Cf 0.004)')
ax.plot(curve[:, 0], -curve[:, 1] * 0.83 * conv * np.where(curve[:, 1] < 0, 1, 1 / 0.83), '--', color='#8250df', lw=1.4, label='Boat model assumption (× 0.83 for a real film)')
lit = [(16, 0.81, 'Wong 2024 blade'), (20.5, 0.60, 'Endrikat/Modesti 2021 blade'), (25, 0.36, 'Wong 2024 blade'), (33, -0.71, 'Wong 2024 blade'),
       (15, 1.27, 'Wong 2024 trapezoid'), (17.9, 1.06, 'Endrikat/Modesti 2021 trapezoid')]
for i, (s_, du, lab) in enumerate(lit):
    ax.plot(s_, du, 's' if 'blade' in lab else 'D', ms=7, color='#6e7781', mec='white', mew=1.5, label='Published DNS (blades t = 0.2s ■, trapezoids ◆)' if i == 0 else None)
for k, s_ in (('s16', 16), ('s32', 32)):
    if k in res and 'dUtop' in res[k]:
        m, e = res[k]['dUtop']
        ax.errorbar(s_, m, yerr=2 * e if np.isfinite(e) else None, fmt='o', ms=9, color=cases[k][1], mec='white', mew=1.5, capsize=4,
                    label='This DNS (±2 s.e.)' if k == 's16' else None)
ax.axhline(0, color=INK, lw=0.8)
ax.set_xlim(0, 40); ax.set_ylim(-1.8, 2.8)
ax.set_xlabel('s+  (riblet spacing in wall units)'); ax.set_ylabel('ΔU+  (above 0 = drag reduction)')
ax.set_title('Riblet velocity shift: theory, published DNS, this DNS and the boat model', color=INK, fontsize=11, loc='left')
ax.legend(loc='lower left', fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(outdir, 'riblet-dU-vs-splus.png')); plt.close(fig)

# --- Figure 3: boat-level chain
ch = json.load(open(chain_path))
fig, ax = plt.subplots(1, 2, figsize=(10, 4.0), sharey=True)
for j, leg in enumerate(('up', 'down')):
    for band, col in BAND.items():
        sd = ch['spacing'][band]
        xs = [int(k) for k in sd]
        ax[j].plot(xs, [sd[k][leg] for k in sd], 'o-', color=col, ms=5, label=f'{band}')
    ax[j].axhline(0, color=INK, lw=0.8)
    ax[j].axvspan(25, 32, color=GRID, alpha=0.6, lw=0)
    ax[j].set_xlabel('riblet spacing s (µm), film on main foil + both struts')
    ax[j].set_title(('Upwind' if leg == 'up' else 'Downwind') + ' VMG change (%)', color=INK, fontsize=11, loc='left')
ax[0].set_ylabel('VMG change vs smooth (%)')
ax[0].legend(title='wind band', loc='upper right', fontsize=8, title_fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(outdir, 'riblet-boat-chain.png')); plt.close(fig)
print('figures written to', outdir)
