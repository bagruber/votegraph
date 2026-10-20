"""
Landtage aus abgeordnetenwatch.de (CC0) im gemeinsamen Zwischenformat,
etl/zwischen/<parlament>/wpNN.json. Welche Parlamente und Perioden, steht in
etl/parlamente.json unter "abgeordnetenwatch" (Wahlperiode -> ID der Periode
bei abgeordnetenwatch).

Ein Test, keine geprüfte Quelle: Für den Bundestag fehlten bei
abgeordnetenwatch vor 2021 bis zu zwei Drittel der namentlichen Abstimmungen.
Ob die Landtage vollständig sind, ist nicht geprüft.

Die API-Antworten landen unter etl/roh/abgeordnetenwatch/ und werden nur
geladen, wenn sie dort fehlen.

Run:  python etl/abgeordnetenwatch.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ETL = Path(__file__).parent
ROH = ETL / "roh" / "abgeordnetenwatch"
ZWISCHEN = ETL / "zwischen"
API = "https://www.abgeordnetenwatch.de/api/v2"
UA = {"User-Agent": "votegraph (Datenabruf für eine Visualisierung namentlicher Abstimmungen)"}

STIMME = {"yes": "j", "no": "n", "abstain": "e", "no_show": "a"}
REIHENFOLGE = ["union", "spd", "gruene", "fdp", "fw", "linke", "bsw", "afd", "andere", "fraktionslos"]


def get(pfad):
    for versuch in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}/{pfad}", headers=UA), timeout=60) as r:
                return json.load(r)["data"]
        except Exception:
            time.sleep(2 + versuch * 4)
    raise RuntimeError(f"abgeordnetenwatch nicht erreichbar: {pfad}")


def ergaenze_mandate(roh, ziel):
    """Nicht jedes Mandat, das abstimmt, steht in der Mandatsliste seiner
    Periode (in Bayern 2008–2013 fehlen acht, offenbar Nachrücker). Die
    fehlenden einzeln nachladen."""
    fehlend = {str(m) for z in roh["stimmen"].values() for m, _, _ in z} - set(roh["mandate"])
    for m in sorted(fehlend):
        d = get(f"candidacies-mandates/{m}")
        roh["mandate"][m] = [d["politician"]["id"], d["politician"]["label"]]
        time.sleep(0.2)
    if fehlend:
        ziel.write_text(json.dumps(roh, ensure_ascii=False), encoding="utf-8")
    return roh


def lade(periode_id, ziel):
    if ziel.exists():
        return ergaenze_mandate(json.loads(ziel.read_text(encoding="utf-8")), ziel)
    periode = get(f"parliament-periods/{periode_id}")
    polls = get(f"polls?field_legislature={periode_id}&range_end=1000")
    stimmen = {}
    for p in polls:
        stimmen[p["id"]] = [[v["mandate"]["id"], (v.get("fraction") or {}).get("label"), v["vote"]]
                            for v in get(f"votes?poll={p['id']}&range_end=1000")]
        time.sleep(0.3)
    mandate = {m["id"]: [m["politician"]["id"], m["politician"]["label"]]
               for m in get(f"candidacies-mandates?parliament_period={periode_id}&type=mandate&range_end=1000")}
    roh = {
        "von": periode["start_date_period"], "bis": periode["end_date_period"],
        "abstimmungen": [{"id": p["id"], "datum": p["field_poll_date"], "titel": p["label"]} for p in polls],
        "stimmen": stimmen, "mandate": mandate,
    }
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(json.dumps(roh, ensure_ascii=False), encoding="utf-8")
    # neu eingelesen, damit die Schlüssel wie im Cache Text sind
    return ergaenze_mandate(json.loads(ziel.read_text(encoding="utf-8")), ziel)


def fraktion(label):
    """Fraktionsbezeichnung -> (Kennung für die Farbe, Name für die Anzeige)."""
    name = re.sub(r"\s*\((Bayern|Baden|Brandenburg|Berlin|Bremen|Hamburg|Hessen|Mecklenburg|Nieder"
                  r"|Nordrhein|Rheinland|Saarland|Sachsen|Schleswig|Thüringen)[^)]*\)\s*$", "",
                  (label or "fraktionslos").replace("\xad", "")).strip()
    n = name.lower()
    if n.startswith("csu"): return "union", "CSU"
    if n.startswith("cdu"): return "union", "CDU"
    if n.startswith("spd"): return "spd", "SPD"
    if "grün" in n: return "gruene", "Grüne"
    if n.startswith("fdp"): return "fdp", "FDP"
    if "freie wähler" in n: return "fw", "BVB/Freie Wähler" if "bvb" in n else "Freie Wähler"
    if "linke" in n: return "linke", "Linke"
    if n.startswith("afd"): return "afd", "AfD"
    if n.startswith("bsw"): return "bsw", "BSW"
    if "fraktionslos" in n: return "fraktionslos", "fraktionslos"
    return "andere", name


def normalisiere(wp, roh):
    abst = sorted(roh["abstimmungen"], key=lambda a: (a["datum"], a["id"]))
    spalte = {str(a["id"]): j for j, a in enumerate(abst)}
    P = len(abst)
    stimmen, fraktionen, namen, anzeige = {}, {}, {}, {}
    for poll, zeilen in roh["stimmen"].items():
        j = spalte[poll]
        for mandat, label, stimme in zeilen:
            pid, name = roh["mandate"][str(mandat)]
            pid = str(pid)
            kennung, fname = fraktion(label)
            stimmen.setdefault(pid, ["-"] * P)[j] = STIMME[stimme]
            fraktionen.setdefault(pid, ["-"] * P)[j] = kennung
            namen[pid] = name
            anzeige[kennung] = fname
    kennungen = sorted(anzeige, key=REIHENFOLGE.index)
    mdb = [{"id": pid, "name": namen[pid], "stimmen": "".join(stimmen[pid]),
            "fraktion": "".join(c if c == "-" else str(kennungen.index(c)) for c in fraktionen[pid])}
           for pid in sorted(stimmen, key=lambda i: namen[i].split(" ")[-1] + namen[i])]
    return {"wp": wp, "quelle": "abgeordnetenwatch.de", "von": roh["von"], "bis": roh["bis"],
            "abstimmungen": [{"datum": a["datum"], "titel": a["titel"], "frei": None} for a in abst],
            "fraktionen": kennungen, "namen": [anzeige[k] for k in kennungen], "mdb": mdb}


if __name__ == "__main__":
    konfig = json.loads((ETL / "parlamente.json").read_text(encoding="utf-8"))
    for parlament, k in konfig.items():
        for wp, periode_id in k.get("abgeordnetenwatch", {}).items():
            roh = lade(periode_id, ROH / parlament / f"wp{wp}.json")
            z = normalisiere(int(wp), roh)
            ziel = ZWISCHEN / parlament / f"wp{wp}.json"
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ziel.write_text(json.dumps(z, ensure_ascii=False), encoding="utf-8")
            alle = "".join(m["stimmen"] for m in z["mdb"])
            print(f"{parlament:<19} WP {wp:>2}: {len(z['abstimmungen']):>3} Abstimmungen, {len(z['mdb']):>3} MdL, "
                  f"{dict(zip(z['fraktionen'], z['namen']))}, abwesend {alle.count('a') / max(1, len(alle) - alle.count('-')):.0%}")
