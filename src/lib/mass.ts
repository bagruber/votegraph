// Das Maß: wie unähnlich zwei MdB abstimmen und wie weit jemand von der
// eigenen Fraktion abweicht. Build (etl/baue.ts) und Browser (Ego-Ansicht)
// rechnen mit diesem einen Modul, damit beide dieselben Regeln anwenden.
//
// Stimmen kommen als Zeichenkette, ein Zeichen je Abstimmung:
//   j ja · n nein · e Enthaltung · a nicht abgegeben · u ungültig
//   x nicht protokolliert · - kein Mandat zu dem Zeitpunkt

/** Kein verwertbarer Wert: abwesend, ungültig, unbekannt oder ohne Mandat. */
export const FEHLT = 9;

/** Ja +1, Enthaltung 0, Nein −1. Die Enthaltung liegt damit genau zwischen
 *  den beiden, und die Distanz unten ergibt die gewünschte Abstufung. */
export function kodiere(stimmen: string): Int8Array {
  const out = new Int8Array(stimmen.length);
  for (let i = 0; i < stimmen.length; i++) {
    const c = stimmen[i];
    out[i] = c === "j" ? 1 : c === "n" ? -1 : c === "e" ? 0 : FEHLT;
  }
  return out;
}

/** Halber Abstand auf der Skala: Ja/Nein 1, Ja/Enthaltung und
 *  Enthaltung/Nein je 0,5, gleich 0. */
export function distanz(a: number, b: number): number {
  return Math.abs(a - b) / 2;
}

export interface Paar {
  summe: number;   // aufsummierte Distanz
  n: number;       // Abstimmungen, bei denen beide eine Stimme abgegeben haben
}

/** Nur Abstimmungen, bei denen beide abgestimmt haben, zählen. Fehlt eine
 *  Seite, verschiebt das nichts in die eine oder andere Richtung, es macht
 *  die Grundlage nur dünner. */
export function paar(a: Int8Array, b: Int8Array): Paar {
  let summe = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === FEHLT || y === FEHLT) continue;
    summe += distanz(x, y);
    n++;
  }
  return { summe, n };
}

/** Wie viele gedachte Abstimmungen die Vorannahme wiegt. Wer zehn echte hat,
 *  steht halb auf eigenen Füßen, wer hundert hat, fast ganz. */
export const K = 10;

/** Ab wie vielen Abstimmungen eine Grundlage als tragfähig gilt. Darunter ist
 *  der Kreis in der Karte hohl, und Ranglisten lassen die Person weg: Die
 *  Dämpfung genügt für die Karte, aber nicht für eine Spitzenposition, eine
 *  Gegenstimme bei drei Abstimmungen landete sonst weit oben. Höchstens 20, in
 *  dünnen Perioden ein Drittel der Abstimmungen; sonst wäre in einem Landtag
 *  mit 28 Abstimmungen fast jeder Kreis hohl und jede Liste leer. */
export function mindestgrundlage(abstimmungen: number): number {
  return Math.min(20, Math.ceil(abstimmungen / 3));
}

/** Gedämpfte Unähnlichkeit, 0 bis 1. Zu den echten Abstimmungen kommen k
 *  gedachte mit dem Wert der Vorannahme. Dadurch zählt 4 von 5 gleich
 *  weniger als 8 von 10, aber mehr als 4 von 10. */
export function gedaempft(summe: number, n: number, vorannahme: number, k = K): number {
  return (summe + k * vorannahme) / (n + k);
}

/** Unähnlichkeit einer Person zu allen anderen einer Periode. Die
 *  Vorannahme ist die übliche Unähnlichkeit zwischen den beiden Fraktionen:
 *  Wer selten abstimmt, bleibt so bei der eigenen Fraktion, statt in die
 *  Mitte der Karte zu rutschen und dort wie ein Brückenbauer auszusehen. */
