// Aus einer Unähnlichkeitsmatrix eine Karte machen, in der der Abstand zweier
// Punkte möglichst genau ihrer Unähnlichkeit entspricht.
//
// SMACOF statt eines Kräfte-Layouts: Fruchterman-Reingold balanciert
// Anziehung gegen Abstoßung, danach hat ein Abstand keine feste Bedeutung
// mehr. SMACOF minimiert direkt den Stress, also die Abweichung zwischen
// Bildabstand und Unähnlichkeit. Das Ergebnis ist deterministisch und damit
// über Builds hinweg vergleichbar.

export type Punkte = Float64Array[];   // je Punkt ein Vektor der Länge dim

/** δ als flache N×N-Matrix. */
export interface Matrix { N: number; d: Float64Array }

const at = (m: Matrix, i: number, j: number) => m.d[i * m.N + j];

/** Klassisches MDS (Torgerson) als Startlage: die größten Eigenvektoren der
 *  doppelt zentrierten Matrix −½δ², per Potenzmethode. Liefert zusätzlich
 *  die Eigenwerte, also wie viel Struktur jede Achse trägt. */
export function klassisch(m: Matrix, dim: number): { punkte: Punkte; eigen: number[] } {
  const { N } = m;
  const B = new Float64Array(N * N);
  const zeile = new Float64Array(N);
  let gesamt = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const q = at(m, i, j) ** 2;
      B[i * N + j] = q;
      zeile[i] += q / N;
    }
    gesamt += zeile[i] / N;
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      B[i * N + j] = -0.5 * (B[i * N + j] - zeile[i] - zeile[j] + gesamt);

  const vektoren: Float64Array[] = [];
  const eigen: number[] = [];
  for (let k = 0; k < dim; k++) {
    let v = new Float64Array(N).map((_, i) => Math.sin(i * 12.9898 + k * 78.233));
    let lambda = 0;
    for (let it = 0; it < 500; it++) {
      const w = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let j = 0; j < N; j++) s += B[i * N + j] * v[j];
        w[i] = s;
      }
      for (const u of vektoren) {               // schon gefundene Achsen abziehen
        let dot = 0;
        for (let i = 0; i < N; i++) dot += w[i] * u[i];
        for (let i = 0; i < N; i++) w[i] -= dot * u[i];
      }
      const norm = Math.hypot(...w);
      if (norm === 0) break;
      const neu = w.map(x => x / norm);
      const diff = Math.abs(norm - lambda);
      v = neu;
      lambda = norm;
      if (diff < 1e-10 * norm) break;
    }
    vektoren.push(v);
    eigen.push(lambda);
  }
  const punkte = Array.from({ length: N }, (_, i) =>
    Float64Array.from(vektoren, (v, k) => v[i] * Math.sqrt(Math.max(eigen[k], 0))));
  return { punkte, eigen };
}

/** Kruskals Stress-1: 0 wäre eine perfekte Karte, unter 0,1 gilt als gut. */
export function stress(m: Matrix, x: Punkte): number {
  let zaehler = 0, nenner = 0;
  for (let i = 0; i < m.N; i++)
    for (let j = i + 1; j < m.N; j++) {
      const d = abstand(x[i], x[j]), delta = at(m, i, j);
      zaehler += (d - delta) ** 2;
      nenner += delta ** 2;
    }
  return Math.sqrt(zaehler / nenner);
}

function abstand(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}

/** SMACOF mit Guttman-Transformation, alle Paare gleich gewichtet. Jeder
 *  Schritt senkt den Stress garantiert, abgebrochen wird, wenn er sich kaum
 *  noch bewegt. */
export function smacof(m: Matrix, start: Punkte, maxSchritte = 400): { punkte: Punkte; stress: number } {
  const { N } = m;
  const dim = start[0].length;
  let x = start.map(p => Float64Array.from(p));
  let vorher = stress(m, x);
  for (let it = 0; it < maxSchritte; it++) {
    const neu = x.map(() => new Float64Array(dim));
    for (let i = 0; i < N; i++) {
      const xi = x[i], ni = neu[i];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const d = abstand(xi, x[j]);
        if (d < 1e-12) continue;
        const b = at(m, i, j) / d;
        for (let k = 0; k < dim; k++) ni[k] += b * (xi[k] - x[j][k]);
      }
      for (let k = 0; k < dim; k++) ni[k] /= N;
    }
    x = neu;
    if (it % 10 === 9) {
      const s = stress(m, x);
      if (vorher - s < 1e-6) { vorher = s; break; }
      vorher = s;
    }
  }
  return { punkte: x, stress: stress(m, x) };
}

/** Dreht und spiegelt `x`, bis die gemeinsamen Punkte möglichst genau auf
 *  `ziel` liegen (orthogonale Procrustes-Analyse, ohne Skalierung: δ hat in
 *  jeder Periode dieselbe Einheit). Ohne diesen Schritt dreht sich jede
 *  Periode beliebig, und beim Schieben des Reglers springt die Union von
 *  links nach rechts. */
export function ausrichten(x: Punkte, ziel: Punkte, paare: [number, number][]): Punkte {
  const dim = x[0].length;
  const mx = new Float64Array(dim), mz = new Float64Array(dim);
  for (const [i, j] of paare)
    for (let k = 0; k < dim; k++) { mx[k] += x[i][k] / paare.length; mz[k] += ziel[j][k] / paare.length; }
  // M = Aᵀ B über die zentrierten gemeinsamen Punkte
  const M = Array.from({ length: dim }, () => new Float64Array(dim));
  for (const [i, j] of paare)
    for (let a = 0; a < dim; a++)
      for (let b = 0; b < dim; b++)
        M[a][b] += (x[i][a] - mx[a]) * (ziel[j][b] - mz[b]);
  const R = polar(M);
  return x.map(p => {
    const q = new Float64Array(dim);
    for (let b = 0; b < dim; b++) {
      let s = 0;
      for (let a = 0; a < dim; a++) s += (p[a] - mx[a]) * R[a][b];
      q[b] = s + mz[b];
    }
    return q;
  });
}

/** Orthogonaler Anteil der Polarzerlegung, per Newton-Iteration
 *  R ← ½(R + R⁻ᵀ). Das ist die beste Drehung samt Spiegelung. */
function polar(M: Float64Array[]): Float64Array[] {
  let R = M.map(r => Float64Array.from(r));
  for (let it = 0; it < 100; it++) {
    const invT = transponiert(invers(R));
    const neu = R.map((r, a) => r.map((v, b) => (v + invT[a][b]) / 2));
    const diff = Math.max(...neu.flatMap((r, a) => [...r].map((v, b) => Math.abs(v - R[a][b]))));
    R = neu;
    if (diff < 1e-12) break;
  }
  return R;
}

function transponiert(A: Float64Array[]): Float64Array[] {
  return A.map((_, i) => Float64Array.from(A, r => r[i]));
}

function invers(A: Float64Array[]): Float64Array[] {
  const n = A.length;
  const m = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c];
    for (let k = 0; k < 2 * n; k++) m[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      for (let k = 0; k < 2 * n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map(r => Float64Array.from(r.slice(n)));
}
