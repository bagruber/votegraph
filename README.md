# votegraph

Wer stimmt mit wem im Bundestag? Ein Nähe-Netz aller Abgeordneten aus den
namentlichen Abstimmungen seit 1983 (10. bis 21. Wahlperiode): Wer oft gleich
stimmt, liegt nah beieinander. Ein Regler wechselt die Wahlperiode, eine
Auswahl rückt eine Person ins Zentrum, darunter stehen die stärksten
Abweichler je Fraktion. Kanzler bzw. Ministerpräsident sind markiert, die
Regierungslinie (wie die Mehrheit der Koalition stimmte) liegt als Raute in der
Karte. Zu jeder Person gibt es die einzelnen Abstimmungen gegen die
Fraktionslinie und den Verlauf über alle Wahlperioden. Die Karte lässt sich
zoomen und auf eines von sechs Themen beschränken.

Dazu das Europäische Parlament seit 2019 und als Test drei Landtage: Bayern
(2008–2028), Baden-Württemberg (2021–2026), Brandenburg (2019–2024).

Live: https://bagruber.github.io/votegraph/

```bash
pnpm install
pnpm dev        # http://localhost:5173/votegraph/
pnpm test
```

## Daten

Im Repo liegen nur die fertigen Dateien unter `public/daten/`. Neu erzeugen:

```bash
pnpm daten      # hole.py → abgeordnetenwatch.py → normalisiere.py → europaparlament.py → baue.ts
```

| Schritt | Was passiert |
|---|---|
| `etl/hole.py` | lädt BTVote (Harvard Dataverse, 234 MB) und die XLSX-Listen samt MdB-Stammdaten von bundestag.de nach `etl/roh/` |
| `etl/normalisiere.py` | bringt beide Quellen in ein Format je Wahlperiode (`etl/zwischen/bundestag/`), verbunden über die MdB-ID; prüft die 19. WP gegen beide Quellen |
| `etl/abgeordnetenwatch.py` | lädt die Landtage aus `etl/parlamente.json` von abgeordnetenwatch und schreibt sie im selben Format nach `etl/zwischen/<parlament>/` |
| `etl/europaparlament.py` | lädt die Hauptabstimmungen des Europaparlaments von HowTheyVote.eu (Einzelstimmen 104 MB) |
| `etl/themen.py` | ordnet CAP-Codes (BTVote), abgeordnetenwatch-Themen und Sachgebiete des Legislative Observatory sechs gemeinsamen Themen zu |
| `etl/baue.ts` | Unähnlichkeiten, Layout (SMACOF, 2D und 3D), Ausrichtung zwischen den Perioden, Regierungslinie, Nachbarn, Abweichungen, Abwesenheit und Verlauf, je Parlament |

Name, Quelle, Regierungen und Regierungschef je Parlament stehen in
`etl/parlamente.json`; der Build findet den Regierungschef über den Namen und
meldet, wenn er in einer Periode kein Mandat hatte.

Quellen: BTVote bis zur 19. Wahlperiode (vollständig, CC0, ohne fraktionslose
MdB), bundestag.de ab der 20. Für den Bundestag ist abgeordnetenwatch vor 2025
lückenhaft; für die Landtage ist es die einzige maschinenlesbare Quelle, ihre
Vollständigkeit ist nicht geprüft.

Das Europaparlament stammt von [HowTheyVote.eu](https://howtheyvote.eu) und
steht unter der [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
Die abgeleiteten Daten unter `public/daten/europaparlament/` stehen deshalb
ebenfalls unter der ODbL.

Themenkarten rechnet der Browser selbst (`src/lib/thema.worker.ts`), mit
denselben Bausteinen wie der Build.

## Wie gerechnet wird

Die Regeln stehen in `src/lib/mass.ts`, Build und Browser nutzen dasselbe Modul:

- Ja +1, Enthaltung 0, Nein −1; Distanz je Abstimmung ist der halbe Abstand
  (Ja/Nein 1, mit Enthaltung 0,5).
- Verglichen wird nur, wo beide abgestimmt haben.
- Gedämpft mit k = 10 gedachten Abstimmungen, die so ausfallen, wie es zwischen
  den beiden Fraktionen üblich ist.
- Fraktionslinie ist die häufigste Stimme der anwesenden Mitglieder; die
  Fraktion hängt an der einzelnen Abstimmung.
- Die Regierungslinie ist die häufigste Stimme der anwesenden Abgeordneten aus
  den Regierungsfraktionen; Koalitionen stehen in `etl/parlamente.json`.
