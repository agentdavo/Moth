// Dense LU factorisation with partial pivoting (row-major, N x N).
export function luFactor(Ain, N) {
  const A = Float64Array.from(Ain);
  const piv = new Int32Array(N);
  for (let k = 0; k < N; k++) {
    let p = k, max = Math.abs(A[k * N + k]);
    for (let i = k + 1; i < N; i++) {
      const v = Math.abs(A[i * N + k]);
      if (v > max) { max = v; p = i; }
    }
    piv[k] = p;
    if (p !== k) {
      for (let j = 0; j < N; j++) { const t = A[k * N + j]; A[k * N + j] = A[p * N + j]; A[p * N + j] = t; }
    }
    const d = A[k * N + k] || 1e-300;
    for (let i = k + 1; i < N; i++) {
      const f = (A[i * N + k] /= d);
      if (f === 0) continue;
      for (let j = k + 1; j < N; j++) A[i * N + j] -= f * A[k * N + j];
    }
  }
  return { A, piv, N };
}

export function luSolve({ A, piv, N }, bIn) {
  const b = Float64Array.from(bIn);
  for (let k = 0; k < N; k++) { const p = piv[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } }
  for (let i = 1; i < N; i++) { let s = b[i]; for (let j = 0; j < i; j++) s -= A[i * N + j] * b[j]; b[i] = s; }
  for (let i = N - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < N; j++) s -= A[i * N + j] * b[j]; b[i] = s / A[i * N + i]; }
  return b;
}

// Solve small dense system (array of arrays), returns null if singular.
export function solveSmall(M, r) {
  const n = r.length;
  const A = M.map((row, i) => [...row, r[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if (Math.abs(A[p][k]) < 1e-14) return null;
    [A[k], A[p]] = [A[p], A[k]];
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      for (let j = k; j <= n; j++) A[i][j] -= f * A[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}
