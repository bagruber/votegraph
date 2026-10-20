import { describe, expect, it } from "vitest";
import { ausrichten, klassisch, smacof, type Matrix, type Punkte } from "./layout.ts";

const quadrat: Punkte = [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => Float64Array.from(p));

function matrix(p: Punkte): Matrix {
  const N = p.length;
  const d = new Float64Array(N * N);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      d[i * N + j] = Math.hypot(...p[i].map((v, k) => v - p[j][k]));
  return { N, d };
}

describe("Layout", () => {
  it("findet eine Anordnung ohne Stress, wenn es eine gibt", () => {
    const m = matrix(quadrat);
    const { punkte } = klassisch(m, 2);
    const { stress } = smacof(m, punkte);
    expect(stress).toBeLessThan(1e-4);
  });

  it("richtet eine gedrehte und gespiegelte Kopie wieder aus", () => {
    const w = 1.1;
    const gedreht = quadrat.map(([x, y]) =>
      Float64Array.from([-(Math.cos(w) * x - Math.sin(w) * y) + 5, Math.sin(w) * x + Math.cos(w) * y - 2]));
    const zurueck = ausrichten(gedreht, quadrat, quadrat.map((_, i) => [i, i]));
    zurueck.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(quadrat[i][0], 6);
      expect(p[1]).toBeCloseTo(quadrat[i][1], 6);
    });
  });
});
