// Rechnet aus etl/zwischen/<parlament>/wpNN.json die Dateien, die der Browser lädt:
//   public/daten/<parlament>/wpNN.json   je Periode: Abgeordnete mit Stimmen,
//                                         Lage, Nachbarn, Abweichung, Abwesenheit
//   public/daten/<parlament>/index.json  Perioden, Regierungen und Personen
//   public/daten/parlamente.json         welche Parlamente es gibt
// Name, Quelle und Regierungen je Parlament stehen in etl/parlamente.json.
//
// Run:  node etl/baue.ts

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  abweichungen, abwesenheit, gedaempft, hauptfraktion, kodiere, paar,
} from "../src/lib/mass.ts";
import { ausrichten, klassisch, smacof, type Matrix, type Punkte } from "./layout.ts";

const ZWISCHEN = new URL("./zwischen/", import.meta.url);
const ZIEL = new URL("../public/daten/", import.meta.url);

interface Regierung { text: string; chef: string; rolle: string }
interface Parlament { im: string; quelle?: string; regierung: Record<string, Regierung> }
const PARLAMENTE: Record<string, Parlament> =
  JSON.parse(readFileSync(new URL("./parlamente.json", import.meta.url), "utf-8"));
const QUELLE_AW = "abgeordnetenwatch.de (CC0): namentliche Abstimmungen, soweit dort erfasst. Ob das alle "
  + "Abstimmungen des Landtags sind, ist nicht geprüft; für den Bundestag fehlten bei abgeordnetenwatch vor 2021 "
  + "bis zu zwei Drittel.";

/** Kanten je Punkt. Nur die nächsten Nachbarn: Das gibt dem Bild den
 *  Netz-Charakter, ohne eine Viertelmillion Linien zu ziehen. */
const NACHBARN = 4;
/** Paare mit weniger gemeinsamen Abstimmungen fließen nicht in die
 *  Vorannahme ein, sie würden das Fraktionsmittel nur verrauschen. */
const MIN_PAAR = 10;
/** Keine Fraktion, also auch keine Fraktionslinie. */
const OHNE_LINIE = new Set(["fraktionslos", "andere"]);

interface Zwischen {
  wp: number; quelle: string; von: string; bis: string | null;
  abstimmungen: { datum: string; titel: string; frei: boolean | null }[];
  fraktionen: string[];
  namen?: string[];          // Anzeigenamen aus der Quelle (Landtage: CSU, Freie Wähler, …)
  mdb: { id: string; name: string; stimmen: string; fraktion: string }[];
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

function rechne(z: Zwischen) {
  const N = z.mdb.length, F = z.fraktionen.length;
  const stimmen = z.mdb.map(m => kodiere(m.stimmen));
  const fraktion = z.mdb.map(m => Int8Array.from(m.fraktion, c => (c === "-" ? -1 : Number(c))));
  const haupt = z.mdb.map(m => hauptfraktion(m.fraktion));

  const summe = new Float64Array(N * N), n = new Uint16Array(N * N);
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const p = paar(stimmen[i], stimmen[j]);
      summe[i * N + j] = summe[j * N + i] = p.summe;
      n[i * N + j] = n[j * N + i] = p.n;
    }

