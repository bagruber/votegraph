// Übereinstimmung einer Person mit jeder Fraktion über ihre Wahlperioden, als
// Linien. Zeigt als Zahl, was der Regler als Bewegung zeigt: früher nah an der
// einen Fraktion, später an der anderen, oder in der großen Koalition plötzlich
// nah am bisherigen Gegner.
import { useEffect, useRef, useState } from "react";
import type { Index, Verlauf as VerlaufDaten } from "../lib/daten.ts";
import type { Farben } from "../lib/farben.ts";
import { kennungsname, OHNE_LINIE } from "../lib/fraktionen.ts";

const RAND = { links: 34, rechts: 22, oben: 10, unten: 34 };
const HOEHE = 190;
const LINIE = "regierungslinie";

interface Props {
  eintraege: VerlaufDaten["personen"][string];
  namen: Record<string, string>;
  perioden: Index["perioden"];
  farben: Farben;
}

export function Verlauf({ eintraege, namen, perioden, farben }: Props) {
  const huelle = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(520);
  const [aktiv, setAktiv] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBreite(Math.round(e.contentRect.width)));
    ro.observe(huelle.current!);
    return () => ro.disconnect();
  }, []);

  const serien = [...new Set(eintraege.flatMap(([, , n]) => Object.keys(n)))].filter(k => !OHNE_LINIE.has(k));
  const mitLinie = eintraege.some(e => e[3] !== null);
  const alle = [...serien, ...(mitLinie ? [LINIE] : [])];
  const wert = (e: (typeof eintraege)[number], k: string) => (k === LINIE ? e[3] : e[2][k]) ?? null;
  const name = (k: string) => (k === LINIE ? "Regierungslinie" : kennungsname(k, namen));
  // Grau statt Tinte: Schwarz trägt schon die Union.
  const farbe = (k: string) => (k === LINIE ? farben.tinte3 : farben.fraktion(k));

  const innen = breite - RAND.links - RAND.rechts;
  const x = (i: number) => RAND.links + (eintraege.length === 1 ? innen / 2 : (i / (eintraege.length - 1)) * innen);
  const y = (v: number) => RAND.oben + (1 - v / 100) * (HOEHE - RAND.oben - RAND.unten);
  const jahr = (wp: number) => perioden.find(p => p.wp === wp)?.von.slice(0, 4) ?? "";

  const pfad = (k: string) => {
    let d = "", offen = false;
    eintraege.forEach((e, i) => {
      const v = wert(e, k);
      if (v === null) { offen = false; return; }
      d += `${offen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      offen = true;
    });
    return d;
  };

  const aktuell = aktiv !== null ? eintraege[aktiv] : null;
  return (
    <figure className="verlauf">
      <figcaption>Übereinstimmung mit den Fraktionen über die Wahlperioden</figcaption>
      <ul className="verlauf-legende">
        {alle.map(k => (
          <li key={k}>
            <span className={k === LINIE ? "raute" : "punkt"} style={{ background: farbe(k) }} />
            {name(k)}
          </li>
        ))}
      </ul>
      <div className="verlauf-flaeche" ref={huelle}>
        <svg width={breite} height={HOEHE} role="img"
          aria-label="Linien je Fraktion; die Tabelle darunter enthält dieselben Werte">
          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line x1={RAND.links} x2={breite - RAND.rechts} y1={y(v)} y2={y(v)} stroke={farben.linie} />
              <text x={RAND.links - 6} y={y(v) + 4} textAnchor="end" className="verlauf-achse">{v}</text>
            </g>
          ))}
          {eintraege.map(([wp], i) => (
            <text key={wp} x={x(i)} y={HOEHE - 16} textAnchor="middle" className="verlauf-achse">
              <tspan x={x(i)} className="verlauf-wp">{wp}</tspan>
              <tspan x={x(i)} dy={13}>{jahr(wp)}</tspan>
            </text>
          ))}
          {aktiv !== null && (
            <line x1={x(aktiv)} x2={x(aktiv)} y1={RAND.oben} y2={HOEHE - RAND.unten} stroke={farben.tinte3} />
          )}
          {alle.map(k => (
            <g key={k}>
              <path d={pfad(k)} fill="none" stroke={farbe(k)} strokeWidth={2} strokeLinejoin="round" />
              {eintraege.map((e, i) => {
                const v = wert(e, k);
                if (v === null) return null;
                // Die eigene Fraktion der Periode bekommt einen größeren Punkt.
                const eigen = e[1] === k;
                return <circle key={i} cx={x(i)} cy={y(v)} r={eigen ? 4.5 : 3} fill={farbe(k)}
                  stroke={farben.grund} strokeWidth={eigen ? 2 : 1} />;
              })}
            </g>
          ))}
          {eintraege.map((_, i) => (
            <rect key={i} x={x(i) - innen / Math.max(1, eintraege.length - 1) / 2} y={0}
              width={innen / Math.max(1, eintraege.length - 1)} height={HOEHE} fill="transparent"
              onPointerEnter={() => setAktiv(i)} onPointerLeave={() => setAktiv(null)} />
          ))}
        </svg>
        {aktuell && (
          <div className="verlauf-tipp" style={{
            left: Math.min(Math.max(x(aktiv!) + 12, 0), breite - 190), top: RAND.oben,
          }}>
            <strong>{aktuell[0]}. Wahlperiode</strong>
            {alle.map(k => [k, wert(aktuell, k)] as const).filter(([, v]) => v !== null)
              .sort((a, b) => b[1]! - a[1]!).map(([k, v]) => (
                <span key={k}>
                  <i className={k === LINIE ? "raute" : "punkt"} style={{ background: farbe(k) }} />
                  {name(k)}{aktuell[1] === k ? " (eigene)" : ""}<b>{v}&nbsp;%</b>
                </span>
              ))}
          </div>
        )}
      </div>
      <details className="verlauf-tabelle">
        <summary>Als Tabelle</summary>
        <table>
          <thead>
            <tr><th>Wahlperiode</th>{alle.map(k => <th key={k}>{name(k)}</th>)}</tr>
          </thead>
          <tbody>
            {eintraege.map(e => (
              <tr key={e[0]}>
                <td>{e[0]} ({jahr(e[0])})</td>
                {alle.map(k => <td key={k}>{wert(e, k) === null ? "–" : `${wert(e, k)} %`}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
