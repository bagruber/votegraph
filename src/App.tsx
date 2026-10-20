import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Abweichler } from "./komponenten/Abweichler.tsx";
import { Detail } from "./komponenten/Detail.tsx";
import { Karte } from "./komponenten/Karte.tsx";
import { Methodik } from "./komponenten/Methodik.tsx";
import { Regler } from "./komponenten/Regler.tsx";
import { Suche } from "./komponenten/Suche.tsx";
import { useIndex, useParlamente, usePeriode, vorladen, type Person } from "./lib/daten.ts";
import { useFarben } from "./lib/farben.ts";
import { farbvariable, fraktionsname } from "./lib/fraktionen.ts";
import { mindestgrundlage, zuPerson } from "./lib/mass.ts";

// three.js wiegt mehr als der Rest der Seite; es kommt erst, wenn jemand die
// 3D-Ansicht öffnet.
const Raum = lazy(() => import("./komponenten/Raum.tsx"));

type Ansicht = "karte" | "raum";

export function App() {
  const parlamente = useParlamente();
  const [parlament, setParlament] = useState("bundestag");
  const index = useIndex(parlament);
  const [wp, setWp] = useState<number | null>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("karte");
  const [hervorZeiger, setHervorZeiger] = useState<number | null>(null);
  const [hervorFest, setHervorFest] = useState<number | null>(null);
  const [zeigen, setZeigen] = useState(0);
  const periode = usePeriode(parlament, wp);
  const farben = useFarben();

  // Wer unten in der Abweichler-Liste wählt, soll die Auswahl oben auch sehen.
  useEffect(() => {
    if (!zeigen) return;
    const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".detail")?.scrollIntoView({ behavior: ruhig ? "auto" : "smooth", block: "start" });
  }, [zeigen]);

  useEffect(() => {
    if (index && wp === null) setWp(index.perioden[index.perioden.length - 1].wp);
  }, [index, wp]);

  useEffect(() => {
    if (wp === null || !index) return;
    for (const n of [wp - 1, wp + 1]) if (index.perioden.some(p => p.wp === n)) vorladen(parlament, n);
  }, [parlament, wp, index]);

  useEffect(() => {
    if (index) document.title = `votegraph · Wer stimmt mit wem im ${index.im}`;
  }, [index]);

  // Die Hervorhebung gilt einer Fraktion dieser Periode; beim Wechsel verfällt sie.
  useEffect(() => { setHervorFest(null); setHervorZeiger(null); }, [wp]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) setAuswahl(null);
    };
    addEventListener("keydown", taste);
    return () => removeEventListener("keydown", taste);
  }, []);

  const ego = periode && auswahl ? periode.index.get(auswahl) ?? null : null;
  const egoDaten = useMemo(
    () => (periode && ego !== null ? zuPerson(ego, periode.kodiert, periode.hauptfraktion, periode.vorannahme) : null),
    [periode, ego],
  );
  const person = useMemo(
    () => (index && auswahl ? index.personen.find(p => p.id === auswahl) ?? null : null),
    [index, auswahl],
  );

  const meta = index?.perioden.find(p => p.wp === wp);
  if (!index || !periode || !meta || !parlamente) {
    return <main className="laden">Daten werden geladen</main>;
  }
  const veraltet = periode.wp !== wp;
  const hervor = hervorZeiger ?? hervorFest;

  // Wahlperioden-Nummern überschneiden sich (Bundestag 18, Bayern 18); beim
  // Wechsel beginnt das neue Parlament deshalb mit seiner jüngsten Periode.
  function wechsleParlament(id: string) {
    setParlament(id);
    setWp(null);
    setAuswahl(null);
  }

  function waehlePerson(p: Person) {
    setAuswahl(p.id);
    if (!p.wps.includes(wp!)) {
      // Die nächstgelegene eigene Periode, bei Gleichstand die spätere.
      setWp(p.wps.reduce((a, b) => (Math.abs(b - wp!) <= Math.abs(a - wp!) ? b : a)));
    }
  }

  const zaehler = periode.fraktionen.map((_, f) => periode.mdb.filter(m => m.f === f).length);
  const egoName = ego !== null ? periode.mdb[ego].name : null;
  // Aus der Periode, die gerade gezeichnet ist; beim Laden kann das noch die vorige sein.
  const chefMeta = index.perioden.find(p => p.wp === periode.wp)?.chef ?? null;
  const chef = chefMeta && periode.index.has(chefMeta.id)
    ? { i: periode.index.get(chefMeta.id)!, rolle: chefMeta.rolle } : null;

  return (
    <>
      <header className="kopf">
        <div className="marke">
          <span className="wortmarke">votegraph</span>
          <h1>
            Wer stimmt mit wem im{" "}
            <span className="parlament-wahl">
              <select aria-label="Parlament" value={parlament} onChange={e => wechsleParlament(e.target.value)}>
                {parlamente.map(p => <option key={p.id} value={p.id}>{p.im}</option>)}
              </select>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
            </span>
          </h1>
        </div>
        <Suche personen={index.personen} onWahl={waehlePerson} />
      </header>

      <main>
        <section className="periode" aria-labelledby="periode-titel">
          <div className="periode-kopf">
            <h2 id="periode-titel">
              {wp}. Wahlperiode
              <span className="periode-jahre">{meta.von.slice(0, 4)}–{meta.bis ? meta.bis.slice(0, 4) : "heute"}</span>
            </h2>
            <p className="periode-info">
              {meta.regierung && <>{meta.regierung}<span className="trenner">·</span></>}
              {meta.abstimmungen} namentliche Abstimmungen
              <span className="trenner">·</span>
              {meta.mdb} Abgeordnete
            </p>
          </div>
          {index.perioden.length > 1 && (
            <Regler perioden={index.perioden} wp={meta.wp} markiert={person?.wps ?? null} onWp={setWp} />
          )}
        </section>

        {person && (
          <Detail
            periode={periode}
            person={person}
            ego={ego}
            egoDelta={egoDaten?.delta ?? null}
            egoN={egoDaten?.n ?? null}
            onAuswahl={setAuswahl}
            onWp={setWp}
            im={index.im}
            rolle={chefMeta && chefMeta.id === person.id ? chefMeta.rolle : null}
          />
        )}

        <section className={"netz" + (veraltet ? " veraltet" : "")} aria-label="Nähe-Netz">
          <div className="netz-leiste">
            <ul className="legende">
              {periode.fraktionen.map((k, f) => zaehler[f] > 0 && (
                <li key={k}>
                  <button
                    type="button"
                    aria-pressed={hervorFest === f}
                    className={hervor !== null && hervor !== f ? "gedimmt" : ""}
                    onMouseEnter={() => setHervorZeiger(f)}
                    onMouseLeave={() => setHervorZeiger(null)}
                    onFocus={() => setHervorZeiger(f)}
                    onBlur={() => setHervorZeiger(null)}
                    onClick={() => setHervorFest(h => (h === f ? null : f))}
                  >
                    <span className="punkt" style={{ background: `var(${farbvariable(k)})` }} />
                    {fraktionsname(periode, f)}
                    <span className="legende-zahl">{zaehler[f]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="umschalter" role="group" aria-label="Darstellung">
              <button type="button" aria-pressed={ansicht === "karte"} onClick={() => setAnsicht("karte")}>Karte</button>
              <button type="button" aria-pressed={ansicht === "raum"} onClick={() => setAnsicht("raum")}>
                Raum <span className="versuch">Versuch</span>
              </button>
            </div>
          </div>

          {ansicht === "karte" ? (
            <Karte
              periode={periode}
              rahmen={index.rahmen.flach}
              ego={ego}
              egoDelta={egoDaten?.delta ?? null}
              hervor={hervor}
              chef={chef}
              farben={farben}
              onAuswahl={setAuswahl}
            />
          ) : (
            <Suspense fallback={<div className="raum-laden">3D-Ansicht wird geladen</div>}>
              <Raum
                periode={periode}
                umfang={index.rahmen.raum}
                ego={ego}
                egoDelta={egoDaten?.delta ?? null}
                hervor={hervor}
                chef={chef}
                farben={farben}
                onAuswahl={setAuswahl}
              />
            </Suspense>
          )}

          <p className="netz-legende">
            {egoName && ansicht === "karte"
              ? <>Abstand zur Mitte: wie oft {egoName} anders stimmte. Die Ringe markieren die Übereinstimmung.
                  Ein Klick neben die Punkte hebt die Auswahl auf.</>
              : <>Jeder Punkt ist eine Abgeordnete oder ein Abgeordneter. Je näher zwei Punkte, desto öfter stimmten
                  sie gleich. Hohle Kreise haben weniger als {mindestgrundlage(periode.abstimmungen.length)} Stimmen abgegeben.</>}
          </p>
        </section>

        <Abweichler periode={periode} onAuswahl={id => { setAuswahl(id); setZeigen(z => z + 1); }} />
        <Methodik index={index} periode={periode} />
      </main>
    </>
  );
}
