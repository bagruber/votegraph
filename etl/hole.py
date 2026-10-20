"""
Lädt die Rohdaten nach etl/roh/. Was schon da ist, wird nicht erneut geladen.

Zwei Quellen, verbunden über die MdB-ID des Bundestags:

  BTVote (Uni Bamberg, Harvard Dataverse, CC0) für die Wahlperioden bis 2021.
  Vollständig und geprüft, aber seit 2022 nicht fortgeschrieben.

  bundestag.de für alles danach: je namentlicher Abstimmung eine XLSX-Datei,
  dazu die MdB-Stammdaten, über die die Namen in den XLSX zu IDs werden.
  Geladen werden die XLSX ab der 19. Wahlperiode — die 19. liegt auch in
  BTVote und dient als Gegenprobe, dass beide Wege dieselben Stimmen liefern.

abgeordnetenwatch wäre bequemer, ist vor 2025 aber lückenhaft (in der
17. Wahlperiode fehlen zwei Drittel der Abstimmungen).

Run:  python etl/hole.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

ROH = Path(__file__).parent / "roh"
UA = {"User-Agent": "votegraph (Datenabruf für eine Visualisierung namentlicher Abstimmungen)"}

DATAVERSE = "https://dataverse.harvard.edu/api"
BTVOTE = {
    "btvote_stimmen.dta": "doi:10.7910/DVN/24U1FR",
    "btvote_abstimmungen.dta": "doi:10.7910/DVN/AHBBXY",
}

LISTE = ("https://www.bundestag.de/ajax/filterlist/de/parlament/plenum/"
         "abstimmung/liste/462112-462112")
STAMMDATEN = "https://www.bundestag.de/resource/blob/472878/MdB-Stammdaten.zip"
AB = "2017-10-24"          # Beginn der 19. Wahlperiode

MONATE = {m: i + 1 for i, m in enumerate(
    "Januar Februar März April Mai Juni Juli August September Oktober November Dezember".split())}


def lade(url, ziel):
    if ziel.exists() and ziel.stat().st_size > 0:
        return False
    tmp = ziel.with_suffix(ziel.suffix + ".teil")
    for versuch in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                tmp.write_bytes(r.read())
            tmp.replace(ziel)
            return True
        except Exception:
            time.sleep(2 + versuch * 4)
    raise RuntimeError(f"Download fehlgeschlagen: {url}")


def text(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode("utf-8")


def hole_btvote():
    for name, doi in BTVOTE.items():
        meta = json.loads(text(f"{DATAVERSE}/datasets/:persistentId/?persistentId={doi}"))
        dateien = meta["data"]["latestVersion"]["files"]
        # Je Datensatz liegen V1 und V2 nebeneinander; V2 reicht bis 2021.
        datei = next(f["dataFile"] for f in dateien if "V2" in f["dataFile"]["filename"])
        # Die Abstimmungstabelle hat Dataverse beim Import in .tab umgewandelt
        # und dabei die Umlaute zerstört; format=original liefert die .dta.
        if lade(f"{DATAVERSE}/access/datafile/{datei['id']}?format=original", ROH / name):
            print("geladen:", name, datei["filename"])


def bundestag_liste():
    """Alle Einträge der Abstimmungsliste, neueste zuerst. Der Server liefert
    höchstens 30 je Seite, egal was als limit angefragt wird."""
    eintraege, gesehen, offset = [], set(), 0
    while True:
        html = text(f"{LISTE}?limit=30&noFilterSet=true&offset={offset}")
        zeilen = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
        neu = 0
        for z in zeilen:
            xlsx = re.findall(r'href="([^"]+\.xlsx?)"', z)
            if not xlsx or xlsx[0] in gesehen:
                continue
            gesehen.add(xlsx[0])
            neu += 1
            klar = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", z)).strip()
            d = re.search(r"(\d{1,2})\.\s*([A-Za-zä]+)\s+(\d{4})", klar)
            datum = f"{d[3]}-{MONATE[d[2]]:02d}-{int(d[1]):02d}" if d and d[2] in MONATE else None
            titel = re.search(r"<span>\s*<span>(.*?)</span>", z, re.S)
            titel = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", titel[1])).strip() if titel else klar[:200]
            eintraege.append({"datum": datum, "titel": titel, "xlsx": xlsx[0]})
        if neu == 0:
            return eintraege
        offset += len(zeilen)
        time.sleep(0.3)


def dateiname(url):
    """…/resource/blob/1217428/20260925_3-xls.xlsx -> 1217428_20260925_3-xls.xlsx;
    die Blob-Nummer macht den Namen eindeutig."""
    blob, name = url.rsplit("/", 2)[-2:]
    return f"{blob}_{name}"


def hole_bundestag():
    lade(STAMMDATEN, ROH / "mdb_stammdaten.zip")
    liste = [e for e in bundestag_liste() if e["datum"] and e["datum"] >= AB]
    (ROH / "bundestag_liste.json").write_text(
        json.dumps(liste, ensure_ascii=False, indent=1), encoding="utf-8")
    ordner = ROH / "bundestag"
    ordner.mkdir(exist_ok=True)
    neu = 0
    for e in liste:
        if lade(e["xlsx"], ordner / dateiname(e["xlsx"])):
            neu += 1
            time.sleep(0.3)
    print(f"bundestag.de: {len(liste)} Abstimmungen seit {AB}, {neu} neu geladen")


if __name__ == "__main__":
    ROH.mkdir(exist_ok=True)
    hole_btvote()
    hole_bundestag()
