// Die ausgewählte Person über der Karte: Fraktionstreue, Abwesenheit und wer
// ihr am nächsten und am fernsten steht.
import type { Person, Vorbereitet } from "../lib/daten.ts";
import { farbvariable, fraktionsname, OHNE_LINIE } from "../lib/fraktionen.ts";
import { mindestgrundlage } from "../lib/mass.ts";
import { spanne } from "./Suche.tsx";

const mehrzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

// Geschütztes Leerzeichen: "18 %" bricht nicht zwischen Zahl und Zeichen um.
const prozent = (x: number) => `${Math.round(x * 100)} %`;
const LISTE = 5;

interface Props {
  periode: Vorbereitet;
  person: Person;
  ego: number | null;
  egoDelta: Float64Array | null;
  egoN: Uint16Array | null;
  onAuswahl: (id: string | null) => void;
  onWp: (wp: number) => void;
  im: string;
  rolle: string | null;      // Kanzler/Ministerpräsident, wenn die Person es in dieser Periode war
}

export function Detail({ periode, person, ego, egoDelta, egoN, onAuswahl, onWp, im, rolle }: Props) {
  const kopf = (
    <div className="detail-kopf">
      <h2>{person.name}</h2>
      <button type="button" className="knopf leise" onClick={() => onAuswahl(null)}>
        Auswahl aufheben
      </button>
    </div>
  );

  if (ego === null || !egoDelta || !egoN) {
    return (
      <section className="detail" aria-live="polite">
        {kopf}
        <p className="detail-text">
          Saß in der {periode.wp}. Wahlperiode nicht im {im}. Zu einer der eigenen Perioden wechseln:
        </p>
        <div className="wp-knoepfe">
          {person.wps.map(w => (
            <button key={w} type="button" className="knopf" onClick={() => onWp(w)}>{w}. WP</button>
          ))}
        </div>
      </section>
    );
  }

  const m = periode.mdb[ego];
  const kennung = periode.fraktionen[m.f];
  const fraktion = fraktionsname(periode, m.f);
  const ohneFraktion = OHNE_LINIE.has(kennung);
  const abgegeben = periode.abgegeben[ego];

  const mindestens = mindestgrundlage(periode.abstimmungen.length);
  const andere = periode.mdb.map((_, i) => i).filter(i => i !== ego && egoN[i] >= mindestens);
  const aehnlich = andere.filter(i => ohneFraktion || periode.mdb[i].f !== m.f)
    .sort((a, b) => egoDelta[a] - egoDelta[b]).slice(0, LISTE);
  const unaehnlich = andere.filter(i => ohneFraktion || periode.mdb[i].f === m.f)
    .sort((a, b) => egoDelta[b] - egoDelta[a]).slice(0, LISTE);

  // Ja oder Nein, wo die Fraktion sich enthielt (zählt halb, wie eine Enthaltung gegen die Linie)
  const statt = m.abw ? Math.round(2 * (m.abw.summe - m.abw.gegen)) - m.abw.enthalten : 0;
  const kollegen = periode.mdb.filter(x => x.f === m.f && x.abw).sort((a, b) => b.abw!.wert - a.abw!.wert);
  const rang = kollegen.findIndex(x => x.id === m.id) + 1;

  const zeile = (i: number) => {
    const o = periode.mdb[i];
    const f = periode.fraktionen[o.f];
    return (
      <li key={o.id}>
        <button type="button" className="person-zeile" onClick={() => onAuswahl(o.id)}>
          <span className="punkt" style={{ background: `var(${farbvariable(f)})` }} />
          <span className="person-name">
            {o.name}
            {(ohneFraktion || o.f !== m.f) && <span className="person-fraktion">{fraktionsname(periode, o.f)}</span>}
          </span>
          <span className="person-wert">{prozent(1 - egoDelta[i])}</span>
          <span className="person-n">aus {egoN[i]}</span>
        </button>
      </li>
    );
  };

  return (
    <section className="detail" aria-live="polite">
      {kopf}
      <p className="detail-fraktion">
        <span className="punkt" style={{ background: `var(${farbvariable(kennung)})` }} />
        {m.wechsel
          ? m.wechsel.map(i => fraktionsname(periode, i)).join(" → ")
          : fraktion}
        <span className="trenner">·</span>
        {rolle && <>{rolle}<span className="trenner">·</span></>}
        im {im} in WP {spanne(person.wps)}
      </p>
      <div className="detail-text">
        {m.abw ? (
          <p>
            {m.abw.summe === 0
              ? <>Folgt der Linie der Fraktion {fraktion} bei allen {m.abw.n} Abstimmungen, bei denen sie eine hatte.</>
              : <>Folgt der Linie der Fraktion {fraktion} zu {prozent(1 - m.abw.summe / m.abw.n)}:{" "}
                {[m.abw.gegen && mehrzahl(m.abw.gegen, "Gegenstimme", "Gegenstimmen"),
                  m.abw.enthalten && mehrzahl(m.abw.enthalten, "Enthaltung", "Enthaltungen"),
                  statt && `${statt}-mal Ja oder Nein, wo die Fraktion sich enthielt`]
                  .filter(Boolean).join(", ")}{" "}
                bei {m.abw.n} Abstimmungen mit klarer Linie.
                {" "}{rang === 1 ? "Niemand in der Fraktion weicht stärker ab." : `Rang ${rang} von ${kollegen.length} bei der Abweichung.`}</>}
          </p>
        ) : (
          <p>Ohne Fraktion, daher ohne Fraktionslinie.</p>
        )}
        <p>
          Nicht abgestimmt bei {m.abwesend[0]} von {m.abwesend[1]} Abstimmungen ({prozent(m.abwesend[0] / Math.max(1, m.abwesend[1]))}).
          {abgegeben < mindestens && <> Mit nur {abgegeben} abgegebenen Stimmen stützen sich die Nähe-Werte stark auf das, was für die Fraktion üblich ist.</>}
        </p>
      </div>
      <div className="listen">
        <div>
          <h3>{ohneFraktion ? "Am ähnlichsten" : "Am ähnlichsten aus anderen Fraktionen"}</h3>
          {aehnlich.length
            ? <ol className="personen">{aehnlich.map(zeile)}</ol>
            : <p className="listen-leer">Niemand mit genug gemeinsamen Abstimmungen.</p>}
        </div>
        <div>
          <h3>{ohneFraktion ? "Am unähnlichsten" : "Am unähnlichsten aus der eigenen Fraktion"}</h3>
          {unaehnlich.length
            ? <ol className="personen">{unaehnlich.map(zeile)}</ol>
            : <p className="listen-leer">Niemand mit genug gemeinsamen Abstimmungen.</p>}
        </div>
        <p className="listen-hinweis">
          Übereinstimmung aus den gemeinsamen Abstimmungen, Enthaltungen halb gezählt. Aufgeführt ist nur, wer
          mindestens {mindestens} Abstimmungen gemeinsam hatte.
        </p>
      </div>
    </section>
  );
}
