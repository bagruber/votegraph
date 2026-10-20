// Laden und Aufbereiten der Dateien aus public/daten/ (erzeugt von etl/baue.ts).
import { useEffect, useState } from "react";
import { kodiere } from "./mass.ts";

export interface Person { id: string; name: string; wps: number[] }

export interface Parlament { id: string; im: string }

export interface Index {
  erstellt: string;
  im: string;                      // "Bundestag", "Bayerischen Landtag": folgt auf "im"
  quelle: string;
  rahmen: { flach: [number, number, number, number]; raum: number };
  perioden: {
    wp: number; von: string; bis: string | null; quelle: string; abstimmungen: number; mdb: number;
    regierung: string | null;
    chef: { id: string; rolle: string } | null;   // Kanzler oder Ministerpräsident, falls mit Mandat
    linie: boolean;                               // ob es eine Regierungslinie gibt
  }[];
  personen: Person[];
}

export interface MdB {
  id: string;
  name: string;
  linie?: true;                    // die Regierungslinie, keine Person
  zusatz?: string;                 // Europaparlament: nationale Partei und Land
  f: number;                       // Hauptfraktion, Index in `fraktionen`
  wechsel?: number[];              // Fraktionsfolge, falls gewechselt
  s: string;                       // Stimmen, ein Zeichen je Abstimmung
  abwesend: [number, number];      // nicht abgegeben, Abstimmungen mit Mandat
  abw: { wert: number; summe: number; n: number; gegen: number; enthalten: number } | null;
  dev?: [number, number, number][]; // Abweichungen: Abstimmung, eigene Stimme, Fraktionslinie
  nn: number[];                    // nächste Nachbarn
  p: [number, number];             // Lage in der Karte
  r: [number, number, number];     // Lage im Raum
}

export interface Periode {
  wp: number;
  quelle: string;
  von: string;
  bis: string | null;
  fraktionen: string[];
  namen?: string[];                // Fraktionsnamen aus der Quelle, nur Landtage
  vorannahme: number[][];
  stress: { flach: number; raum: number };
  abstimmungen: { datum: string; titel: string; frei: boolean | null; themen?: string[] }[];
  mdb: MdB[];
}

export interface Vorbereitet extends Periode {
  kodiert: Int8Array[];
  hauptfraktion: number[];
  abgegeben: number[];             // Ja, Nein oder Enthaltung
  index: Map<string, number>;
  linie: number | null;            // Zeile der Regierungslinie
}

const pfad = (datei: string) => `${import.meta.env.BASE_URL}daten/${datei}`;

export function useParlamente(): Parlament[] | null {
  const [liste, setListe] = useState<Parlament[] | null>(null);
  useEffect(() => {
    fetch(pfad("parlamente.json")).then(r => r.json()).then(setListe);
  }, []);
  return liste;
}

export function useIndex(parlament: string): Index | null {
  const [index, setIndex] = useState<{ parlament: string; index: Index } | null>(null);
  useEffect(() => {
    let aktuell = true;
    fetch(pfad(`${parlament}/index.json`)).then(r => r.json())
      .then(i => { if (aktuell) setIndex({ parlament, index: i }); });
    return () => { aktuell = false; };
  }, [parlament]);
  return index?.parlament === parlament ? index.index : null;
}

const cache = new Map<string, Promise<Vorbereitet>>();

function lade(parlament: string, wp: number): Promise<Vorbereitet> {
  const schluessel = `${parlament}/wp${wp}`;
  let p = cache.get(schluessel);
  if (!p) {
    p = fetch(pfad(`${schluessel}.json`)).then(r => r.json()).then((d: Periode) => ({
      ...d,
      kodiert: d.mdb.map(m => kodiere(m.s)),
      hauptfraktion: d.mdb.map(m => m.f),
      abgegeben: d.mdb.map(m => m.s.replace(/[^jne]/g, "").length),
      index: new Map(d.mdb.map((m, i) => [m.id, i])),
      linie: d.mdb.findIndex(m => m.linie) >= 0 ? d.mdb.findIndex(m => m.linie) : null,
    }));
    cache.set(schluessel, p);
  }
  return p;
}

/** Hält die vorige Periode, bis die neue geladen ist: kein leerer Moment
 *  beim Schieben des Reglers. */
export function usePeriode(parlament: string, wp: number | null): Vorbereitet | null {
  const [periode, setPeriode] = useState<{ parlament: string; periode: Vorbereitet } | null>(null);
  useEffect(() => {
    if (wp === null) return;
    let aktuell = true;
    lade(parlament, wp).then(p => { if (aktuell) setPeriode({ parlament, periode: p }); });
    return () => { aktuell = false; };
  }, [parlament, wp]);
  // Eine Periode eines anderen Parlaments wird nicht gehalten: Dort passen
  // weder Personen noch Fraktionen zur neuen Auswahl.
  return periode?.parlament === parlament ? periode.periode : null;
}

export function vorladen(parlament: string, wp: number) {
  void lade(parlament, wp);
}

/** Je Person und Periode: Wahlperiode, eigene Fraktion, Übereinstimmung mit
 *  jeder Fraktion und mit der Regierungslinie (Prozent). */
export interface Verlauf {
  namen: Record<string, string>;     // Fraktionsnamen aus der Quelle (Landtage, Europaparlament)
  personen: Record<string, [number, string, Record<string, number>, number | null][]>;
}

const verlaeufe = new Map<string, Promise<Verlauf>>();

/** Erst geladen, wenn jemand eine Person auswählt. */
export function useVerlauf(parlament: string, aktiv: boolean): Verlauf | null {
  const [v, setV] = useState<{ parlament: string; v: Verlauf } | null>(null);
  useEffect(() => {
    if (!aktiv) return;
    let p = verlaeufe.get(parlament);
    if (!p) {
      p = fetch(pfad(`${parlament}/verlauf.json`)).then(r => r.json());
      verlaeufe.set(parlament, p);
    }
    let aktuell = true;
    p.then(x => { if (aktuell) setV({ parlament, v: x }); });
    return () => { aktuell = false; };
  }, [parlament, aktiv]);
  return v?.parlament === parlament ? v.v : null;
}
