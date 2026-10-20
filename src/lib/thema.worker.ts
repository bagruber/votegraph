// Rechnet die Karte einer Periode für ein Thema neu, im Hintergrund, damit
// die Seite bedienbar bleibt. Dieselben Bausteine wie der Build: Paarmatrix,
// Vorannahme, SMACOF. Gestartet wird von der Karte der ganzen Periode aus und
// danach an ihr ausgerichtet, sodass man sieht, wer sich durch das Thema
// verschiebt, statt dass sich das Bild neu würfelt.
import { ausrichten, smacof } from "./layout.ts";
import { paarmatrix, unaehnlichkeiten, vorannahmen } from "./mass.ts";

export interface Auftrag {
  schluessel: string;
  stimmen: Int8Array;      // alle Zeilen hintereinander, je P Abstimmungen
  P: number;
  haupt: number[];
  F: number;
  maske: Uint8Array;
  basis: Float32Array;     // Lage in der Karte der ganzen Periode, x/y je Zeile
  linie: number | null;
}

export interface Ergebnis {
  schluessel: string;
  lage: Float32Array;
  nachbarn: number[][];
  vorannahme: number[][];
}

const NACHBARN = 4;

self.onmessage = (e: MessageEvent<Auftrag>) => {
  const { schluessel, stimmen: flach, P, haupt, F, maske, basis, linie } = e.data;
  const N = haupt.length;
  const stimmen = Array.from({ length: N }, (_, i) => flach.subarray(i * P, (i + 1) * P));
  const m = paarmatrix(stimmen, maske);
  const vorannahme = vorannahmen(m, haupt, F, new Set(linie === null ? [] : [linie]));
  const delta = unaehnlichkeiten(m, haupt, vorannahme);
  const start = Array.from({ length: N }, (_, i) => Float64Array.from([basis[2 * i], basis[2 * i + 1]]));
  const { punkte } = smacof({ N, d: delta }, start, 200);
  const ausgerichtet = ausrichten(punkte, start, start.map((_, i) => [i, i]));
  const lage = new Float32Array(2 * N);
  ausgerichtet.forEach((p, i) => { lage[2 * i] = p[0]; lage[2 * i + 1] = p[1]; });
  const nachbarn = Array.from({ length: N }, (_, i) => {
    const kand: number[] = [];
    for (let j = 0; j < N; j++) if (j !== i) kand.push(j);
    return kand.sort((a, b) => delta[i * N + a] - delta[i * N + b] || a - b).slice(0, NACHBARN);
  });
  const antwort: Ergebnis = { schluessel, lage, nachbarn, vorannahme };
  (self as unknown as Worker).postMessage(antwort, [lage.buffer]);
};
