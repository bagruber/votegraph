// Namen und Farben der Fraktionen. Die Farben stehen als CSS-Variablen in
// stil.css, je für hell und dunkel; hier nur die Zuordnung.
import type { Periode } from "./daten.ts";

/** Name der Fraktion f in dieser Periode. Landtagsdaten bringen ihre Namen
 *  mit (CSU, Freie Wähler), für den Bundestag gelten die Regeln unten. */
export function fraktionsname(periode: Periode, f: number): string {
  if (periode.namen) return periode.namen[f];
  const wp = periode.wp;
  switch (periode.fraktionen[f]) {
    case "union": return "CDU/CSU";
    case "spd": return "SPD";
    case "gruene": return "Grüne";
    case "fdp": return "FDP";
    case "fw": return "Freie Wähler";
    case "linke": return wp <= 15 ? "PDS" : "Linke";
    case "bsw": return "BSW";
    case "afd": return "AfD";
    case "fraktionslos": return "fraktionslos";
    default: return "andere";
  }
}

export const farbvariable = (kennung: string) =>
  `--f-${kennung === "andere" ? "fraktionslos" : kennung}`;

export const OHNE_LINIE = new Set(["fraktionslos", "andere"]);
