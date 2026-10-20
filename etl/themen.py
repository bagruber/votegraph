"""
Sechs gemeinsame Themen über drei Quellen-Taxonomien hinweg:

  BTVote          Politikfelder nach dem Comparative Agendas Project (CAP)
  abgeordnetenwatch  eigene Themenliste (angelehnt an die Sachgebiete des DIP)
  HowTheyVote     Sachgebiete des Legislative Observatory des Europaparlaments

Eine Abstimmung kann mehreren Themen angehören. Was sich keinem zuordnen
lässt (Kultur, Sport, Medien, Sonstiges), bleibt ohne Thema und erscheint
nur in der Gesamtkarte.
"""

THEMEN = {
    "wirtschaft": "Wirtschaft und Finanzen",
    "aussen": "Außen und Verteidigung",
    "soziales": "Arbeit, Soziales und Gesundheit",
    "recht": "Recht, Inneres und Migration",
    "umwelt": "Umwelt, Energie und Verkehr",
    "staat": "Staat und Demokratie",
}

# CAP-Hauptthemen, wie BTVote sie in policy1 bis policy3 kodiert
CAP = {
    1: "wirtschaft", 15: "wirtschaft", 17: "wirtschaft", 18: "wirtschaft",
    16: "aussen", 19: "aussen",
    3: "soziales", 5: "soziales", 6: "soziales", 13: "soziales", 14: "soziales",
    2: "recht", 12: "recht",
    4: "umwelt", 7: "umwelt", 8: "umwelt", 10: "umwelt", 21: "umwelt",
    20: "staat", 24: "staat", 25: "staat", 27: "staat",
}

ABGEORDNETENWATCH = {
    "Arbeit und Beschäftigung": "soziales",
    "Außenpolitik und internationale Beziehungen": "aussen",
    "Außenwirtschaft": "wirtschaft",
    "Bildung und Erziehung": "soziales",
    "Bundestag": "staat",
    "Deutsche Einheit / Innerdeutsche Beziehungen (bis 1990)": "staat",
    "Digitale Agenda": "wirtschaft",
    "digitale Infrastruktur": "wirtschaft",
    "Energie": "umwelt",
    "Entwicklungspolitik": "aussen",
    "Europapolitik und Europäische Union": "aussen",
    "Familie": "soziales",
    "Finanzen": "wirtschaft",
    "Forschung": "wirtschaft",
    "Frauen": "soziales",
    "Geschäftsordnung": "staat",
    "Gesellschaftspolitik, soziale Gruppen": "soziales",
    "Gesundheit": "soziales",
    "Haushalt": "wirtschaft",
    "Humanitäre Hilfe": "aussen",
    "Immunität": "staat",
    "Innere Angelegenheiten": "recht",
    "Innere Sicherheit": "recht",
    "Jugend": "soziales",
    "Klima": "umwelt",
    "Landwirtschaft und Ernährung": "umwelt",
    "Lobbyismus & Transparenz": "staat",
    "Menschenrechte": "recht",
    "Migration und Aufenthaltsrecht": "recht",
    "Naturschutz": "umwelt",
    "Öffentliche Finanzen, Steuern und Abgaben": "wirtschaft",
    "Petitionen": "staat",
    "Politisches Leben, Parteien": "staat",
    "Raumordnung, Bau- und Wohnungswesen": "soziales",
    "Reaktorsicherheit": "umwelt",
    "Recht": "recht",
    "Senioren": "soziales",
    "Soziale Sicherung": "soziales",
    "Staat und Verwaltung": "staat",
    "Technologiefolgenabschätzung": "wirtschaft",
    "Umwelt": "umwelt",
    "Verbraucherschutz": "recht",
    "Verkehr": "umwelt",
    "Verteidigung": "aussen",
    "Wahlprüfung": "staat",
    "Wirtschaft": "wirtschaft",
    "Wissenschaft, Forschung und Technologie": "wirtschaft",
}

# Legislative Observatory: Sachgebiete sind hierarchisch nummeriert
# ("3.70.03 Climate change"); die Zuordnung geht über den längsten Präfix.
OEIL = {
    "1": "staat",            # Unionsbürgerschaft, Grundrechte
    "1.20": "recht",         # Bürgerrechte, Grundrechte
    "2": "wirtschaft",       # Binnenmarkt
    "3.10": "umwelt",        # Landwirtschaft
    "3.15": "umwelt",        # Fischerei
    "3.20": "umwelt",        # Verkehr
    "3.30": "wirtschaft",    # Information und Kommunikation
    "3.40": "wirtschaft",    # Industrie
    "3.45": "wirtschaft",    # Unternehmen
    "3.50": "wirtschaft",    # Forschung
    "3.60": "umwelt",        # Energie
    "3.70": "umwelt",        # Umwelt
    "4.10": "soziales",      # Sozialpolitik
    "4.15": "soziales",      # Beschäftigung
    "4.20": "soziales",      # Gesundheit
    "4.40": "soziales",      # Bildung
    "4.60": "recht",         # Verbraucherschutz
    "4.70": "wirtschaft",    # Regionalpolitik
    "5": "wirtschaft",       # Wirtschafts- und Währungssystem
    "6": "aussen",           # Außenbeziehungen
    "7": "recht",            # Raum der Freiheit, der Sicherheit und des Rechts
    "8": "staat",            # Stand und Entwicklung der Union
    "8.70": "wirtschaft",    # Haushalt der Union
}


def aus_cap(codes):
    return sorted({CAP[c] for c in codes if c in CAP})


def aus_abgeordnetenwatch(labels):
    return sorted({ABGEORDNETENWATCH[l] for l in labels if l in ABGEORDNETENWATCH})


def aus_oeil(codes):
    out = set()
    for code in codes:
        teile = code.split(".")
        for n in range(len(teile), 0, -1):
            praefix = ".".join(teile[:n])
            if praefix in OEIL:
                out.add(OEIL[praefix])
                break
    return sorted(out)
