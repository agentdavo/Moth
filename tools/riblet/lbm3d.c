// Minimal-span open-channel simulation with riblets: D3Q19 lattice Boltzmann, regularised BGK,
// Guo body force, OpenMP. Used to check the riblet drag-reduction claim from first principles.
// Resolution is DNS-like (dx+ = 2); a small Smagorinsky term (Cs = CS env, default 0.07, van Driest damped,
// zero at the wall) keeps tau ~ 0.509 stable, so strictly this is a wall-resolved LES.
// Populations are stored as deviations from the rest weights (f - w_i) for float32 precision.
//
// Domain: x streamwise (periodic), z spanwise (periodic), y wall-normal.
//   y < 0            : smooth no-slip floor (halfway bounce-back)
//   solid[y][z]      : riblet blades (uniform in x), bounce-back
//   y > NY-1         : free-slip lid (specular reflection) -> open channel of height H
// Riblet tips sit at y = tip (cells); the channel height H = NY - tip is measured from the tips.
// Driving: uniform body force g chosen so that total force / planform area = uTau^2 (rho = 1),
// i.e. both smooth and riblet cases run at the same wall friction velocity (constant Re_tau).
// Drag reduction appears as a higher flow rate: DeltaU+ = U+_riblet - U+_smooth in the outer flow.
//
// Usage: lbm3d NX NY NZ s hr t tip uTau Retau steps spinup out [restart]
//   s  = riblet spacing (cells, 0 = smooth), hr = blade height (cells), t = blade thickness (cells)
//   tip = row of the riblet tips (cells); rows below tip-hr are solid floor. With s = 0 all rows y < tip are
//   solid, so smooth and riblet cases share one grid, one tip plane and one restart file.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <omp.h>

#define Q 19
static const int cx[Q] = {0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0};
static const int cy[Q] = {0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1};
static const int cz[Q] = {0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1};
static float wq[Q];
static int opp[Q], mir[Q];

static int NX, NY, NZ;
static inline size_t IDX(int x, int y, int z) { return ((size_t)y * NZ + z) * NX + x; }

static unsigned long long rng = 88172645463325252ULL;
static double urand(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return (rng >> 11) * (1.0 / 9007199254740992.0); }

