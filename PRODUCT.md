# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Vite, React, TypeScript, pnpm; Versionen nach `hausbasis/baseline.json`. Daten-ETL in Python (`etl/*.py`), Layout-Build in TypeScript (`etl/baue.ts`). three.js nur für die 3D-Ansicht, per dynamischem Import. Deploy auf GitHub Pages unter `/votegraph/` über `.github/workflows/pages.yml`.

## Users
Angenommen, nicht im Interview bestätigt: politisch interessierte Menschen, Journalistinnen und Journalisten, Studierende, die wissen wollen, wer im Bundestag mit wem stimmt. Zuerst der Auftraggeber selbst, der die Visualisierung iterativ mitentwickelt. Nutzung am Laptop oder Desktop beim konzentrierten Erkunden, mobil als Nachschlagen.

## Product Purpose
Zeigt die Ähnlichkeit des Abstimmungsverhaltens aller MdB als Nähe-Netz: wer oft gleich stimmt, liegt nah beieinander. Über einen Regler lassen sich Wahlperioden (ab der 10., 1983) vergleichen. Eine gewählte Person rückt ins Zentrum, alle anderen im Abstand ihrer Unähnlichkeit zu ihr. Dazu die stärksten Abweichler je Fraktion und Periode.

## Positioning
Jede Nähe ist aus Einzelstimmen berechnet und nachprüfbar: Ja/Nein wiegt voll, Enthaltung halb, Abwesenheit zählt nicht, dünne Grundlagen werden zur Fraktionsvorannahme gedämpft. Die Ego-Ansicht zeigt exakte Abstände statt einer Projektion.

## Operating Context
Namentliche Abstimmungen sind eine Auswahl: Die meisten Beschlüsse fallen per Handzeichen ohne Einzeldaten, namentliche Abstimmungen werden meist von der Opposition beantragt. Jede Aussage der Oberfläche gilt nur für diese Auswahl.

## Capabilities and Constraints
- Perioden WP 10–21. Quellen: BTVote (Uni Bamberg, CC0, bis WP 19) und bundestag.de-XLSX (ab WP 20), verbunden über die MdB-ID des Bundestags.
- Landtage als Test (seit 20.10.2026): Bayern, Baden-Württemberg, Brandenburg aus abgeordnetenwatch, Vollständigkeit ungeprüft. Die meisten Landtage haben dort zu wenige namentliche Abstimmungen für ein Netz.
- Der Regierungschef ist als Orientierungspunkt markiert, nicht als Mitte der Koalition: Kanzler stimmen selten ab und liegen meist am Rand ihres Klumpens. Die Mitte zeigt die Regierungslinie, eine gedachte Person, die immer mit der Koalitionsmehrheit stimmt.
- Europäisches Parlament seit 2019 aus HowTheyVote.eu (ODbL, abgeleitete Daten ebenfalls ODbL), nur Hauptabstimmungen; Titel auf Englisch, wie die Quelle sie liefert.
- Themenfilter mit sechs Themen; Themenkarten rechnet der Browser. Die Abweichler-Liste bleibt bei allen Abstimmungen.
- Veröffentlicht auf GitHub Pages unter /votegraph/ (seit 20.10.2026).
- Gewissensentscheidungen gehen vorerst in alle Statistiken ein (Entscheidung vom 29.09.2026).
- Fraktion hängt an der einzelnen Stimme; Wechsel innerhalb einer Periode sind abgebildet.
- BTVote erfasst keine fraktionslosen MdB; bis WP 19 fehlen sie.
- Nachrücker, die die Stammdaten noch nicht kennen, tragen eine vorläufige ID.

## Brand Commitments
Keine Parteifarben-Erfindungen: Die Fraktionen tragen ihre konventionellen Farben, in der Helligkeit für Farbenblindheit abgestimmt. Keine Anlehnung an das Erscheinungsbild des Bundestags. Keine LLM-Floskeln in Texten und UI.

## Evidence on Hand
Echte Daten unter `public/daten/` (12 Perioden, 2.431 BTVote- und 258 Bundestag-Abstimmungen). Keine erfundenen Zahlen, Zitate oder Nutzerstimmen.

## Product Principles
- Jede Zahl ist aus den Einzelstimmen nachvollziehbar, die Regeln stehen auf der Seite.
- Unsicherheit wird gezeigt, nicht versteckt: dünne Grundlagen sind als solche erkennbar.
- Das Netz steht im Vordergrund, alles andere ordnet sich ihm unter.
- Keine Deutung, die die Daten nicht tragen: Nähe ist Nähe bei namentlichen Abstimmungen, nicht politische Gesinnung.

## Accessibility & Inclusion
Farbe nie allein: Name beim Hover, Legende mit Hervorhebung, Listen als tabellarische Entsprechung. Tastaturbedienung für Regler, Suche und Auswahl.
