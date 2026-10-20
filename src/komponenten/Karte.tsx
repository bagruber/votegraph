// Das Nähe-Netz auf Canvas. Siebenhundert Punkte samt Übergängen sind für SVG
// zu viel; hier wird nur gezeichnet, wenn sich etwas bewegt oder der Zeiger
// einen anderen Punkt trifft.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Vorbereitet } from "../lib/daten.ts";
import type { Farben } from "../lib/farben.ts";
import { fraktionsname } from "../lib/fraktionen.ts";
import { egoLage, einpassen, entzerre } from "../lib/geometrie.ts";
import { mindestgrundlage } from "../lib/mass.ts";

const DAUER = 560;
/** Übereinstimmung, bei der in der Ego-Ansicht ein Ring liegt. */
const RINGE = [0.9, 0.75, 0.5, 0.25];
/** So viele nächste Nachbarn wachsen in der Ego-Ansicht ein wenig. */
export const NAECHSTE = 8;
const ZOOM_MAX = 12;

interface Zustand { x: number; y: number; a: number; r: number; farbe: string; hohl: boolean }
interface Zoom { k: number; tx: number; ty: number }
const GESAMT: Zoom = { k: 1, tx: 0, ty: 0 };

interface Props {
  periode: Vorbereitet;
  rahmen: [number, number, number, number];
  ego: number | null;
  egoDelta: Float64Array | null;
  hervor: number | null;
  /** Kanzler oder Ministerpräsident dieser Periode, als Orientierungspunkt. */
  chef: { i: number; rolle: string } | null;
  /** Lage und Nachbarn einer Themenkarte; ohne sie gilt die Karte der Periode. */
  thema: { lage: Float32Array; nachbarn: number[][] } | null;
  farben: Farben;
  onAuswahl: (id: string | null) => void;
}

const bewegungArm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const SCHRIFT = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";