export function zuPerson(
  ego: number,
  stimmen: Int8Array[],
  hauptfraktion: number[],
  vorannahme: number[][],
): { delta: Float64Array; n: Uint16Array } {
  const delta = new Float64Array(stimmen.length);
  const n = new Uint16Array(stimmen.length);
  const fe = hauptfraktion[ego];
  for (let i = 0; i < stimmen.length; i++) {
    if (i === ego) continue;
    const p = paar(stimmen[ego], stimmen[i]);
    delta[i] = gedaempft(p.summe, p.n, vorannahme[fe][hauptfraktion[i]]);
    n[i] = p.n;
  }
  return { delta, n };
}

/** Die Fraktion, für die jemand in der Periode am häufigsten abgestimmt hat.
 *  `fraktion` trägt je Abstimmung den Index als Ziffer, "-" ohne Mandat. */
export function hauptfraktion(fraktion: string): number {
  const zahl = new Map<string, number>();
  for (const c of fraktion) if (c !== "-") zahl.set(c, (zahl.get(c) ?? 0) + 1);
  let best = "", max = -1;
  for (const [c, z] of zahl) if (z > max) { best = c; max = z; }
  return Number(best);
}

export interface Abwesenheit {
  abwesend: number;  // nicht abgegeben
  mandat: number;    // Abstimmungen, bei denen die Person im Bundestag saß
}

/** Getrennt vom Netz: Abwesenheit fließt nicht in die Nähe ein, kann aber
 *  selbst eine Aussage sein. Wer gegen die eigene Fraktion ist, bleibt oft
 *  lieber weg, als dagegen zu stimmen. */
export function abwesenheit(stimmen: string): Abwesenheit {
  let abwesend = 0, mandat = 0;
  for (const c of stimmen) {
    if (c === "-" || c === "x") continue;
    mandat++;
    if (c === "a") abwesend++;
  }
  return { abwesend, mandat };
}

export interface Abweichung {
  summe: number;      // aufsummierte Distanz zur Fraktionslinie
  n: number;          // Abstimmungen mit Linie, bei denen die Person abstimmte
  gegen: number;      // davon Gegenstimmen (ja gegen nein oder umgekehrt)
  enthalten: number;  // davon Enthaltungen gegen eine Ja- oder Nein-Linie
}

/** Fraktionslinie je Abstimmung: die häufigste Stimme unter den anwesenden
 *  Mitgliedern. Bei Gleichstand gibt es keine Linie, dann zählt die
 *  Abstimmung für diese Fraktion nicht. Abweichung mit derselben Skala wie
 *  die Nähe: Gegenstimme 1, Enthaltung gegen die Linie 0,5.
 *
 *  `fraktion[i][j]`: Fraktionsindex der Person i bei Abstimmung j, oder -1.
 *  `ohneLinie`: Fraktionsindizes, die keine Fraktion sind (fraktionslos). */
export function abweichungen(
  stimmen: Int8Array[],
  fraktion: Int8Array[],
  ohneLinie: Set<number>,
): Abweichung[] {
  const out = stimmen.map(() => ({ summe: 0, n: 0, gegen: 0, enthalten: 0 }));
  const P = stimmen[0]?.length ?? 0;
  for (let j = 0; j < P; j++) {
    const zahl = new Map<number, [number, number, number]>();  // nein, Enth., ja
    for (let i = 0; i < stimmen.length; i++) {
      const v = stimmen[i][j], f = fraktion[i][j];
      if (v === FEHLT || f < 0 || ohneLinie.has(f)) continue;
      let z = zahl.get(f);
      if (!z) zahl.set(f, (z = [0, 0, 0]));
      z[v + 1]++;
    }
    const linie = new Map<number, number>();
    for (const [f, z] of zahl) {
      const max = Math.max(...z);
      if (z.filter(x => x === max).length === 1) linie.set(f, z.indexOf(max) - 1);
    }
    for (let i = 0; i < stimmen.length; i++) {
      const v = stimmen[i][j], l = linie.get(fraktion[i][j]);
      if (v === FEHLT || l === undefined) continue;
      const d = distanz(v, l);
      const a = out[i];
      a.summe += d;
      a.n++;
      if (d === 1) a.gegen++;
      else if (d === 0.5 && v === 0) a.enthalten++;
    }
  }
  return out;
}
