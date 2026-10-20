"""
Liest Stata-Dateien der Formate 117 und 118 (Stata 13 bis 15) ohne pandas.

BTVote liefert die Einzelstimmen nur als .dta. Für eine einmalige Umwandlung
lohnt pandas die Installation nicht; das Format ist offen dokumentiert
(https://www.stata.com/help.cgi?dta) und hat eine Offset-Tabelle, über die
sich jeder Abschnitt direkt anspringen lässt.

Rückgabe: dict Spaltenname -> numpy-Array (Zahlen) oder Liste (Text),
dazu die Wertelabels, damit kodierte Spalten lesbar werden.
"""
import struct
import numpy as np

ZAHLEN = {65526: "f8", 65527: "f4", 65528: "i4", 65529: "i2", 65530: "i1"}
STRL = 32768
# Werte oberhalb dieser Grenzen sind in Stata fehlende Werte (., .a bis .z).
FEHLT_AB = {"i1": 100, "i2": 32740, "i4": 2147483620, "f4": 1.701e38, "f8": 8.988e307}


def lies(pfad):
    roh = open(pfad, "rb").read()
    release = int(roh[roh.index(b"<release>") + 9: roh.index(b"</release>")])
    if release not in (117, 118):
        raise ValueError(f"Stata-Format {release} wird nicht unterstützt")
    le = roh[roh.index(b"<byteorder>") + 11: roh.index(b"</byteorder>")] == b"LSF"
    o = "<" if le else ">"

    p = roh.index(b"<K>") + 3
    K = struct.unpack(o + "H", roh[p:p + 2])[0]
    p = roh.index(b"<N>") + 3
    N = struct.unpack(o + ("Q" if release == 118 else "I"), roh[p:p + (8 if release == 118 else 4)])[0]

    p = roh.index(b"<map>") + 5
    karte = struct.unpack(o + "14Q", roh[p:p + 112])
    ab = {"typen": karte[2], "namen": karte[3], "vlnamen": karte[6],
          "daten": karte[9], "strls": karte[10], "vl": karte[11]}

    p = ab["typen"] + len(b"<variable_types>")
    typen = struct.unpack(o + f"{K}H", roh[p:p + 2 * K])

    lang = 129 if release == 118 else 33
    p = ab["namen"] + len(b"<varnames>")
    namen = [roh[p + i * lang: p + (i + 1) * lang].split(b"\0")[0].decode("utf-8") for i in range(K)]
    p = ab["vlnamen"] + len(b"<value_label_names>")
    vlnamen = [roh[p + i * lang: p + (i + 1) * lang].split(b"\0")[0].decode("utf-8") for i in range(K)]

    felder = []
    for name, t in zip(namen, typen):
        if t in ZAHLEN:
            felder.append((name, o + ZAHLEN[t]))
        elif t == STRL:
            felder.append((name, "V8"))
        elif 1 <= t <= 2045:
            felder.append((name, f"S{t}"))
        else:
            raise ValueError(f"unbekannter Typ {t} in Spalte {name}")
    dtype = np.dtype(felder)
    p = ab["daten"] + len(b"<data>")
    daten = np.frombuffer(roh, dtype=dtype, count=N, offset=p)

    strls = lies_strls(roh, ab["strls"], release, o) if STRL in typen else {}

    spalten = {}
    for name, t in zip(namen, typen):
        feld = daten[name]
        if t in ZAHLEN:
            werte = feld.astype("f8")
            werte[feld > FEHLT_AB[ZAHLEN[t]]] = np.nan
            spalten[name] = werte
        elif t == STRL:
            b = feld.view(np.uint8).reshape(N, 8)
            if release == 118:     # v: 2 Byte, o: 6 Byte
                v = b[:, 0].astype(np.uint64) | (b[:, 1].astype(np.uint64) << 8)
                oo = np.zeros(N, dtype=np.uint64)
                for i in range(6):
                    oo |= b[:, 2 + i].astype(np.uint64) << (8 * i)
            else:                  # v: 4 Byte, o: 4 Byte
                v = b[:, :4].copy().view("<u4").ravel().astype(np.uint64)
                oo = b[:, 4:].copy().view("<u4").ravel().astype(np.uint64)
            spalten[name] = [strls.get((int(a), int(c)), "") for a, c in zip(v, oo)]
        else:
            spalten[name] = [s.split(b"\0")[0].decode("utf-8", "replace") for s in feld]

    labels = lies_wertelabels(roh, ab["vl"], release, o)
    return spalten, {n: labels.get(v, {}) for n, v in zip(namen, vlnamen) if v}


def lies_strls(roh, start, release, o):
    p = start + len(b"<strls>")
    ende = roh.index(b"</strls>", p)
    out = {}
    while p < ende and roh[p:p + 3] == b"GSO":
        p += 3
        if release == 118:
            v, oo = struct.unpack(o + "IQ", roh[p:p + 12]); p += 12
        else:
            v, oo = struct.unpack(o + "II", roh[p:p + 8]); p += 8
        t = roh[p]; p += 1
        n = struct.unpack(o + "I", roh[p:p + 4])[0]; p += 4
        inhalt = roh[p:p + n]; p += n
        out[(v, oo)] = (inhalt[:-1] if t == 130 and inhalt.endswith(b"\0") else inhalt).decode("utf-8", "replace")
    return out


def lies_wertelabels(roh, start, release, o):
    p = start + len(b"<value_labels>")
    ende = roh.index(b"</value_labels>", p)
    lang = 129 if release == 118 else 33
    out = {}
    while p < ende and roh[p:p + 5] == b"<lbl>":
        p += 5
        p += 4                                     # Länge des Eintrags
        name = roh[p:p + lang].split(b"\0")[0].decode("utf-8"); p += lang + 3
        n, txtlen = struct.unpack(o + "II", roh[p:p + 8]); p += 8
        offs = struct.unpack(o + f"{n}I", roh[p:p + 4 * n]); p += 4 * n
        vals = struct.unpack(o + f"{n}i", roh[p:p + 4 * n]); p += 4 * n
        txt = roh[p:p + txtlen]; p += txtlen
        out[name] = {v: txt[a:txt.index(b"\0", a)].decode("utf-8", "replace") for v, a in zip(vals, offs)}
        p += len(b"</lbl>")
    return out
