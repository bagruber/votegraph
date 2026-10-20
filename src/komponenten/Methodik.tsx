// Die Regeln, nach denen gerechnet wird, und die Quellen.
import type { Index, Vorbereitet } from "../lib/daten.ts";
import { K } from "../lib/mass.ts";

const zahl = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 });

export function Methodik({ index, periode }: { index: Index; periode: Vorbereitet }) {
  return (
    <section className="methodik" aria-labelledby="methodik-titel">
      <h2 id="methodik-titel">So wird gerechnet</h2>
      <div className="methodik-spalten">
        <div>
          <h3>Grundlage</h3>
          <p>
            Einzelstimmen gibt es nur für namentliche Abstimmungen. Die meisten Beschlüsse fallen per Handzeichen,
            namentlich abgestimmt wird auf Antrag, meist der Opposition. Jede Nähe hier ist Nähe
            bei dieser Auswahl, kein Maß für politische Übereinstimmung insgesamt.
          </p>
          <h3>Nähe</h3>
          <p>
            Ja, Enthaltung und Nein liegen auf einer Linie. Ja gegen Nein zählt als volle Abweichung, Ja oder Nein
            gegen Enthaltung als halbe. Verglichen wird nur, wo beide abgestimmt haben: Abwesenheit verschiebt nichts,
            sie macht die Grundlage dünner.
          </p>
          <p>
            Dünne Grundlagen werden gedämpft. Zu den echten Abstimmungen kommen {K} gedachte, die so ausfallen, wie
            es zwischen den beiden Fraktionen üblich ist. Wer selten abstimmt, bleibt so bei der eigenen Fraktion,
            statt zwischen die Fraktionen zu rutschen und dort wie eine Brückenbauerin auszusehen. Mehr gemeinsame
            Abstimmungen bewegen den Wert weiter von dieser Vorannahme weg.
          </p>
        </div>
        <div>
          <h3>Karte</h3>
          <p>
            Die Lage der Punkte minimiert die Abweichung zwischen Bildabstand und Unähnlichkeit (SMACOF). Ganz gelingt
            das in zwei Dimensionen nie; der verbleibende Stress liegt in der {periode.wp}. Wahlperiode bei{" "}
            {zahl.format(periode.stress.flach)} (unter 0,1 gilt als gut, im Raum {zahl.format(periode.stress.raum)}).
            Die Ego-Ansicht zeigt die Abstände zur gewählten Person exakt. Jede Periode wird für sich berechnet und an
            der vorigen ausgerichtet, anhand der Abgeordneten, die in beiden saßen.
          </p>
          <h3>Fraktionslinie</h3>
          <p>
            Die häufigste Stimme der anwesenden Mitglieder. Bei Gleichstand gibt es keine Linie. Die Fraktion hängt an
            der einzelnen Abstimmung, Wechsel innerhalb einer Periode sind berücksichtigt. Abstimmungen ohne
            Fraktionsdisziplin zählen vorerst mit.
          </p>
          <h3>Regierungslinie</h3>
          <p>
            Eine gedachte Person, die bei jeder Abstimmung so stimmt wie die Mehrheit der anwesenden Abgeordneten
            aus den Regierungsfraktionen. Wechselt die Koalition innerhalb einer Periode (die Ampel ohne FDP ab
            November 2024), wechselt die Linie mit. Das Europaparlament hat keine Regierung und deshalb keine Linie.
          </p>
          <h3>Themen</h3>
          <p>
            Jede Abstimmung ist bis zu mehreren von sechs Themen zugeordnet: im Bundestag bis 2021 nach den
            Politikfeldern, die BTVote kodiert, danach und in den Landtagen nach den Themen von abgeordnetenwatch, im
            Europaparlament nach den Sachgebieten des Legislative Observatory. Eine Themenkarte rechnet der Browser
            nach denselben Regeln selbst und richtet sie an der Karte der ganzen Periode aus. Unter zehn
            Abstimmungen gibt es keine.
          </p>
          <h3>Quellen</h3>
          <p>{index.quelle} Stand der Daten: {new Date(index.erstellt).toLocaleDateString("de-DE")}.</p>
        </div>
      </div>
    </section>
  );
}
