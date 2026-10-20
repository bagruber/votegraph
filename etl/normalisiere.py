"""
Bringt beide Quellen in ein gemeinsames Format, eine Datei je Wahlperiode:
etl/zwischen/bundestag/wpNN.json

  {
    wp, quelle, von, bis,
    abstimmungen: [{ datum, titel, frei }],   frei: Fraktionsdisziplin aufgehoben
                                              (nur BTVote kennt das, sonst null)
    fraktionen:   ["union", "spd", ...],
    mdb: [{ id, name,
            stimmen:  ein Zeichen je Abstimmung,
            fraktion: ein Zeichen je Abstimmung, Index in `fraktionen` }]
  }

Stimmen-Zeichen:
  j ja · n nein · e Enthaltung · a nicht abgegeben (entschuldigt oder nicht)
  u ungültig · x nicht oder falsch protokolliert · - kein Mandat zu dem Zeitpunkt

Die Unterscheidung zwischen a und - trägt die Abwesenheitsquote: nur wer ein
Mandat hatte, kann gefehlt haben.

Quellen: BTVote bis zur 19. Wahlperiode, bundestag.de ab der 20. Die 19. liegt
teils auch als XLSX vor und wird am Ende gegen BTVote geprüft.

Run:  python etl/normalisiere.py
"""
import datetime
import glob
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import openpyxl

from stata import lies

ETL = Path(__file__).parent
ROH = ETL / "roh"
ZWISCHEN = ETL / "zwischen" / "bundestag"

AB_WP = 10
BTVOTE_BIS_WP = 19

# Konstituierende Sitzungen; eine Periode endet mit dem Beginn der nächsten.
BEGINN = {10: "1983-03-29", 11: "1987-02-18", 12: "1990-12-20", 13: "1994-11-10",
          14: "1998-10-26", 15: "2002-10-17", 16: "2005-10-18", 17: "2009-10-27",
          18: "2013-10-22", 19: "2017-10-24", 20: "2021-10-26", 21: "2025-03-25"}

# BTVote-Spalte ppg (parliamentary party group)
PPG = {1: "spd", 2: "union", 4: "fdp", 5: "gruene", 6: "linke", 19: "afd",
       11: "andere", 99: "fraktionslos"}
# Spalte Fraktion/Gruppe der Bundestag-XLSX
XLSX_FRAKTION = {"CDU/CSU": "union", "SPD": "spd", "BÜ90/GR": "gruene", "FDP": "fdp",
                 "DIE LINKE.": "linke", "Die Linke": "linke", "AfD": "afd", "BSW": "bsw",
                 "Fraktionslos": "fraktionslos"}
REIHENFOLGE = ["union", "spd", "gruene", "fdp", "linke", "bsw", "afd", "andere", "fraktionslos"]
BTVOTE_STIMME = {1: "j", 2: "n", 3: "e", 0: "a", 11: "a", 22: "u", 44: "x"}
XLSX_STIMME = {"ja": "j", "nein": "n", "Enthaltung": "e", "ungültig": "u", "nichtabgegeben": "a"}