  // Vorannahme: mittlere Unähnlichkeit je Fraktionspaar, aus den Paaren mit
  // genug gemeinsamen Abstimmungen.
  const acc = Array.from({ length: F }, () => Array.from({ length: F }, () => [0, 0]));
  let gs = 0, gn = 0;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const c = n[i * N + j];
      if (c < MIN_PAAR) continue;
      const roh = summe[i * N + j] / c;
      const [a, b] = [haupt[i], haupt[j]];
      acc[a][b][0] += roh; acc[a][b][1]++;
      if (a !== b) { acc[b][a][0] += roh; acc[b][a][1]++; }
      gs += roh; gn++;
    }
  const vorannahme = acc.map(r => r.map(([s, c]) => (c ? s / c : gs / gn)));

  const delta = new Float64Array(N * N);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      if (i !== j) delta[i * N + j] = gedaempft(summe[i * N + j], n[i * N + j], vorannahme[haupt[i]][haupt[j]]);
  const m: Matrix = { N, d: delta };

  const start = klassisch(m, 3).punkte;
  const flach = smacof(m, start.map(p => p.slice(0, 2)));
  const raum = smacof(m, start);

  const nachbarn = Array.from({ length: N }, (_, i) => {
    const kand: number[] = [];
    for (let j = 0; j < N; j++) if (j !== i) kand.push(j);
    return kand.sort((a, b) => delta[i * N + a] - delta[i * N + b] || a - b).slice(0, NACHBARN);
  });

  const ohneLinie = new Set(z.fraktionen.flatMap((f, i) => (OHNE_LINIE.has(f) ? [i] : [])));
  const abw = abweichungen(stimmen, fraktion, ohneLinie);
  // Gedämpft wie die Nähe: Richtung Mittelwert der eigenen Fraktion, damit
  // eine Gegenstimme bei drei Abstimmungen niemanden an die Spitze setzt.
  const mittel = Array.from({ length: F }, (_, f) => {
    let s = 0, c = 0;
    abw.forEach((a, i) => { if (haupt[i] === f) { s += a.summe; c += a.n; } });
    return c ? s / c : 0;
  });

  return {
    kopf: {
      wp: z.wp, quelle: z.quelle, von: z.von, bis: z.bis,
      fraktionen: z.fraktionen,
      ...(z.namen ? { namen: z.namen } : {}),
      vorannahme: vorannahme.map(r => r.map(r4)),
      stress: { flach: r4(flach.stress), raum: r4(raum.stress) },
      abstimmungen: z.abstimmungen,
    },
    mdb: z.mdb.map((mdb, i) => {
      const folge: number[] = [];
      for (const f of fraktion[i]) if (f >= 0 && folge[folge.length - 1] !== f) folge.push(f);
      const aw = abwesenheit(mdb.stimmen);
      return {
        id: mdb.id,
        name: mdb.name,
        f: haupt[i],
        ...(new Set(folge).size > 1 ? { wechsel: folge } : {}),
        s: mdb.stimmen,
        abwesend: [aw.abwesend, aw.mandat],
        abw: ohneLinie.has(haupt[i]) || abw[i].n === 0 ? null : {
          wert: r4(gedaempft(abw[i].summe, abw[i].n, mittel[haupt[i]])),
          summe: abw[i].summe, n: abw[i].n, gegen: abw[i].gegen, enthalten: abw[i].enthalten,
        },
        nn: nachbarn[i],
      };
    }),
    flach: flach.punkte,
    raum: raum.punkte,
  };
}

type Ergebnis = ReturnType<typeof rechne>;

/** Die erste Periode legt die Richtung fest: SPD links der Union, Grüne oben.
 *  Alle weiteren werden an ihrer Vorgängerin ausgerichtet. Fehlt eine der
 *  Fraktionen, bleibt die Achse, wie sie ist. */
function orientiere(e: Ergebnis, lage: Punkte) {
  const mitte = (f: string) => {
    const idx = e.kopf.fraktionen.indexOf(f);
    const pts = lage.filter((_, i) => e.mdb[i].f === idx);
    return pts.length ? pts[0].map((_, k) => pts.reduce((s, p) => s + p[k], 0) / pts.length) : null;
  };
  const spd = mitte("spd"), union = mitte("union"), gruene = mitte("gruene");
  const alle = lage[0].map((_, k) => lage.reduce((s, p) => s + p[k], 0) / lage.length);
  const sx = spd && union && spd[0] > union[0] ? -1 : 1;
  const sy = gruene && gruene[1] > alle[1] ? -1 : 1;
  for (const p of lage) { p[0] *= sx; p[1] *= sy; }
}

function gemeinsame(a: Ergebnis, b: Ergebnis): [number, number][] {
  const inB = new Map(b.mdb.map((m, i) => [m.id, i]));
  return a.mdb.flatMap((m, i) => (inB.has(m.id) ? [[i, inB.get(m.id)!] as [number, number]] : []));
}

