import { describe, expect, it } from "vitest";
import { entzerre } from "./geometrie.ts";

describe("entzerre", () => {
  it("macht aus deckungsgleichen Punkten eine enge Scheibe, statt sie wegzuschleudern", () => {
    const N = 200, min = 5;
    const xy = new Float32Array(2 * N).fill(100);
    entzerre(xy, min);
    let weitester = 0;
    for (let i = 0; i < N; i++) weitester = Math.max(weitester, Math.hypot(xy[2 * i] - 100, xy[2 * i + 1] - 100));
    // Eine dicht gepackte Scheibe aus 200 Punkten mit Abstand 5 hat einen
    // Radius um 37; großzügig bemessen darf sie nicht weiter reichen als 80.
    expect(weitester).toBeLessThan(80);
  });

  it("lässt den festen Punkt an seinem Platz", () => {
    const xy = Float32Array.from([50, 50, 50, 50, 51, 50]);
    entzerre(xy, 4, 0);
    expect([xy[0], xy[1]]).toEqual([50, 50]);
    expect(Math.hypot(xy[2] - 50, xy[3] - 50)).toBeGreaterThan(3);
  });
});
