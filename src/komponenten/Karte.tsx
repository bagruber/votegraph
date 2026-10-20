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

interface Zustand { x: number; y: number; a: number; r: number; farbe: string; hohl: boolean }

interface Props {
  periode: Vorbereitet;
  rahmen: [number, number, number, number];
  ego: number | null;
  egoDelta: Float64Array | null;
  hervor: number | null;
  /** Kanzler oder Ministerpräsident dieser Periode, als Orientierungspunkt. */
  chef: { i: number; rolle: string } | null;
  farben: Farben;
  onAuswahl: (id: string | null) => void;
}

const bewegungArm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Karte({ periode, rahmen, ego, egoDelta, hervor, chef, farben, onAuswahl }: Props) {
  const huelle = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const [groesse, setGroesse] = useState({ w: 0, h: 0 });
  const stand = useRef(new Map<string, Zustand>());
  const start = useRef(new Map<string, Zustand>());
  const ziel = useRef(new Map<string, Zustand>());
  const t0 = useRef(0);
  const bild = useRef(0);
  const zeiger = useRef<string | null>(null);
  const zeichne = useRef<() => void>(() => {});

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

  const naechste = useMemo(() => {
    if (ego === null || !egoDelta) return new Set<number>();
    return new Set([...egoDelta.keys()].filter(i => i !== ego)
      .sort((a, b) => egoDelta[a] - egoDelta[b]).slice(0, NAECHSTE));
  }, [ego, egoDelta]);

  const kanten = useMemo(() => {
    const k: [string, string][] = [];
    const gesehen = new Set<string>();
    periode.mdb.forEach((m, i) => m.nn.forEach(j => {
      const s = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!gesehen.has(s)) { gesehen.add(s); k.push([m.id, periode.mdb[j].id]); }
    }));
    return k;
  }, [periode]);

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

    if (egoId && egoDelta) {
      const R = Math.min(w, h) / 2 - 30;
      ctx.lineWidth = 1;
      ctx.font = "500 11px 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const u of RINGE) {
        ctx.strokeStyle = farben.linie;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (1 - u) * R, 0, Math.PI * 2);
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
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const j of periode.mdb[periode.index.get(z)!].nn) {
        const q = st.get(periode.mdb[j].id);
        if (q) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Punkte: gedimmte zuerst, damit hervorgehobene obenauf liegen.
    const reihe = [...st.entries()].map(([id, s]) => {
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
      const R = Math.min(w, h) / 2 - 30;
      ctx.font = "500 11px 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = farben.grund;
      ctx.fillStyle = farben.tinte3;
      for (const u of RINGE) {
        const y = h / 2 - (1 - u) * R - 4;
        ctx.strokeText(`${Math.round(u * 100)} %`, w / 2, y);
        ctx.fillText(`${Math.round(u * 100)} %`, w / 2, y);
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
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = farben.tinte;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        if (z !== egoId) {
          ctx.font = "650 13px 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
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
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = farben.tinte;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
      beschrifte(ctx, m.name, fraktionsname(periode, m.f), p.x, p.y, w, h, farben);
    }
  };

  // Neue Ziellagen, sobald sich Periode, Auswahl oder Größe ändern.
  useEffect(() => {
    const { w, h } = groesse;
    if (!w) return;
    const klein = w < 640;
    const punkte = periode.mdb.map(m => m.p);
    let xy: Float32Array;
    let radius: (i: number) => number;
    let abstand: number;
    if (ego !== null && egoDelta) {
      const R = Math.min(w, h) / 2 - 30;
      xy = egoLage(ego, egoDelta, punkte, R, w / 2, h / 2);
      const basis = klein ? 1.4 : 1.6;
      radius = i => (i === ego ? 6 : naechste.has(i) ? 3.2 : basis);
      abstand = 2 * basis + 0.6;
    } else {
      xy = einpassen(punkte, rahmen, w, h, 26);
      const basis = klein ? 1.8 : 2.2;
      radius = () => basis;
      abstand = 2 * basis + 0.5;
    }
    entzerre(xy, abstand, ego);
    const duenn = mindestgrundlage(periode.abstimmungen.length);

    const neu = new Map<string, Zustand>();
    periode.mdb.forEach((m, i) => neu.set(m.id, {
      x: xy[2 * i], y: xy[2 * i + 1], a: 1, r: radius(i),
      farbe: farben.fraktion(periode.fraktionen[m.f]),
      hohl: periode.abgegeben[i] < duenn,
    }));
    const vorher = stand.current;
    const s = new Map<string, Zustand>(), z = new Map<string, Zustand>();
    for (const [id, n] of neu) {
      const alt = vorher.get(id);
      s.set(id, alt ? { ...alt } : { ...n, a: 0 });
      z.set(id, n);
    }
    for (const [id, alt] of vorher) {
      if (neu.has(id) || alt.a <= 0.01) continue;
      s.set(id, { ...alt });
      z.set(id, { ...alt, a: 0 });
    }
    start.current = s;
    ziel.current = z;
    t0.current = performance.now();
    const dauer = vorher.size === 0 || bewegungArm() ? 0 : DAUER;

    cancelAnimationFrame(bild.current);
    const schritt = (jetzt: number) => {
      // Der Zeitstempel von requestAnimationFrame ist der Beginn des Frames
      // und kann vor t0 liegen, wenn davor lange gerechnet wurde.
      const t = dauer === 0 ? 1 : Math.min(1, Math.max(0, (jetzt - t0.current) / dauer));
      const e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const st = new Map<string, Zustand>();
      for (const [id, zz] of ziel.current) {
        const ss = start.current.get(id)!;
        st.set(id, {
          x: ss.x + (zz.x - ss.x) * e, y: ss.y + (zz.y - ss.y) * e,
          a: ss.a + (zz.a - ss.a) * e, r: ss.r + (zz.r - ss.r) * e,
          farbe: zz.farbe, hohl: zz.hohl,
        });
      }
      if (t >= 1) for (const [id, zz] of st) if (zz.a <= 0.01) st.delete(id);
      stand.current = st;
      zeichne.current();
      if (t < 1) bild.current = requestAnimationFrame(schritt);
    };
    bild.current = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(bild.current);
  }, [periode, ego, egoDelta, groesse, rahmen, farben, naechste]);

  useEffect(() => { zeichne.current(); }, [hervor, farben, chef]);

  function treffer(e: React.PointerEvent | React.MouseEvent, reichweite: number): string | null {
    const rect = leinwand.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: string | null = null, bd = reichweite;
    for (const [id, s] of stand.current) {
      if (s.a < 0.5 || !periode.index.has(id)) continue;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  const egoName = ego !== null ? periode.mdb[ego].name : null;
  return (
    <div className="karte" ref={huelle}>
      <canvas
        ref={leinwand}
        width={groesse.w * (globalThis.devicePixelRatio || 1)}
        height={groesse.h * (globalThis.devicePixelRatio || 1)}
        style={{ width: groesse.w, height: groesse.h }}
        role="img"
        aria-label={egoName
          ? `Ego-Ansicht: ${egoName} in der Mitte, alle anderen im Abstand ihrer Unähnlichkeit.`
          : `Nähe-Netz der ${periode.wp}. Wahlperiode: ${periode.mdb.length} Abgeordnete.`}
        onPointerMove={e => {
          if (e.pointerType !== "mouse") return;
          const t = treffer(e, 12);
          if (t !== zeiger.current) {
            zeiger.current = t;
            leinwand.current!.style.cursor = t ? "pointer" : "default";
            zeichne.current();
          }
        }}
        onPointerLeave={() => { zeiger.current = null; zeichne.current(); }}
        onClick={e => {
          const t = treffer(e, 20);
          if (t) onAuswahl(t);
          else if (ego !== null) onAuswahl(null);
        }}
      />
    </div>
  );
}

function beschrifte(
  ctx: CanvasRenderingContext2D, name: string, zusatz: string,
  x: number, y: number, w: number, h: number, farben: Farben, leise = false,
) {
  const schrift = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
  ctx.font = `650 13px ${schrift}`;
  const b1 = ctx.measureText(name).width;
  ctx.font = `450 12px ${schrift}`;
  const b2 = ctx.measureText(zusatz).width;
  const breite = Math.max(b1, b2);
  let lx = x + 9, ly = y - 12;
  if (lx + breite > w - 6) lx = x - 9 - breite;
  if (ly - 14 < 4) ly = y + 26;
  if (ly > h - 6) ly = h - 6;
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = farben.grund;
  ctx.font = `650 13px ${schrift}`;
  ctx.strokeText(name, lx, ly - 14);
  ctx.fillStyle = leise ? farben.tinte2 : farben.tinte;
  ctx.fillText(name, lx, ly - 14);
  ctx.font = `450 12px ${schrift}`;
  ctx.strokeText(zusatz, lx, ly);
  ctx.fillStyle = farben.tinte2;
  ctx.fillText(zusatz, lx, ly);
}
