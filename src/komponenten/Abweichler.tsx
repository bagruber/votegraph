// Die stärksten Abweichler je Fraktion in der gewählten Periode.
import type { Vorbereitet } from "../lib/daten.ts";
import { farbvariable, fraktionsname, OHNE_LINIE } from "../lib/fraktionen.ts";
import { mindestgrundlage } from "../lib/mass.ts";

const JE_FRAKTION = 5;
const zahl = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** "4 dagegen, 9 enthalten" — was null ist, bleibt weg. Der dritte Fall:
 *  Ja oder Nein, wo die Fraktion sich enthielt; er zählt halb wie eine
 *  Enthaltung gegen die Linie. */
export function abweichungen(a: { summe: number; gegen: number; enthalten: number }): string {
  const statt = Math.round(2 * (a.summe - a.gegen)) - a.enthalten;
  return [a.gegen && `${a.gegen} dagegen`, a.enthalten && `${a.enthalten} enthalten`,
    statt && `${statt} abgestimmt statt enthalten`].filter(Boolean).join(", ");
}

interface Props {
  periode: Vorbereitet;
  thema: string | null;
  onAuswahl: (id: string) => void;
}

export function Abweichler({ periode, thema, onAuswahl }: Props) {
  const mindestens = mindestgrundlage(periode.abstimmungen.length);
  const spalten = periode.fraktionen
    .map((kennung, f) => {
      const mitglieder = periode.mdb.filter(m => m.f === f && m.abw);
      const s = mitglieder.reduce((x, m) => x + m.abw!.summe, 0);
      const n = mitglieder.reduce((x, m) => x + m.abw!.n, 0);
      return {
        kennung, f,
        geschlossen: n ? 1 - s / n : 1,
        liste: mitglieder.filter(m => m.abw!.summe > 0 && m.abw!.n >= mindestens)
          .sort((a, b) => b.abw!.wert - a.abw!.wert).slice(0, JE_FRAKTION),
      };
    })
    .filter(sp => !OHNE_LINIE.has(sp.kennung) && sp.liste.length);

  return (
    <section className="abweichler" aria-labelledby="abweichler-titel">
      <h2 id="abweichler-titel">Wer am häufigsten von der Fraktionslinie abwich</h2>
      <p className="erlaeuterung">
        Fraktionslinie ist, wie die Mehrheit der anwesenden Fraktionsmitglieder stimmte. Eine Gegenstimme zählt
        voll, eine Enthaltung halb. Wer an wenigen Abstimmungen teilnahm, wird zum Mittel der Fraktion gedämpft;
        aufgeführt ist nur, wer bei mindestens {mindestens} Abstimmungen mit Fraktionslinie dabei war.
        {thema && <> Die Liste gilt für alle Abstimmungen der Periode, nicht nur für das Thema {thema}.</>}
      </p>
      <div className="abw-spalten">
        {spalten.map(sp => (
          <div key={sp.kennung} className="abw-spalte">
            <h3>
              <span className="punkt" style={{ background: `var(${farbvariable(sp.kennung)})` }} />
              <span className="abw-fraktion">{fraktionsname(periode, sp.f)}</span>
              <span className="abw-geschlossen">geschlossen zu {zahl.format(sp.geschlossen * 100)}&nbsp;%</span>
            </h3>
            <ol className="personen">
              {sp.liste.map(m => (
                <li key={m.id}>
                  <button type="button" className="person-zeile abw-zeile" onClick={() => onAuswahl(m.id)}>
                    <span className="person-name">
                      {m.name}
                      <span className="person-fraktion">
                        {abweichungen(m.abw!)} bei {m.abw!.n}
                      </span>
                    </span>
                    <span className="person-wert">{zahl.format(m.abw!.wert * 100)}&nbsp;%</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