function baueParlament(id: string, konfig: Parlament) {
  const quelle = new URL(`${id}/`, ZWISCHEN), ziel = new URL(`${id}/`, ZIEL);
  const dateien = readdirSync(quelle).filter(f => /^wp\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
  mkdirSync(ziel, { recursive: true });

  let vorige: Ergebnis | null = null;
  const perioden = [];
  const personen = new Map<string, { name: string; wps: number[] }>();
  // Gemeinsamer Rahmen über alle Perioden: Die Karte behält beim Schieben des
  // Reglers ihren Maßstab, eine zusammenrückende Periode sieht auch so aus.
  const rahmen = { flach: [Infinity, -Infinity, Infinity, -Infinity], raum: 0 };

  for (const datei of dateien) {
    const t0 = performance.now();
    const z: Zwischen = JSON.parse(readFileSync(new URL(datei, quelle), "utf-8"));
    const e = rechne(z);
    if (!vorige) {
      orientiere(e, e.flach);
      orientiere(e, e.raum);
    } else {
      const paare = gemeinsame(e, vorige);
      e.flach = ausrichten(e.flach, vorige.flach, paare);
      e.raum = ausrichten(e.raum, vorige.raum, paare);
    }

    // Der Regierungschef steht mit Namen in parlamente.json. Wer in der
    // Periode kein Mandat hatte (Seehofer 2008–2013), bekommt keine Markierung.
    const regierung = konfig.regierung[z.wp];
    const treffer = regierung ? z.mdb.filter(m => m.name === regierung.chef) : [];
    if (regierung && treffer.length !== 1)
      console.warn(`  ${id} WP ${z.wp}: ${regierung.chef} ${treffer.length ? "mehrdeutig" : "ohne Mandat in den Daten"}`);

    const aus = {
      ...e.kopf,
      mdb: e.mdb.map((m, i) => ({
        ...m,
        p: [...e.flach[i]].map(r4),
        r: [...e.raum[i]].map(r4),
      })),
    };
    writeFileSync(new URL(`wp${z.wp}.json`, ziel), JSON.stringify(aus));
    for (const [x, y] of e.flach) {
      rahmen.flach = [Math.min(rahmen.flach[0], x), Math.max(rahmen.flach[1], x),
                      Math.min(rahmen.flach[2], y), Math.max(rahmen.flach[3], y)];
    }
    for (const p of e.raum) rahmen.raum = Math.max(rahmen.raum, Math.hypot(...p));
    perioden.push({
      wp: z.wp, von: z.von, bis: z.bis, quelle: z.quelle,
      abstimmungen: z.abstimmungen.length, mdb: z.mdb.length,
      regierung: regierung?.text ?? null,
      chef: treffer.length === 1 ? { id: treffer[0].id, rolle: regierung!.rolle } : null,
    });
    for (const m of z.mdb) {
      const p = personen.get(m.id) ?? { name: m.name, wps: [] };
      p.name = m.name;
      p.wps.push(z.wp);
      personen.set(m.id, p);
    }
    console.log(`${id} WP ${z.wp}: ${z.mdb.length} Abgeordnete, Stress 2D ${e.kopf.stress.flach}, `
      + `3D ${e.kopf.stress.raum}, ${Math.round(performance.now() - t0)} ms`);
    vorige = e;
  }

  writeFileSync(new URL("index.json", ziel), JSON.stringify({
    erstellt: new Date().toISOString().slice(0, 10),
    im: konfig.im,
    quelle: konfig.quelle ?? QUELLE_AW,
    rahmen: { flach: rahmen.flach.map(r4), raum: r4(rahmen.raum) },
    perioden,
    personen: [...personen].map(([pid, p]) => ({ id: pid, ...p }))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
  }));
}

const gebaut = Object.entries(PARLAMENTE).filter(([id]) => existsSync(new URL(`${id}/`, ZWISCHEN)));
for (const [id, konfig] of gebaut) baueParlament(id, konfig);
writeFileSync(new URL("parlamente.json", ZIEL),
  JSON.stringify(gebaut.map(([id, k]) => ({ id, im: k.im }))));