int main(int argc, char **argv) {
  if (argc < 13) { fprintf(stderr, "usage: lbm3d NX NY NZ s hr t tip uTau Retau steps spinup out [restart]\n"); return 1; }
  NX = atoi(argv[1]); NY = atoi(argv[2]); NZ = atoi(argv[3]);
  const int s = atoi(argv[4]), hr = atoi(argv[5]), tb = atoi(argv[6]), tip = atoi(argv[7]);
  const double uTau = atof(argv[8]), Retau = atof(argv[9]);
  const long steps = atol(argv[10]), spinup = atol(argv[11]);
  const char *out = argv[12];
  const char *restart = argc > 13 ? argv[13] : NULL;

  for (int i = 0; i < Q; i++) {
    int n = abs(cx[i]) + abs(cy[i]) + abs(cz[i]);
    wq[i] = n == 0 ? 1.f / 3 : n == 1 ? 1.f / 18 : 1.f / 36;
    for (int j = 0; j < Q; j++) {
      if (cx[j] == -cx[i] && cy[j] == -cy[i] && cz[j] == -cz[i]) opp[i] = j;
      if (cx[j] == cx[i] && cy[j] == -cy[i] && cz[j] == cz[i]) mir[i] = j;
    }
  }

  // Geometry
  unsigned char *solid = calloc((size_t)NY * NZ, 1);
  for (int y = 0; y < tip; y++) for (int z = 0; z < NZ; z++) if (s <= 0 || y < tip - hr || (z % s) < tb) solid[y * NZ + z] = 1;
  long fluidPerSlice = 0;
  for (int y = 0; y < NY; y++) for (int z = 0; z < NZ; z++) fluidPerSlice += !solid[y * NZ + z];
  const int H = NY - tip;
  const double nu = uTau * H / Retau, tau = 3 * nu + 0.5, omega = 1 / tau;
  const double g = uTau * uTau * NZ / (double)fluidPerSlice; // force per fluid cell
  fprintf(stderr, "grid %dx%dx%d  s=%d hr=%d t=%d  H=%d  nu=%.5f tau=%.5f g=%.3e  dx+=%.3f\n",
          NX, NY, NZ, s, hr, tb, H, nu, tau, g, uTau / nu);

  const size_t N = (size_t)NX * NY * NZ;
  float *A = aligned_alloc(64, sizeof(float) * Q * N), *B = aligned_alloc(64, sizeof(float) * Q * N);
  long step0 = 0;
  if (restart) {
    FILE *fr = fopen(restart, "rb");
    if (!fr || fread(&step0, sizeof step0, 1, fr) != 1 || fread(A, sizeof(float), Q * N, fr) != Q * N) { fprintf(stderr, "bad restart\n"); return 1; }
    fclose(fr);
    fprintf(stderr, "restarted at step %ld\n", step0);
  } else {
    // Mean profile (Reichardt) + a finite-amplitude trigger: multi-mode quasi-streamwise vortices from a
    // stream function psi(y,z) a(x) (divergence-free: v = psi_z a, w = -psi_y a), streaks and noise.
    // A weak single-mode trigger relaminarises at Re_tau 180; this one reaches ~3 u_tau near y+ 30.
    enum { MZ = 4, MX = 3 };
    double phz[MZ][MX], phx[MZ][MX], phs[MZ];
    for (int m = 0; m < MZ; m++) { phs[m] = 2 * M_PI * urand(); for (int n = 0; n < MX; n++) { phz[m][n] = 2 * M_PI * urand(); phx[m][n] = 2 * M_PI * urand(); } }
    const double del = 15 * nu / uTau; // phi(y) = (y/del)^2 exp(2 - y/del) / 4, peak 1 at y = 2 del (y+ 30)
    const double TRIG = getenv("TRIG") ? atof(getenv("TRIG")) : 3.0;
    for (int y = 0; y < NY; y++) for (int z = 0; z < NZ; z++) for (int x = 0; x < NX; x++) {
      size_t c = IDX(x, y, z);
      double yy = (y + 0.5 - tip); if (yy < 0.2) yy = 0.2;
      double yp = yy * uTau / nu;
      double Up = 2.5 * log(1 + 0.4 * yp) + 7.8 * (1 - exp(-yp / 11) - yp / 11 * exp(-yp / 3));
      double q = yy / del, phi = q * q * exp(2 - q) / 4, dphi = (2 * q - q * q) * exp(2 - q) / (4 * del);
      double u = uTau * Up, v = 0, w = 0;
      for (int m = 0; m < MZ; m++) {
        double kz = 2 * M_PI * (m + 1) / NZ;
        u += uTau * TRIG * 0.6 * (q * exp(1 - q)) * cos(kz * z + phs[m]) / sqrt(MZ);
        for (int n = 0; n < MX; n++) {
          double kx = 2 * M_PI * (n + 1) / NX;
          double a = 1 + 0.6 * sin(kx * x + phx[m][n]);
          double A = uTau * TRIG / (kz * sqrt(MZ * MX));
          v += A * phi * kz * cos(kz * z + phz[m][n]) * a;
          w += -A * dphi * sin(kz * z + phz[m][n]) * a;
        }
      }
      u += uTau * 1.0 * (urand() - 0.5); v += uTau * 0.5 * (urand() - 0.5); w += uTau * 0.5 * (urand() - 0.5);
      if (solid[y * NZ + z]) u = v = w = 0;
      double uu = u * u + v * v + w * w;
      for (int i = 0; i < Q; i++) {
        double cu = cx[i] * u + cy[i] * v + cz[i] * w;
        A[i * N + c] = wq[i] * (3 * cu + 4.5 * cu * cu - 1.5 * uu); // deviation from w_i
      }
    }
  }

  // Statistics accumulators (plane averages over fluid cells)
  double *sU = calloc(NY, 8), *sUU = calloc(NY, 8), *sVV = calloc(NY, 8), *sWW = calloc(NY, 8), *sUV = calloc(NY, 8), *sV = calloc(NY, 8), *sW = calloc(NY, 8);
  long nStat = 0;
  char fn[512];
  snprintf(fn, sizeof fn, "%s.ts", out);
  FILE *ts = fopen(fn, restart ? "a" : "w");
  double t0 = omp_get_wtime();
  const float gf = (float)g, tau0 = (float)tau;
  const double CS = getenv("CS") ? atof(getenv("CS")) : 0.07;
  (void)omega;
  const int yMon = tip + 8; // monitor row, y+ ~ 17

  for (long it = step0; it < steps; it++) {
    const int doStat = (it >= spinup) && (it % 20 == 0);
    const int doTs = (it % 200 == 0);
    double ubSum = 0, utop = 0, vv = 0;
    #pragma omp parallel for collapse(2) schedule(static) reduction(+:ubSum,utop,vv)
    for (int y = 0; y < NY; y++) for (int z = 0; z < NZ; z++) {
      if (solid[y * NZ + z]) continue;
      const float *src[Q]; int shift[Q];
      for (int i = 0; i < Q; i++) {
        int ys = y - cy[i], zs = (z - cz[i] + NZ) % NZ;
        if (ys < 0 || (ys < NY && solid[ys * NZ + zs])) { src[i] = A + (size_t)opp[i] * N + IDX(0, y, z); shift[i] = 0; }
        else if (ys > NY - 1) { src[i] = A + (size_t)mir[i] * N + IDX(0, y, zs); shift[i] = cx[i]; }
        else { src[i] = A + (size_t)i * N + IDX(0, ys, zs); shift[i] = cx[i]; }
      }
      double rowU = 0, rowV = 0;
      const double ypRow = fmax(0.0, (y + 0.5 - tip) * uTau / nu);
      const float cs2 = (float)(18 * sqrt(2.0) * pow(CS * (1 - exp(-ypRow / 26)), 2));
      for (int x = 0; x < NX; x++) {
        float f[Q];
        for (int i = 0; i < Q; i++) {
          int xs = x - shift[i]; xs += (xs < 0) ? NX : 0; xs -= (xs >= NX) ? NX : 0;
          f[i] = src[i][xs] + wq[i];
        }
        float rho = 0, jx = 0, jy = 0, jz = 0;
        for (int i = 0; i < Q; i++) { rho += f[i]; jx += cx[i] * f[i]; jy += cy[i] * f[i]; jz += cz[i] * f[i]; }
        const float ir = 1.f / rho;
        const float ux = (jx + 0.5f * gf) * ir, uy = jy * ir, uz = jz * ir;
        const float uu = ux * ux + uy * uy + uz * uz;
        float feq[Q], Pxx = 0, Pyy = 0, Pzz = 0, Pxy = 0, Pxz = 0, Pyz = 0;
        for (int i = 0; i < Q; i++) {
          float cu = cx[i] * ux + cy[i] * uy + cz[i] * uz;
          feq[i] = wq[i] * rho * (1 + 3 * cu + 4.5f * cu * cu - 1.5f * uu);
          float fn = f[i] - feq[i];
          Pxx += cx[i] * cx[i] * fn; Pyy += cy[i] * cy[i] * fn; Pzz += cz[i] * cz[i] * fn;
          Pxy += cx[i] * cy[i] * fn; Pxz += cx[i] * cz[i] * fn; Pyz += cy[i] * cz[i] * fn;
        }
        const size_t c = IDX(x, y, z);
        const float PP = Pxx * Pxx + Pyy * Pyy + Pzz * Pzz + 2 * (Pxy * Pxy + Pxz * Pxz + Pyz * Pyz);
        const float teff = 0.5f * (tau0 + sqrtf(tau0 * tau0 + cs2 * sqrtf(PP) * ir));
        const float om = 1.f / teff, fpref = 1 - 0.5f * om;
        for (int i = 0; i < Q; i++) {
          const float qxx = cx[i] * cx[i] - 1.f / 3, qyy = cy[i] * cy[i] - 1.f / 3, qzz = cz[i] * cz[i] - 1.f / 3;
          const float fneq = 4.5f * wq[i] * (qxx * Pxx + qyy * Pyy + qzz * Pzz + 2 * (cx[i] * cy[i] * Pxy + cx[i] * cz[i] * Pxz + cy[i] * cz[i] * Pyz));
          const float cu = cx[i] * ux + cy[i] * uy + cz[i] * uz;
          // Guo forcing. The regularisation projects out the first moment of f - feq (= -F/2), which BGK keeps;
          // restore it so the collision adds exactly F per step (without it only (3 - omega)/2 of F is applied).
          const float Fi = fpref * wq[i] * (3 * (cx[i] - ux) + 9 * cu * cx[i]) * gf - 1.5f * (1 - om) * wq[i] * cx[i] * gf;
          B[(size_t)i * N + c] = feq[i] + (1 - om) * fneq + Fi - wq[i];
        }
        rowU += ux;
        if (y == yMon) rowV += uy * uy + uz * uz;
      }
      ubSum += rowU; vv += rowV;
      if (y == NY - 1) utop += rowU;
    }
    if (doStat) {
      #pragma omp parallel for schedule(static)
      for (int y = 0; y < NY; y++) {
        double su = 0, suu = 0, svv = 0, sww = 0, suv = 0, sv = 0, sw = 0; long n = 0;
        for (int z = 0; z < NZ; z++) {
          if (solid[y * NZ + z]) continue;
          for (int x = 0; x < NX; x++) {
            size_t c = IDX(x, y, z);
            float rho = 0, jx = 0, jy = 0, jz = 0;
            for (int i = 0; i < Q; i++) { float fi = B[(size_t)i * N + c] + wq[i]; rho += fi; jx += cx[i] * fi; jy += cy[i] * fi; jz += cz[i] * fi; }
            double u = (jx + 0.5 * g) / rho, v = jy / rho, w = jz / rho;
            su += u; suu += u * u; svv += v * v; sww += w * w; suv += u * v; sv += v; sw += w; n++;
          }
        }
        // Plane-average over the full slice (solid cells count as zero velocity): superficial average
        double inv = 1.0 / ((double)NX * NZ);
        sU[y] += su * inv; sUU[y] += suu * inv; sVV[y] += svv * inv; sWW[y] += sww * inv; sUV[y] += suv * inv; sV[y] += sv * inv; sW[y] += sw * inv;
      }
      nStat++;
    }
    float *T = A; A = B; B = T;
    if (doTs) {
      double ub = ubSum / ((double)NX * NZ * H); // flow rate per unit span / H (incl. groove flow)
      double ut = utop / ((double)NX * NZ);
      double el = omp_get_wtime() - t0;
      double vw = sqrt(vv / ((double)NX * NZ)) / uTau; // rms of (v, w) combined at y+ ~ 17 (0 if laminar)
      if (!isfinite(ub)) { fprintf(stderr, "%s: NaN at step %ld\n", out, it); return 2; }
      fprintf(ts, "%ld %.4f %.6f %.6f %.4f\n", it, it * uTau / H, ub / uTau, ut / uTau, vw);
      fflush(ts);
      if (it % 5000 == 0) fprintf(stderr, "%s step %ld  t*uT/H=%.2f  Ub+=%.3f  Utop+=%.3f  vw'+=%.3f  %.1f MLUPS\n", out, it, it * uTau / H, ub / uTau, ut / uTau, vw,
                                  (double)N * (it - step0 + 1) / el / 1e6);
    }
    if ((it + 1) % 50000 == 0 || it + 1 == steps) {
      snprintf(fn, sizeof fn, "%s.chk", out);
      FILE *fc = fopen(fn, "wb"); long st = it + 1;
      fwrite(&st, sizeof st, 1, fc); fwrite(A, sizeof(float), Q * N, fc); fclose(fc);
      if (nStat) {
        snprintf(fn, sizeof fn, "%s.prof", out);
        FILE *fp = fopen(fn, "w");
        fprintf(fp, "# y_from_tip(cells) y+ U+ urms+ vrms+ wrms+ -uv+   nStat=%ld H=%d nu=%.6f uTau=%.5f s=%d hr=%d t=%d\n", nStat, H, nu, uTau, s, hr, tb);
        for (int y = 0; y < NY; y++) {
          double U = sU[y] / nStat, V = sV[y] / nStat, W = sW[y] / nStat;
          double yy = y + 0.5 - tip;
          fprintf(fp, "%.2f %.3f %.5f %.5f %.5f %.5f %.5f\n", yy, yy * uTau / nu, U / uTau,
                  sqrt(fmax(0, sUU[y] / nStat - U * U)) / uTau, sqrt(fmax(0, sVV[y] / nStat - V * V)) / uTau,
                  sqrt(fmax(0, sWW[y] / nStat - W * W)) / uTau, -(sUV[y] / nStat - U * V) / (uTau * uTau));
        }
        fclose(fp);
      }
    }
  }
  fclose(ts);
  return 0;
}
