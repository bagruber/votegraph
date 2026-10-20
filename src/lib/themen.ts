// Themenfilter: welche Themen es gibt, wie viele Abstimmungen eine Periode je
// Thema hat, und die Themenkarte aus dem Worker.
import { useEffect, useMemo, useState } from "react";
import type { Vorbereitet } from "./daten.ts";
import type { Auftrag, Ergebnis } from "./thema.worker.ts";

// Dieselben Kennungen wie etl/themen.py; kurz für die Leiste, lang für den Text
export const THEMEN: [string, string, string][] = [
  ["wirtschaft", "Wirtschaft", "Wirtschaft und Finanzen"],
  ["aussen", "Außen", "Außen und Verteidigung"],
  ["soziales", "Soziales", "Arbeit, Soziales und Gesundheit"],
  ["recht", "Recht und Inneres", "Recht, Inneres und Migration"],
  ["umwelt", "Umwelt", "Umwelt, Energie und Verkehr"],
  ["staat", "Staat", "Staat und Demokratie"],
];

/** Unter so vielen Abstimmungen gibt es keine Themenkarte: Die Nähe stünde
 *  fast nur auf der Vorannahme. */
export const MIN_THEMA = 10;

export function themenzahlen(periode: Vorbereitet): Record<string, number> {
  const z: Record<string, number> = {};
  for (const a of periode.abstimmungen) for (const t of a.themen ?? []) z[t] = (z[t] ?? 0) + 1;
  return z;
}

export function maske(periode: Vorbereitet, thema: string): Uint8Array {
  return Uint8Array.from(periode.abstimmungen, a => (a.themen?.includes(thema) ? 1 : 0));
}

let arbeiter: Worker | null = null;
const fertig = new Map<string, Ergebnis>();
const wartend = new Map<string, ((e: Ergebnis) => void)[]>();

function rechne(periode: Vorbereitet, schluessel: string, thema: string): Promise<Ergebnis> {
  const da = fertig.get(schluessel);
  if (da) return Promise.resolve(da);
  return new Promise(ok => {
    const liste = wartend.get(schluessel);
    if (liste) { liste.push(ok); return; }
    wartend.set(schluessel, [ok]);
    if (!arbeiter) {
      arbeiter = new Worker(new URL("./thema.worker.ts", import.meta.url), { type: "module" });
      arbeiter.onmessage = (e: MessageEvent<Ergebnis>) => {
        fertig.set(e.data.schluessel, e.data);
        for (const f of wartend.get(e.data.schluessel) ?? []) f(e.data);
        wartend.delete(e.data.schluessel);
      };
    }
    const P = periode.abstimmungen.length;
    const stimmen = new Int8Array(periode.kodiert.length * P);
    periode.kodiert.forEach((k, i) => stimmen.set(k, i * P));
    const basis = new Float32Array(periode.mdb.length * 2);
    periode.mdb.forEach((m, i) => { basis[2 * i] = m.p[0]; basis[2 * i + 1] = m.p[1]; });
    const auftrag: Auftrag = {
      schluessel, stimmen, P, haupt: periode.hauptfraktion, F: periode.fraktionen.length,
      maske: maske(periode, thema), basis, linie: periode.linie,
    };
    arbeiter.postMessage(auftrag, [stimmen.buffer, basis.buffer]);
  });
}

/** Die Themenkarte für Periode und Thema, oder null ohne Thema. `rechnet`
 *  ist wahr, solange der Worker noch arbeitet. */
export function useThemenkarte(parlament: string, periode: Vorbereitet | null, thema: string | null) {
  const schluessel = periode && thema ? `${parlament}/${periode.wp}/${thema}` : null;
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  useEffect(() => {
    if (!periode || !thema || !schluessel) return;
    let aktuell = true;
    rechne(periode, schluessel, thema).then(e => { if (aktuell) setErgebnis(e); });
    return () => { aktuell = false; };
  }, [periode, thema, schluessel]);
  const passend = ergebnis && ergebnis.schluessel === schluessel ? ergebnis : null;
  const m = useMemo(() => (periode && thema ? maske(periode, thema) : null), [periode, thema]);
  return { karte: passend, maske: m, rechnet: Boolean(schluessel) && !passend };
}