export function Karte({ periode, rahmen, ego, egoDelta, hervor, chef, thema, farben, onAuswahl }: Props) {
  const huelle = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [groesse, setGroesse] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<Zoom>(GESAMT);
  const stand = useRef(new Map<string, Zustand>());
  const start = useRef(new Map<string, Zustand>());
  const ziel = useRef(new Map<string, Zustand>());
  const t0 = useRef(0);
  const bild = useRef(0);
  const zeiger = useRef<string | null>(null);
  const zeichne = useRef<() => void>(() => {});
  // Wurde zuletzt nur gezoomt, folgt die Karte sofort, ohne Überblendung.
  const basis = useRef<unknown[]>([]);

  useEffect(() => {
    const el = huelle.current!;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(Math.min(Math.max(420, innerHeight * 0.72), w * (w < 640 ? 1.15 : 0.66)));
      setGroesse(g => (g.w === w && g.h === h ? g : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Neue Person in der Mitte oder anderes Parlament: zurück zur Gesamtansicht.
  useEffect(() => { setZoom(GESAMT); }, [ego, rahmen]);

  const naechste = useMemo(() => {
    if (ego === null || !egoDelta) return new Set<number>();
    return new Set([...egoDelta.keys()].filter(i => i !== ego && !periode.mdb[i].linie)
      .sort((a, b) => egoDelta[a] - egoDelta[b]).slice(0, NAECHSTE));
  }, [ego, egoDelta, periode]);

  const kanten = useMemo(() => {
    const k: [string, string][] = [];
    const gesehen = new Set<string>();
    periode.mdb.forEach((m, i) => (thema?.nachbarn[i] ?? m.nn).forEach(j => {
      const s = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!gesehen.has(s)) { gesehen.add(s); k.push([m.id, periode.mdb[j].id]); }
    }));
    return k;
  }, [periode, thema]);

  function begrenzt(z: Zoom): Zoom {
    const { w, h } = groesse;
    const k = Math.min(ZOOM_MAX, Math.max(1, z.k));
    if (k === 1) return GESAMT;
    const rand = 60;
    return {
      k,
      tx: Math.min(rand, Math.max(w * (1 - k) - rand, z.tx)),
      ty: Math.min(rand, Math.max(h * (1 - k) - rand, z.ty)),
    };
  }
  const zoomeUm = (faktor: number, mx: number, my: number) =>
    setZoom(z => begrenzt({ k: z.k * faktor, tx: mx - (mx - z.tx) * faktor, ty: my - (my - z.ty) * faktor }));

  // Mausrad nur mit Strg oder Cmd (und Trackpad-Pinch, das der Browser als
  // Strg+Rad meldet). Ohne Modifikator scrollt die Seite weiter; eine Karte, die
  // beim Lesen das Scrollen kapert, wäre schlimmer als ein fehlender Zoom.
  useEffect(() => {
    const c = leinwand.current!;
    const rad = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoomeUm(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener("wheel", rad, { passive: false });
    return () => c.removeEventListener("wheel", rad);
  });

  // Zeichnen: liest nur aus den Refs, damit die Animationsschleife ohne
  // React-Renders auskommt.
  zeichne.current = () => {
    const c = leinwand.current;
    if (!c || !groesse.w) return;
    const { w, h } = groesse;
    const dpr = devicePixelRatio || 1;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const st = stand.current;
    const egoId = ego !== null ? periode.mdb[ego].id : null;
    const linieId = periode.linie !== null ? periode.mdb[periode.linie].id : null;

    if (egoId && egoDelta) {
      const R = (Math.min(w, h) / 2 - 30) * zoom.k;
      const [cx, cy] = [w / 2 * zoom.k + zoom.tx, h / 2 * zoom.k + zoom.ty];
      ctx.strokeStyle = farben.linie;
      ctx.lineWidth = 1;
      for (const u of RINGE) {
        ctx.beginPath();
        ctx.arc(cx, cy, (1 - u) * R, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Kanten: fast unsichtbar, sie deuten das Netz nur an.
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = farben.tinte;
    if (!egoId) {
      ctx.globalAlpha = hervor === null ? 0.07 : 0.03;
      ctx.beginPath();
      for (const [a, b] of kanten) {
        const p = st.get(a), q = st.get(b);
        if (!p || !q || p.a < 0.5 || q.a < 0.5) continue;
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    } else {
      const e = st.get(egoId);
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      for (const i of naechste) {
        const q = st.get(periode.mdb[i].id);
        if (e && q) { ctx.moveTo(e.x, e.y); ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke();
    }
    const z = zeiger.current;
    if (z && periode.index.has(z)) {
      const p = st.get(z)!;
      const i = periode.index.get(z)!;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const j of thema?.nachbarn[i] ?? periode.mdb[i].nn) {
        const q = st.get(periode.mdb[j].id);
        if (q) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Punkte: gedimmte zuerst, damit hervorgehobene obenauf liegen.
    const reihe = [...st.entries()].filter(([id]) => id !== linieId).map(([id, s]) => {
      const i = periode.index.get(id);
      const gedimmt = hervor !== null && (i === undefined || periode.mdb[i].f !== hervor);
      return { id, s, gedimmt };
    }).sort((a, b) => Number(b.gedimmt) - Number(a.gedimmt) || a.s.r - b.s.r);
    for (const { s, gedimmt } of reihe) {
      if (s.a <= 0.01) continue;
      ctx.globalAlpha = s.a * (gedimmt ? 0.14 : 1);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      if (s.hohl) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = s.farbe;
        ctx.stroke();
      } else {
        ctx.fillStyle = s.farbe;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Ringbeschriftung erst nach den Punkten, mit Hof, damit sie über einem
    // dichten Klumpen lesbar bleibt.
    if (egoId && egoDelta) {
      const R = (Math.min(w, h) / 2 - 30) * zoom.k;
      const [cx, cy] = [w / 2 * zoom.k + zoom.tx, h / 2 * zoom.k + zoom.ty];
      ctx.font = `500 11px ${SCHRIFT}`;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = farben.grund;
      ctx.fillStyle = farben.tinte3;
      for (const u of RINGE) {
        const y = cy - (1 - u) * R - 4;
        ctx.strokeText(`${Math.round(u * 100)} %`, cx, y);
        ctx.fillText(`${Math.round(u * 100)} %`, cx, y);
      }
    }

    // Die Regierungslinie: kein Mensch, deshalb eine Raute statt eines Kreises.
    if (linieId) {
      const l = st.get(linieId);
      if (l && l.a > 0.5) {
        // Hohl mit Hof: auf einem dichten, dunklen Klumpen bliebe eine gefüllte
        // Raute unsichtbar.
        const r = linieId === egoId ? 7.5 : 5.5;
        const raute = () => {
          ctx.beginPath();
          ctx.moveTo(l.x, l.y - r); ctx.lineTo(l.x + r, l.y); ctx.lineTo(l.x, l.y + r); ctx.lineTo(l.x - r, l.y);
          ctx.closePath();
        };
        raute();
        ctx.fillStyle = farben.grund;
        ctx.fill();
        ctx.strokeStyle = farben.grund;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = farben.tinte;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        if (z !== linieId && linieId !== egoId)
          beschrifte(ctx, "Regierungslinie", "Mehrheit der Koalition", l.x, l.y, w, h, farben, true, "links");
      }
    }

    // Der Regierungschef ist selten die Mitte der Koalition (er stimmt selten
    // ab), aber ein verlässlicher Anhaltspunkt, wo die Regierung liegt.
    if (chef && chef.i !== ego && z !== periode.mdb[chef.i].id) {
      const c = st.get(periode.mdb[chef.i].id);
      if (c && c.a > 0.5) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = farben.tinte;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 3, 0, Math.PI * 2);
        ctx.stroke();
        beschrifte(ctx, periode.mdb[chef.i].name, chef.rolle, c.x, c.y, w, h, farben, true);
      }
    }

    if (egoId) {
      const e = st.get(egoId);
      if (e) {
        if (egoId !== linieId) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = farben.tinte;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r + 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (z !== egoId) {
          ctx.font = `650 13px ${SCHRIFT}`;
          ctx.textAlign = "center";
          ctx.lineJoin = "round";
          ctx.lineWidth = 4;
          ctx.strokeStyle = farben.grund;
          ctx.strokeText(periode.mdb[ego!].name, e.x, e.y + e.r + 20);
          ctx.fillStyle = farben.tinte;
          ctx.fillText(periode.mdb[ego!].name, e.x, e.y + e.r + 20);
        }
      }
    }
    if (z && periode.index.has(z)) {
      const m = periode.mdb[periode.index.get(z)!];
      const p = st.get(z)!;
      if (!m.linie) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = farben.tinte;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      const zweite = m.linie ? "Mehrheit der Koalition"
        : [fraktionsname(periode, m.f), m.zusatz].filter(Boolean).join(" · ");
      beschrifte(ctx, m.name, zweite, p.x, p.y, w, h, farben);
    }
  };

  // Neue Ziellagen, sobald sich Periode, Auswahl, Thema, Größe oder Zoom ändern.
  useEffect(() => {
    const { w, h } = groesse;
    if (!w) return;
    const klein = w < 640;
    const punkte: [number, number][] = thema
      ? periode.mdb.map((_, i) => [thema.lage[2 * i], thema.lage[2 * i + 1]])
      : periode.mdb.map(m => m.p);
    let xy: Float32Array;
    let radius: (i: number) => number;
    // Hineingezoomt wachsen die Punkte ein wenig mit, aber deutlich langsamer als
    // die Karte, sonst lägen sie wieder übereinander.
    const wachs = Math.min(1.8, 1 + (zoom.k - 1) * 0.12);
    let basisR: number;
    if (ego !== null && egoDelta) {
      const R = Math.min(w, h) / 2 - 30;
      xy = egoLage(ego, egoDelta, punkte, R, w / 2, h / 2);
      basisR = (klein ? 1.4 : 1.6) * wachs;
      radius = i => (i === ego ? 6 : naechste.has(i) ? 3.2 * wachs : basisR);
    } else {
      // Eine Themenkarte kann über den gemeinsamen Rahmen hinausreichen; dann
      // wird er erweitert, statt Punkte abzuschneiden.
      const r: [number, number, number, number] = [...rahmen];
      if (thema) for (const [px, py] of punkte) {
        r[0] = Math.min(r[0], px); r[1] = Math.max(r[1], px); r[2] = Math.min(r[2], py); r[3] = Math.max(r[3], py);
      }
      xy = einpassen(punkte, r, w, h, 26);
      basisR = (klein ? 1.8 : 2.2) * wachs;
      radius = () => basisR;
    }
    for (let i = 0; i < xy.length; i += 2) {
      xy[i] = xy[i] * zoom.k + zoom.tx;
      xy[i + 1] = xy[i + 1] * zoom.k + zoom.ty;
    }
    entzerre(xy, 2 * basisR + 0.5, ego);
    const duenn = mindestgrundlage(periode.abstimmungen.length);

    const neu = new Map<string, Zustand>();
    periode.mdb.forEach((m, i) => neu.set(m.id, {
      x: xy[2 * i], y: xy[2 * i + 1], a: 1, r: radius(i),
      farbe: farben.fraktion(periode.fraktionen[m.f]),
      hohl: periode.abgegeben[i] < duenn,
    }));
    const vorher = stand.current;
    const s = new Map<string, Zustand>(), zz = new Map<string, Zustand>();
    for (const [id, n] of neu) {
      const alt = vorher.get(id);
      s.set(id, alt ? { ...alt } : { ...n, a: 0 });
      zz.set(id, n);
    }
    for (const [id, alt] of vorher) {
      if (neu.has(id) || alt.a <= 0.01) continue;
      s.set(id, { ...alt });
      zz.set(id, { ...alt, a: 0 });
    }
    start.current = s;
    ziel.current = zz;
    t0.current = performance.now();
    const nurZoom = [periode, ego, egoDelta, thema, groesse].every((x, i) => x === basis.current[i]);
    basis.current = [periode, ego, egoDelta, thema, groesse];
    const dauer = vorher.size === 0 || nurZoom || bewegungArm() ? 0 : DAUER;

    cancelAnimationFrame(bild.current);
    const schritt = (jetzt: number) => {
      // Der Zeitstempel von requestAnimationFrame ist der Beginn des Frames
      // und kann vor t0 liegen, wenn davor lange gerechnet wurde.
      const t = dauer === 0 ? 1 : Math.min(1, Math.max(0, (jetzt - t0.current) / dauer));
      const e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const st = new Map<string, Zustand>();
      for (const [id, zi] of ziel.current) {
        const ss = start.current.get(id)!;
        st.set(id, {
          x: ss.x + (zi.x - ss.x) * e, y: ss.y + (zi.y - ss.y) * e,
          a: ss.a + (zi.a - ss.a) * e, r: ss.r + (zi.r - ss.r) * e,
          farbe: zi.farbe, hohl: zi.hohl,
        });
      }
      if (t >= 1) for (const [id, zi] of st) if (zi.a <= 0.01) st.delete(id);
      stand.current = st;
      zeichne.current();
      if (t < 1) bild.current = requestAnimationFrame(schritt);
    };
    bild.current = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(bild.current);
  }, [periode, ego, egoDelta, groesse, rahmen, farben, naechste, thema, zoom]);

  useEffect(() => { zeichne.current(); }, [hervor, farben, chef]);

  function treffer(clientX: number, clientY: number, reichweite: number): string | null {
    const rect = leinwand.current!.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best: string | null = null, bd = reichweite;
    for (const [id, s] of stand.current) {
      if (s.a < 0.5 || !periode.index.has(id)) continue;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // Ziehen verschiebt, zwei Finger zoomen. Wer gezogen hat, hat nicht geklickt.
  const finger = useRef(new Map<number, [number, number]>());
  const zug = useRef<{ x: number; y: number; zoom: Zoom; weg: number; abstand?: number } | null>(null);

  function runter(e: React.PointerEvent) {
    finger.current.set(e.pointerId, [e.clientX, e.clientY]);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pts = [...finger.current.values()];
    const mitte = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    zug.current = {
      x: mitte[0], y: mitte[1], zoom, weg: zug.current?.weg ?? 0,
      abstand: pts.length === 2 ? Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) : undefined,
    };
  }

  function bewegt(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && !e.buttons) {
      const t = treffer(e.clientX, e.clientY, 12);
      if (t !== zeiger.current) {
        zeiger.current = t;
        leinwand.current!.style.cursor = t ? "pointer" : zoom.k > 1 ? "grab" : "default";
        zeichne.current();
      }
      return;
    }
    if (!finger.current.has(e.pointerId) || !zug.current) return;
    finger.current.set(e.pointerId, [e.clientX, e.clientY]);
    const pts = [...finger.current.values()];
    const mitte = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    const z0 = zug.current;
    const dx = mitte[0] - z0.x, dy = mitte[1] - z0.y;
    z0.weg = Math.max(z0.weg, Math.hypot(dx, dy));
    if (pts.length === 2 && z0.abstand) {
      const r = leinwand.current!.getBoundingClientRect();
      const f = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) / z0.abstand;
      const mx = z0.x - r.left, my = z0.y - r.top;
      setZoom(begrenzt({
        k: z0.zoom.k * f,
        tx: mx - (mx - z0.zoom.tx) * f + dx,
        ty: my - (my - z0.zoom.ty) * f + dy,
      }));
      z0.weg = Math.max(z0.weg, 10);
    } else if (z0.zoom.k > 1) {
      setZoom(begrenzt({ k: z0.zoom.k, tx: z0.zoom.tx + dx, ty: z0.zoom.ty + dy }));
    }
  }

  function hoch(e: React.PointerEvent) {
    finger.current.delete(e.pointerId);
    if (finger.current.size === 0) setTimeout(() => { zug.current = null; }, 0);
    else {
      // Von zwei auf einen Finger: neu ansetzen, sonst springt die Karte.
      const [p] = [...finger.current.values()];
      zug.current = { x: p[0], y: p[1], zoom, weg: zug.current?.weg ?? 0 };
    }
  }

  const egoName = ego !== null ? periode.mdb[ego].name : null;
  const { w, h } = groesse;
  return (
    <div className="karte" ref={huelle}>
      <canvas
        ref={leinwand}
        width={w * (globalThis.devicePixelRatio || 1)}
        height={h * (globalThis.devicePixelRatio || 1)}
        style={{ width: w, height: h, touchAction: zoom.k > 1 ? "none" : "pan-y" }}
        role="img"
        aria-label={egoName
          ? `Ego-Ansicht: ${egoName} in der Mitte, alle anderen im Abstand ihrer Unähnlichkeit.`
          : `Nähe-Netz der ${periode.wp}. Wahlperiode: ${periode.mdb.length} Abgeordnete.`}
        onPointerDown={runter}
        onPointerMove={bewegt}
        onPointerUp={hoch}
        onPointerCancel={hoch}
        onPointerLeave={e => { if (e.pointerType === "mouse") { zeiger.current = null; zeichne.current(); } }}
        onClick={e => {
          if ((zug.current?.weg ?? 0) > 4) return;
          const t = treffer(e.clientX, e.clientY, 20);
          if (t) onAuswahl(t);
          else if (ego !== null) onAuswahl(null);
        }}
      />
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Hineinzoomen" onClick={() => zoomeUm(1.6, w / 2, h / 2)}
          disabled={zoom.k >= ZOOM_MAX}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
        </button>
        <button type="button" aria-label="Herauszoomen" onClick={() => zoomeUm(1 / 1.6, w / 2, h / 2)}
          disabled={zoom.k <= 1}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
        </button>
        {zoom.k > 1 && (
          <button type="button" className="zoom-gesamt" onClick={() => setZoom(GESAMT)}>Gesamtansicht</button>
        )}
      </div>
    </div>
  );
}

function beschrifte(
  ctx: CanvasRenderingContext2D, name: string, zusatz: string,
  x: number, y: number, w: number, h: number, farben: Farben, leise = false,
  seite: "rechts" | "links" = "rechts",
) {
  ctx.font = `650 13px ${SCHRIFT}`;
  const b1 = ctx.measureText(name).width;
  ctx.font = `450 12px ${SCHRIFT}`;
  const b2 = ctx.measureText(zusatz).width;
  const breite = Math.max(b1, b2);
  let lx = seite === "rechts" ? x + 9 : x - 9 - breite, ly = y - 12;
  if (lx + breite > w - 6) lx = x - 9 - breite;
  if (lx < 6) lx = x + 9;
  if (ly - 14 < 4) ly = y + 26;
  if (ly > h - 6) ly = h - 6;
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = farben.grund;
  ctx.font = `650 13px ${SCHRIFT}`;
  ctx.strokeText(name, lx, ly - 14);
  ctx.fillStyle = leise ? farben.tinte2 : farben.tinte;
  ctx.fillText(name, lx, ly - 14);
  ctx.font = `450 12px ${SCHRIFT}`;
  ctx.strokeText(zusatz, lx, ly);
  ctx.fillStyle = farben.tinte2;
  ctx.fillText(zusatz, lx, ly);
}
