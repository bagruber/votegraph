import { describe, expect, it } from "vitest";
import {
  abweichungen, abwesenheit, distanz, FEHLT, gedaempft, hauptfraktion, kodiere, paar, paarmatrix,
  regierungslinie, vorannahmen, zuPerson,
} from "./mass.ts";

const aehnlichkeit = (gleich: number, von: number, vorannahme = 0.5, k?: number) =>
  1 - gedaempft(von - gleich, von, vorannahme, k);

describe("Ja/Nein stößt stärker ab als Ja/Enthaltung oder Enthaltung/Nein", () => {
  it("stuft die Distanz je Abstimmung ab", () => {
    const [ja, enth, nein] = [1, 0, -1];
    expect(distanz(ja, nein)).toBe(1);
    expect(distanz(ja, enth)).toBe(0.5);
    expect(distanz(enth, nein)).toBe(0.5);
    expect(distanz(enth, enth)).toBe(0);
  });

  it("summiert über die Abstimmungen", () => {
    expect(paar(kodiere("jjj"), kodiere("nen"))).toEqual({ summe: 2.5, n: 3 });
  });
});

describe("Abwesenheit verzerrt nicht", () => {
  it("lässt Abstimmungen weg, bei denen eine Seite fehlt", () => {
    const ohne = paar(kodiere("jjn"), kodiere("jnn"));
    const mit = paar(kodiere("jjnaa-uxj"), kodiere("jnnjnj-ja"));
    expect(mit).toEqual(ohne);
  });

  it("kodiert alles außer ja, nein und Enthaltung als fehlend", () => {
    expect([...kodiere("jena-ux")]).toEqual([1, 0, -1, FEHLT, FEHLT, FEHLT, FEHLT]);
  });
});

describe("4 von 5 zählt weniger als 8 von 10, aber mehr als 4 von 10", () => {
  // Wörtlich gilt die Regel nur, solange die Vorannahme unähnlicher ist als
  // die beobachteten 80 %. Liegt sie darüber (zwei aus einer Fraktion, die
  // sonst zu 95 % gleich stimmen), sind 4 von 5 und 8 von 10 beide Belege für
  // weniger Nähe als erwartet — und 8 von 10 der stärkere. Allgemein heißt die
  // Regel deshalb: Mehr gemeinsame Abstimmungen bewegen den Wert weiter von
  // der Vorannahme weg, hin zum beobachteten Anteil.
  it.each([
    ["neutrale Vorannahme, k = 5", 0.5, 5],
    ["neutrale Vorannahme, Standard-k", 0.5, undefined],
    ["Vorannahme ähnlicher als beobachtet", 0.05, undefined],
    ["Vorannahme unähnlicher als beobachtet", 0.7, undefined],
  ])("%s", (_, vorannahme, k) => {
    const v45 = aehnlichkeit(4, 5, vorannahme, k);
    const v810 = aehnlichkeit(8, 10, vorannahme, k);
    const v410 = aehnlichkeit(4, 10, vorannahme, k);
    const erwartet = 1 - vorannahme;
    expect(Math.abs(v810 - erwartet)).toBeGreaterThan(Math.abs(v45 - erwartet));
    expect(v45).toBeGreaterThan(v410);
    if (erwartet < 0.8) expect(v810).toBeGreaterThan(v45);
  });

  it("ergibt mit k = 5 die Werte aus der Besprechung", () => {
    expect(aehnlichkeit(8, 10, 0.5, 5)).toBeCloseTo(0.70, 2);
    expect(aehnlichkeit(4, 5, 0.5, 5)).toBeCloseTo(0.65, 2);
    expect(aehnlichkeit(4, 10, 0.5, 5)).toBeCloseTo(0.43, 2);
  });

  it("hält Wenig-Abstimmer bei der Vorannahme ihrer Fraktionen", () => {
    // Zwei aus derselben Fraktion (Vorannahme 0,02), eine gemeinsame
    // abweichende Stimme: Das reicht nicht, um sie weit auseinanderzuschieben.
    expect(gedaempft(1, 1, 0.02)).toBeLessThan(0.15);
  });
});

describe("zuPerson", () => {
  it("dämpft mit der Vorannahme des Fraktionspaars", () => {
    const stimmen = ["jjjj", "jjjj", "nnnn", "aaaj"].map(kodiere);
    const haupt = [0, 0, 1, 1];
    const vor = [[0.02, 0.8], [0.8, 0.02]];
    const { delta, n } = zuPerson(0, stimmen, haupt, vor);
    expect(delta[1]).toBeCloseTo((0 + 10 * 0.02) / 14);
    expect(delta[2]).toBeCloseTo((4 + 10 * 0.8) / 14);
    expect(delta[3]).toBeCloseTo((0 + 10 * 0.8) / 11);
    expect([...n]).toEqual([0, 4, 4, 1]);
  });
});