def norm(s):
    """Für den Namensabgleich: ohne Diakritika, weil die XLSX sie mal führen
    und mal nicht ("Dagdelen" gegenüber "Dağdelen" in den Stammdaten)."""
    s = unicodedata.normalize("NFKD", str(s or "").replace("\xad", ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


def stata_datum(tage):
    return (datetime.date(1960, 1, 1) + datetime.timedelta(days=int(tage))).isoformat()


# -- MdB-Stammdaten ---------------------------------------------------------

def lies_stammdaten():
    z = zipfile.ZipFile(ROH / "mdb_stammdaten.zip")
    wurzel = ET.fromstring(z.read("MDB_STAMMDATEN.XML"))
    personen = {}
    for mdb in wurzel.iter("MDB"):
        namen = []
        for n in mdb.find("NAMEN"):
            namen.append({k: (n.findtext(k) or "").strip() for k in
                          ("NACHNAME", "VORNAME", "ORTSZUSATZ", "ADEL", "PRAEFIX", "HISTORIE_BIS")})
        aktuell = next((n for n in namen if not n["HISTORIE_BIS"]), namen[-1])
        anzeige = " ".join(t for t in (aktuell["VORNAME"], aktuell["ADEL"],
                                       aktuell["PRAEFIX"], aktuell["NACHNAME"]) if t)
        wps = {}
        for wp in mdb.find("WAHLPERIODEN"):
            nr = int(wp.findtext("WP"))
            wps[nr] = [i.findtext("INS_LANG") or "" for i in wp.iter("INSTITUTION")
                       if i.findtext("INSART_LANG") == "Fraktion/Gruppe"]
        personen[mdb.findtext("ID")] = {"namen": namen, "anzeige": anzeige, "wps": wps}
    return personen


def namensindex(personen, wp):
    """(Nachname, Vorname) -> MdB-IDs der Wahlperiode, für alle Namen, die
    jemand je trug."""
    idx = defaultdict(set)
    for pid, p in personen.items():
        if wp not in p["wps"]:
            continue
        for n in p["namen"]:
            for nach in {n["NACHNAME"], f'{n["PRAEFIX"]} {n["NACHNAME"]}',
                         f'{n["ADEL"]} {n["PRAEFIX"]} {n["NACHNAME"]}'}:
                idx[(norm(nach), norm(n["VORNAME"]))].add(pid)
    return idx


def finde_mdb(idx, personen, name, vorname, fraktion):
    m = re.match(r"(.*?)\s*\((.*)\)$", str(name))
    nach, ort = (m[1], m[2]) if m else (str(name), None)
    kandidaten = set(idx.get((norm(nach), norm(vorname)), ()))
    if not kandidaten:
        # Vornamen weichen ab ("Hans-Peter" / "Hans Peter", zweiter Vorname)
        erster = norm(vorname).replace("-", " ").split(" ")[0]
        kandidaten = {pid for (n, v), ids in idx.items() if n == norm(nach)
                      and v.replace("-", " ").split(" ")[0] == erster for pid in ids}
    if len(kandidaten) > 1 and ort:
        kandidaten = {pid for pid in kandidaten
                      if any(norm(n["ORTSZUSATZ"]).strip("()") == norm(ort) for n in personen[pid]["namen"])}
    if len(kandidaten) > 1:
        schluessel = {"union": "union", "spd": "sozialdemokrat", "gruene": "grün", "fdp": "freie demokrat",
                      "linke": "linke", "afd": "alternative", "bsw": "wagenknecht"}.get(fraktion, "")
        kandidaten = {pid for pid in kandidaten if any(schluessel in norm(f) for fs in personen[pid]["wps"].values() for f in fs)}
    return next(iter(kandidaten)) if len(kandidaten) == 1 else None


# -- Aufbau einer Periode ---------------------------------------------------

def periode(wp, quelle, abstimmungen, stimmen, fraktion, namen):
    """stimmen/fraktion: dict MdB-ID -> {Abstimmungsindex: Zeichen bzw. Fraktionskennung}"""
    kennungen = sorted({f for fs in fraktion.values() for f in fs.values()}, key=REIHENFOLGE.index)
    P = len(abstimmungen)
    mdb = []
    for pid in sorted(stimmen, key=lambda i: namen[i].split(" ")[-1] + namen[i]):
        s = ["-"] * P
        f = ["-"] * P
        for j, c in stimmen[pid].items():
            s[j] = c
            f[j] = str(kennungen.index(fraktion[pid][j]))
        mdb.append({"id": pid, "name": namen[pid], "stimmen": "".join(s), "fraktion": "".join(f)})
    bis = BEGINN.get(wp + 1)
    return {"wp": wp, "quelle": quelle, "von": BEGINN[wp], "bis": bis,
            "abstimmungen": abstimmungen, "fraktionen": kennungen, "mdb": mdb}


def btvote(personen):
    s, _ = lies(ROH / "btvote_stimmen.dta")
    a, _ = lies(ROH / "btvote_abstimmungen.dta")
    info = {int(v): (stata_datum(d), t, None if np.isnan(f) or f == 99 else bool(f == 1))
            for v, d, t, f in zip(a["vote_id"], a["vote_date"], a["vote_title"], a["free_vote"])}

    wp_all = s["elecper"].astype(int)
    perioden = {}
    for wp in range(AB_WP, BTVOTE_BIS_WP + 1):
        zeilen = np.where(wp_all == wp)[0]
        vids = sorted({int(s["vote_id"][i]) for i in zeilen}, key=lambda v: (info[v][0], v))
        spalte = {v: j for j, v in enumerate(vids)}
        stimmen, fraktion, namen = defaultdict(dict), defaultdict(dict), {}
        for i in zeilen:
            pid = str(int(s["id_de_parliament"][i]))
            j = spalte[int(s["vote_id"][i])]
            stimmen[pid][j] = BTVOTE_STIMME[int(s["vote_beh"][i])]
            ppg = s["ppg"][i]
            fraktion[pid][j] = PPG[int(ppg)] if not np.isnan(ppg) else "fraktionslos"
            namen[pid] = personen[pid]["anzeige"] if pid in personen else f'{s["firstname"][i]} {s["lastname"][i]}'
        abst = [{"datum": info[v][0], "titel": info[v][1], "frei": info[v][2]} for v in vids]
        perioden[wp] = periode(wp, "BTVote", abst, stimmen, fraktion, namen)
    return perioden


def datum_und_titel(eintrag):
    """Das Datum in der Liste ist teils der Tag der Veröffentlichung. Das
    Abstimmungsdatum steht im Titel ("03.12.2025: …") und im Dateinamen, und
    beide haben vereinzelt Tippfehler (26.11.2026 für eine Abstimmung von
    2025). Veröffentlicht wird nie vor der Abstimmung, also gilt das jüngste
    Datum, das nicht nach dem Listendatum liegt."""
    titel = eintrag["titel"]
    t = re.search(r"(\d{2})\.(\d{2})\.(\d{4}):", titel)
    f = re.search(r"/(\d{4})(\d{2})(\d{2})_", eintrag["xlsx"])
    kandidaten = [d for d in (t and f"{t[3]}-{t[2]}-{t[1]}", f and f"{f[1]}-{f[2]}-{f[3]}")
                  if d and d <= eintrag["datum"]]
    datum = max(kandidaten, default=eintrag["datum"])
    titel = re.sub(r"^\d{1,2}\. \w+ \d{4} ", "", titel)
    titel = re.sub(r"^\d{2}\.\d{2}\.\d{4}: ", "", titel)
    titel = re.sub(r" PDF \|.*$", "", titel)
    return datum, titel


def bundestag(personen, wps):
    liste = {Path(e["xlsx"]).name: e for e in json.loads((ROH / "bundestag_liste.json").read_text(encoding="utf-8"))}
    roh = defaultdict(list)          # wp -> [(datum, sitzung, nr, titel, zeilen)]
    for pfad in sorted(glob.glob(str(ROH / "bundestag" / "*.xlsx"))):
        datum, titel = datum_und_titel(liste[Path(pfad).name.split("_", 1)[1]])
        ws = openpyxl.load_workbook(pfad, read_only=True).active
        it = ws.iter_rows(values_only=True)
        kopf = next(it)
        zeilen = [dict(zip(kopf, r)) for r in it if r and r[0] is not None]
        wp = int(zeilen[0]["Wahlperiode"])
        if wp in wps:
            roh[wp].append((datum, int(zeilen[0]["Sitzungnr"]), int(zeilen[0]["Abstimmnr"]), titel, zeilen))

    perioden, vorlaeufig = {}, Counter()
    for wp in wps:
        idx = namensindex(personen, wp)
        # Die Stammdaten hinken nach: Wer nachrückt, steht dort womöglich nur
        # mit der Vorperiode. Weiter zurück wird nicht gesucht, sonst trifft
        # ein neuer MdB leicht einen Namensvetter aus früheren Jahrzehnten.
        vorher = namensindex(personen, wp - 1)
        abst_roh = sorted(roh[wp], key=lambda x: x[:3])
        stimmen, fraktion, namen = defaultdict(dict), defaultdict(dict), {}
        for j, (_, _, _, _, zeilen) in enumerate(abst_roh):
            for z in zeilen:
                fr = XLSX_FRAKTION[z["Fraktion/Gruppe"]]
                pid = (finde_mdb(idx, personen, z["Name"], z["Vorname"], fr)
                       or finde_mdb(vorher, personen, z["Name"], z["Vorname"], fr))
                if pid is None:
                    # Noch nicht in den Stammdaten. Eine vorläufige ID aus dem
                    # Namen hält die Stimmen zusammen, bis die Stammdaten
                    # nachziehen; dann ersetzt der nächste Lauf sie.
                    pid = f"neu:{norm(z['Name'])}:{norm(z['Vorname'])}"
                    namen[pid] = f"{z['Vorname']} {z['Name']}"
                    vorlaeufig[(wp, namen[pid], z["Fraktion/Gruppe"])] += 1
                else:
                    namen[pid] = personen[pid]["anzeige"]
                gesetzt = [k for k in XLSX_STIMME if z.get(k) in (1, "1", 1.0)]
                if len(gesetzt) != 1:
                    raise ValueError(f"Zeile ohne eindeutige Stimme: {z}")
                stimmen[pid][j] = XLSX_STIMME[gesetzt[0]]
                fraktion[pid][j] = fr
        abst = [{"datum": d, "titel": t, "frei": None} for (d, _, _, t, _) in abst_roh]
        perioden[wp] = periode(wp, "bundestag.de", abst, stimmen, fraktion, namen)
    return perioden, vorlaeufig


def gegenprobe(bt, xl):
    """Ordnet jede XLSX-Abstimmung der BTVote-Abstimmung desselben Tages zu, die
    am besten passt, und zählt abweichende Einzelstimmen."""
    bt_mdb = {m["id"]: m["stimmen"] for m in bt["mdb"]}
    xl_mdb = {m["id"]: m["stimmen"] for m in xl["mdb"]}
    gemeinsam = sorted(set(bt_mdb) & set(xl_mdb))
    gleich = verschieden = ohne = 0
    for j, a in enumerate(xl["abstimmungen"]):
        kand = [k for k, b in enumerate(bt["abstimmungen"]) if b["datum"] == a["datum"]]
        if not kand:
            ohne += 1
            continue
        treffer = max(kand, key=lambda k: sum(bt_mdb[p][k] == xl_mdb[p][j] for p in gemeinsam))
        for p in gemeinsam:
            x, b = xl_mdb[p][j], bt_mdb[p][treffer]
            if x == "-" and b == "-":
                continue
            if x == b:
                gleich += 1
            else:
                verschieden += 1
    return gleich, verschieden, ohne, len(set(xl_mdb) - set(bt_mdb))


if __name__ == "__main__":
    ZWISCHEN.mkdir(parents=True, exist_ok=True)
    personen = lies_stammdaten()
    bt = btvote(personen)
    xl, vorlaeufig = bundestag(personen, [19, 20, 21])
    if vorlaeufig:
        print("Nicht in den Stammdaten, vorläufige ID:")
        for k, n in vorlaeufig.most_common():
            print("  ", k, n, "Stimmen")

    g, v, o, fremd = gegenprobe(bt[19], xl[19])
    print(f"Gegenprobe WP 19: {len(xl[19]['abstimmungen'])} XLSX-Abstimmungen, "
          f"{g} gleiche und {v} abweichende Einzelstimmen, {o} ohne BTVote-Gegenstück, "
          f"{fremd} MdB nur in den XLSX")

    for wp, p in {**bt, 20: xl[20], 21: xl[21]}.items():
        (ZWISCHEN / f"wp{wp}.json").write_text(json.dumps(p, ensure_ascii=False), encoding="utf-8")
        z = Counter("".join(m["stimmen"] for m in p["mdb"]))
        print(f"WP {wp:>2} ({p['quelle']:<12}) {len(p['abstimmungen']):>3} Abstimmungen, "
              f"{len(p['mdb']):>3} MdB, Fraktionen {p['fraktionen']}, "
              f"Enthaltung {z['e'] / max(1, z['j'] + z['n'] + z['e'] + z['a']):.1%}")
