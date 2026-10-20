// Bildschirmlagen für die Karte: Einpassen, Ego-Ansicht, Entzerren.

/** Schiebt Punkte auseinander, bis keine zwei näher als `min` liegen.
 *  Wer exakt gleich abstimmt, liegt in der Karte auf demselben Fleck; ohne
 *  diesen Schritt sähe eine geschlossene Fraktion aus wie ein einziger Punkt.
 *  So wird sie zu einer Scheibe, deren Fläche mit der Zahl ihrer Mitglieder
 *  wächst. `fest` bleibt, wo er ist (die Mitte der Ego-Ansicht). */
export function entzerre(xy: Float32Array, min: number, fest: number | null = null, runden = 10) {
  const N = xy.length / 2;
  const zelle = min;
  for (let r = 0; r < runden; r++) {
    const gitter = new Map<number, number[]>();
    const schluessel = (gx: number, gy: number) => gx * 100003 + gy;
    for (let i = 0; i < N; i++) {
      const k = schluessel(Math.floor(xy[2 * i] / zelle), Math.floor(xy[2 * i + 1] / zelle));
      const z = gitter.get(k);
      if (z) z.push(i); else gitter.set(k, [i]);
    }
    let bewegt = false;
    for (let i = 0; i < N; i++) {
      const gx = Math.floor(xy[2 * i] / zelle), gy = Math.floor(xy[2 * i + 1] / zelle);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const z = gitter.get(schluessel(gx + dx, gy + dy));
          if (!z) continue;
          for (const j of z) {
            if (j <= i) continue;
            const vx = xy[2 * j] - xy[2 * i], vy = xy[2 * j + 1] - xy[2 * i + 1];
            const d = Math.hypot(vx, vy);
            if (d >= min) continue;
            let ux: number, uy: number;
            if (d < 1e-6) {
              // Gleiche Lage hat keine Richtung; der goldene Winkel gibt eine
              // her, immer dieselbe, damit das Bild reproduzierbar bleibt.
              const w = (i * 137.508 + j * 31.7) * Math.PI / 180;
              ux = Math.cos(w); uy = Math.sin(w);
            } else {
              ux = vx / d; uy = vy / d;
            }
            const schub = (min - d) / 2;
            const fi = i === fest ? 0 : j === fest ? 2 : 1;
            const fj = 2 - fi;
            xy[2 * i] -= ux * schub * fi; xy[2 * i + 1] -= uy * schub * fi;
            xy[2 * j] += ux * schub * fj; xy[2 * j + 1] += uy * schub * fj;
            bewegt = true;
          }
        }
    }
    if (!bewegt) break;
  }
}

/** Globale Karte: gemeinsamer Rahmen aller Perioden, gleichmäßig skaliert. */
export function einpassen(
  punkte: [number, number][], rahmen: [number, number, number, number], w: number, h: number, rand: number,
): Float32Array {
  const [x0, x1, y0, y1] = rahmen;
  const s = Math.min((w - 2 * rand) / (x1 - x0), (h - 2 * rand) / (y1 - y0));
  const ox = (w - s * (x1 - x0)) / 2, oy = (h - s * (y1 - y0)) / 2;
  const xy = new Float32Array(punkte.length * 2);
  punkte.forEach(([x, y], i) => { xy[2 * i] = ox + (x - x0) * s; xy[2 * i + 1] = oy + (y - y0) * s; });
  return xy;
}

/** Ego-Ansicht: der Abstand zur Mitte ist die tatsächliche Unähnlichkeit,
 *  keine Näherung. Nur die Richtung stammt aus der globalen Karte, damit die
 *  Fraktionen als Wolken zusammenbleiben. */
export function egoLage(
  ego: number, delta: Float64Array, punkte: [number, number][], R: number, cx: number, cy: number,
): Float32Array {
  const xy = new Float32Array(punkte.length * 2);
  const [ex, ey] = punkte[ego];
  punkte.forEach(([x, y], i) => {
    if (i === ego) { xy[2 * i] = cx; xy[2 * i + 1] = cy; return; }
    const d = Math.hypot(x - ex, y - ey);
    const w = d > 1e-4 ? Math.atan2(y - ey, x - ex) : i * 2.39996;
    xy[2 * i] = cx + Math.cos(w) * delta[i] * R;
    xy[2 * i + 1] = cy + Math.sin(w) * delta[i] * R;
  });
  return xy;
}