describe("Fraktionslinie und Abweichung", () => {
  const f = (s: string) => Int8Array.from([...s].map(c => (c === "-" ? -1 : Number(c))));

  it("zählt Gegenstimmen voll und Enthaltungen halb", () => {
    const stimmen = ["jj", "jj", "jn", "je"].map(kodiere);
    const fr = ["00", "00", "00", "00"].map(f);
    const a = abweichungen(stimmen, fr, new Set());
    expect(a[2]).toEqual({ summe: 1, n: 2, gegen: 1, enthalten: 0, liste: [[1, -1, 1]] });
    expect(a[3]).toEqual({ summe: 0.5, n: 2, gegen: 0, enthalten: 1, liste: [[1, 0, 1]] });
    expect(a[0].summe).toBe(0);
  });

  it("zieht bei Gleichstand keine Linie", () => {
    const stimmen = ["j", "j", "n", "n"].map(kodiere);
    const a = abweichungen(stimmen, ["0", "0", "0", "0"].map(f), new Set());
    expect(a.every(x => x.n === 0)).toBe(true);
  });

  it("rechnet Fraktionslose nicht als Fraktion", () => {
    const stimmen = ["j", "n", "n"].map(kodiere);
    const a = abweichungen(stimmen, ["1", "1", "1"].map(f), new Set([1]));
    expect(a.every(x => x.n === 0)).toBe(true);
  });

  it("nimmt die Fraktion der jeweiligen Abstimmung, nicht die der Person", () => {
    // Person 2 wechselt nach der ersten Abstimmung von Fraktion 0 zu 1.
    const stimmen = ["jj", "jj", "jn", "nn", "nn"].map(kodiere);
    const fr = ["00", "00", "01", "11", "11"].map(f);
    const a = abweichungen(stimmen, fr, new Set());
    expect(a[2]).toEqual({ summe: 0, n: 2, gegen: 0, enthalten: 0, liste: [] });
  });
});

describe("Aufschlüsselung der Abweichung", () => {
  it("führt so viele Abstimmungen auf, wie gezählt wurden", () => {
    const stimmen = ["jjjje", "jjjjj", "jnnej", "jjjjj"].map(kodiere);
    const fr = ["00000", "00000", "00000", "00000"].map(s => Int8Array.from([...s].map(Number)));
    const a = abweichungen(stimmen, fr, new Set())[2];
    expect(a.liste.length).toBe(a.gegen + a.enthalten);
    expect(a.liste.map(([j]) => j)).toEqual([1, 2, 3]);
  });
});

describe("Regierungslinie", () => {
  const f = (s: string) => Int8Array.from([...s].map(c => (c === "-" ? -1 : Number(c))));

  it("folgt der Mehrheit der Koalition, nicht des ganzen Parlaments", () => {
    // Koalition = Fraktion 0 (zwei Mitglieder), Opposition = Fraktion 1 (drei)
    const stimmen = ["jj", "jn", "nn", "nn", "nn"].map(kodiere);
    const fr = ["00", "00", "11", "11", "11"].map(f);
    const l = regierungslinie(stimmen, fr, () => new Set([0]));
    expect([...l]).toEqual([1, FEHLT]);     // zweite Abstimmung: 1:1 in der Koalition
  });

  it("wechselt die Koalition innerhalb der Periode", () => {
    const stimmen = ["jj", "nn"].map(kodiere);
    const fr = ["00", "11"].map(f);
    const l = regierungslinie(stimmen, fr, j => new Set([j === 0 ? 0 : 1]));
    expect([...l]).toEqual([1, -1]);
  });
});

describe("Paarmatrix und Vorannahme", () => {
  it("rechnet dasselbe wie paar() und lässt ausgeschlossene Zeilen aus der Vorannahme", () => {
    const stimmen = ["jjjjjjjjjj", "jjjjjjjjjj", "nnnnnnnnnn", "jjjjjjjjjj"].map(kodiere);
    const m = paarmatrix(stimmen);
    expect(m.summe[0 * 4 + 2]).toBe(paar(stimmen[0], stimmen[2]).summe);
    const mit = vorannahmen(m, [0, 0, 1, 1], 2);
    const ohne = vorannahmen(m, [0, 0, 1, 1], 2, new Set([3]));
    expect(mit[0][1]).toBeCloseTo(2 / 4 * 1);    // (1 + 1 + 0 + 0) / 4
    expect(ohne[0][1]).toBe(1);
  });

  it("beschränkt sich mit Maske auf eine Auswahl von Abstimmungen", () => {
    const [a, b] = ["jjnn", "jjjj"].map(kodiere);
    expect(paar(a, b, Uint8Array.from([1, 1, 0, 0]))).toEqual({ summe: 0, n: 2 });
  });
});

describe("Abwesenheit und Hauptfraktion", () => {
  it("zählt Abwesenheit nur, wo ein Mandat bestand", () => {
    expect(abwesenheit("--jnaeaux")).toEqual({ abwesend: 2, mandat: 6 });
  });

  it("nimmt die häufigste Fraktion", () => {
    expect(hauptfraktion("--0011111")).toBe(1);
  });
});
