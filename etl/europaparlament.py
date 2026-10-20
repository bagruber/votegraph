"""
Europäisches Parlament aus HowTheyVote.eu im gemeinsamen Zwischenformat,
etl/zwischen/europaparlament/wp9.json und wp10.json.

HowTheyVote erfasst alle namentlichen Abstimmungen seit 2019 mit allen
Abgeordneten. Genommen werden nur die Hauptabstimmungen (is_main): Über einen
Bericht stimmt das Parlament oft Dutzende Male über Änderungsanträge ab, und
die würden das Bild mit Verfahrensdetails füllen.

Lizenz: Open Database License (ODbL). Die abgeleiteten Daten unter
public/daten/europaparlament/ stehen damit ebenfalls unter ODbL, mit
Quellenangabe HowTheyVote.eu.

Run:  python etl/europaparlament.py
"""
import csv
import gzip
import json
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from themen import aus_oeil

ETL = Path(__file__).parent
ROH = ETL / "roh" / "howtheyvote"
ZWISCHEN = ETL / "zwischen" / "europaparlament"
QUELLE = "https://github.com/HowTheyVote/data/releases/latest/download/"
TABELLEN = ["members", "votes", "member_votes", "oeil_subject_votes"]

PERIODEN = {9: ("2019-07-02", "2024-07-16"), 10: ("2024-07-16", None)}

# Fraktion -> (Kennung für die Farbe, Name). Die Farben folgen der
# Parteienfamilie, wie im Bundestag: Christdemokraten schwarz, Sozialdemokraten
# rot, Liberale gelb, Grüne grün, Linke magenta.
FRAKTION = {
    "GUE_NGL": ("linke", "Linke"), "GUE_NGL_1995_0": ("linke", "Linke"),
    "SD": ("spd", "S&D"), "GREEN_EFA": ("gruene", "Grüne/EFA"), "RENEW": ("fdp", "Renew"),
    "EPP": ("union", "EVP"), "ECR": ("ekr", "EKR"),
    "ID": ("patrioten", "ID"), "PFE": ("patrioten", "Patrioten"),
    "ESN": ("esn", "ESN"), "NI": ("fraktionslos", "fraktionslos"),
}
REIHENFOLGE = ["linke", "spd", "gruene", "fdp", "union", "ekr", "patrioten", "esn", "fraktionslos"]
STIMME = {"FOR": "j", "AGAINST": "n", "ABSTENTION": "e", "DID_NOT_VOTE": "a"}

LAND = {
    "AUT": "Österreich", "BEL": "Belgien", "BGR": "Bulgarien", "CYP": "Zypern", "CZE": "Tschechien",
    "DEU": "Deutschland", "DNK": "Dänemark", "ESP": "Spanien", "EST": "Estland", "FIN": "Finnland",
    "FRA": "Frankreich", "GBR": "Vereinigtes Königreich", "GRC": "Griechenland", "HRV": "Kroatien",
    "HUN": "Ungarn", "IRL": "Irland", "ITA": "Italien", "LTU": "Litauen", "LUX": "Luxemburg",
    "LVA": "Lettland", "MLT": "Malta", "NLD": "Niederlande", "POL": "Polen", "PRT": "Portugal",
    "ROU": "Rumänien", "SVK": "Slowakei", "SVN": "Slowenien", "SWE": "Schweden",
}
KLEIN = {"von", "van", "der", "den", "zu"}


def nachname(s):
    """GOERENS -> Goerens, DI RUPO -> Di Rupo, VAN DER BERG -> van der Berg."""
    teile = []
    for i, t in enumerate(s.split(" ")):
        t = "-".join(x[:1].upper() + x[1:].lower() for x in t.split("-"))
        teile.append(t.lower() if i < len(s.split(" ")) - 1 and t.lower() in KLEIN else t)
    return " ".join(teile)


def tabelle(name):
    pfad = ROH / f"{name}.csv.gz"
    if not pfad.exists():
        ROH.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(QUELLE + f"{name}.csv.gz", pfad)
    return csv.DictReader(gzip.open(pfad, "rt", encoding="utf-8"))


def periode_von(datum):
    for wp, (von, bis) in PERIODEN.items():
        if datum >= von and (bis is None or datum < bis):
            return wp
    return None


if __name__ == "__main__":
    namen = {m["id"]: f'{m["first_name"]} {nachname(m["last_name"])}' for m in tabelle("members")}

    abst = defaultdict(list)                       # wp -> [(zeit, id, titel)]
    for v in tabelle("votes"):
        wp = periode_von(v["timestamp"][:10])
        if v["is_main"] == "True" and wp:
            abst[wp].append((v["timestamp"], v["id"], v["display_title"] or v["procedure_title"]))
    spalte, wp_von = {}, {}
    for wp, liste in abst.items():
        liste.sort()
        for j, (_, vid, _) in enumerate(liste):
            spalte[vid], wp_von[vid] = j, wp

    themen = defaultdict(list)
    for z in tabelle("oeil_subject_votes"):
        if z["vote_id"] in spalte:
            themen[z["vote_id"]].append(z["oeil_subject_code"])

    stimmen = {wp: {} for wp in abst}
    fraktion = {wp: {} for wp in abst}
    zusatz = {wp: {} for wp in abst}
    for z in tabelle("member_votes"):
        vid = z["vote_id"]
        if vid not in spalte:
            continue
        wp, j, mid = wp_von[vid], spalte[vid], z["member_id"]
        P = len(abst[wp])
        stimmen[wp].setdefault(mid, ["-"] * P)[j] = STIMME[z["position"]]
        fraktion[wp].setdefault(mid, ["-"] * P)[j] = FRAKTION.get(z["group_code"], ("fraktionslos", "fraktionslos"))
        land = LAND.get(z["country_code"], z["country_code"])
        zusatz[wp][mid] = f'{z["national_party_short_label"]}, {land}' if z["national_party_short_label"] else land

    ZWISCHEN.mkdir(parents=True, exist_ok=True)
    for wp in sorted(abst):
        anzeige = {k: n for fs in fraktion[wp].values() for f in fs if f != "-" for k, n in [f]}
        # Bei zwei Namen für eine Kennung (ID, später Patrioten) gilt der häufigere
        haeufig = Counter(f for fs in fraktion[wp].values() for f in fs if f != "-")
        for (k, n), _ in sorted(haeufig.items(), key=lambda x: x[1]):
            anzeige[k] = n
        kennungen = sorted(anzeige, key=REIHENFOLGE.index)
        mdb = [{"id": mid, "name": namen.get(mid, mid), "zusatz": zusatz[wp][mid],
                "stimmen": "".join(stimmen[wp][mid]),
                "fraktion": "".join("-" if f == "-" else str(kennungen.index(f[0])) for f in fraktion[wp][mid])}
               for mid in sorted(stimmen[wp], key=lambda i: namen.get(i, i).split(" ")[-1] + namen.get(i, i))]
        von, bis = PERIODEN[wp]
        z = {"wp": wp, "quelle": "HowTheyVote.eu", "von": von, "bis": bis,
             "abstimmungen": [{"datum": t[:10], "titel": titel, "frei": None, "themen": aus_oeil(themen[vid])}
                              for t, vid, titel in abst[wp]],
             "fraktionen": kennungen, "namen": [anzeige[k] for k in kennungen], "mdb": mdb}
        (ZWISCHEN / f"wp{wp}.json").write_text(json.dumps(z, ensure_ascii=False), encoding="utf-8")
        alle = "".join(m["stimmen"] for m in mdb)
        mit_thema = sum(1 for a in z["abstimmungen"] if a["themen"])
        print(f"Europaparlament WP {wp}: {len(abst[wp])} Hauptabstimmungen ({mit_thema} mit Thema), {len(mdb)} Abgeordnete, "
              f"{dict(zip(kennungen, z['namen']))}, abwesend {alle.count('a') / max(1, len(alle) - alle.count('-')):.0%}")
