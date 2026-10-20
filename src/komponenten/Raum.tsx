// Versuch: dasselbe Netz in drei Dimensionen. Die dritte Achse trägt meist
// wenig zusätzliche Struktur (siehe Stress in der Methodik), in manchen
// Perioden aber trennt sie, was in der Karte übereinanderliegt.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Vorbereitet } from "../lib/daten.ts";
import type { Farben } from "../lib/farben.ts";
import { fraktionsname } from "../lib/fraktionen.ts";
import { NAECHSTE } from "./Karte.tsx";

const DAUER = 600;

interface Props {
  periode: Vorbereitet;
  umfang: number;
  ego: number | null;
  egoDelta: Float64Array | null;
  hervor: number | null;
  chef: { i: number; rolle: string } | null;
  farben: Farben;
  onAuswahl: (id: string | null) => void;
}

const SCHATTIERER = {
  vertexShader: `
    attribute float groesse;
    attribute float deckkraft;
    attribute vec3 farbe;
    uniform float pixel;
    varying vec3 vFarbe;
    varying float vDeckkraft;
    void main() {
      vFarbe = farbe;
      vDeckkraft = deckkraft;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = groesse * pixel * (2.8 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vFarbe;
    varying float vDeckkraft;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      gl_FragColor = vec4(vFarbe, vDeckkraft * smoothstep(0.5, 0.4, d));
    }`,
};

interface Welt {
  renderer: THREE.WebGLRenderer;
  szene: THREE.Scene;
  kamera: THREE.PerspectiveCamera;
  steuerung: OrbitControls;
  punkte: THREE.Points;
  kanten: THREE.LineSegments;
  strahlen: THREE.LineSegments;
}

export default function Raum({ periode, umfang, ego, egoDelta, hervor, chef, farben, onAuswahl }: Props) {
  const huelle = useRef<HTMLDivElement>(null);
  const welt = useRef<Welt | null>(null);
  const lage = useRef(new Map<string, [number, number, number]>());
  const [zeiger, setZeiger] = useState<{ i: number; x: number; y: number } | null>(null);
  const [hoehe, setHoehe] = useState(480);

  const naechste = useMemo(() => {
    if (ego === null || !egoDelta) return new Set<number>();
    return new Set([...egoDelta.keys()].filter(i => i !== ego)
      .sort((a, b) => egoDelta[a] - egoDelta[b]).slice(0, NAECHSTE));
  }, [ego, egoDelta]);

  // Aufbau einmalig
  useEffect(() => {
    const el = huelle.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(devicePixelRatio);
    el.appendChild(renderer.domElement);
    const szene = new THREE.Scene();
    const kamera = new THREE.PerspectiveCamera(40, 1, 0.05, 20);
    kamera.position.set(0, 0, 2.4);
    const steuerung = new OrbitControls(kamera, renderer.domElement);
    steuerung.enableDamping = true;
    steuerung.dampingFactor = 0.08;
    steuerung.enablePan = false;
    steuerung.minDistance = 1.2;
    steuerung.maxDistance = 6;
    // Langsames Drehen, bis jemand selbst greift: Erst die Bewegung macht die
    // Tiefe lesbar.
    steuerung.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    steuerung.autoRotateSpeed = 0.6;
    steuerung.addEventListener("start", () => { steuerung.autoRotate = false; });

    const material = new THREE.ShaderMaterial({
      ...SCHATTIERER,
      uniforms: { pixel: { value: devicePixelRatio } },
      transparent: true,
      depthWrite: false,
    });
    const punkte = new THREE.Points(new THREE.BufferGeometry(), material);
    const kanten = new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.07, depthWrite: false }));
    const strahlen = new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }));
    szene.add(kanten, strahlen, punkte);
    welt.current = { renderer, szene, kamera, steuerung, punkte, kanten, strahlen };

    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(Math.min(Math.max(420, innerHeight * 0.72), w * (w < 640 ? 1.15 : 0.66)));
      renderer.setSize(w, h);
      kamera.aspect = w / h;
      kamera.updateProjectionMatrix();
      setHoehe(h);
    });
    ro.observe(el);
    renderer.setAnimationLoop(() => {
      steuerung.update();
      renderer.render(szene, kamera);
    });
    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      steuerung.dispose();
      for (const o of [punkte, kanten, strahlen]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      welt.current = null;
    };
  }, []);

  // Periode, Auswahl, Hervorhebung oder Farben geändert: Attribute neu setzen,
  // Lage von der bisherigen zur neuen überblenden.
  useEffect(() => {
    const w = welt.current;
    if (!w) return;
    const N = periode.mdb.length;
    const ziel = new Float32Array(3 * N), von = new Float32Array(3 * N);
    const farbe = new Float32Array(3 * N), groesse = new Float32Array(N), deckkraft = new Float32Array(N);
    const c = new THREE.Color();
    periode.mdb.forEach((m, i) => {
      const p = m.r.map(v => v / umfang) as [number, number, number];
      ziel.set(p, 3 * i);
      von.set(lage.current.get(m.id) ?? p, 3 * i);
      // THREE.Color rechnet Hex in den linearen Farbraum um; der Shader gibt
      // unverändert aus, also zurück nach sRGB, sonst werden alle Farben dunkler.
      c.set(farben.fraktion(periode.fraktionen[m.f])).convertLinearToSRGB();
      farbe.set([c.r, c.g, c.b], 3 * i);
      const gedimmt = hervor !== null && m.f !== hervor;
      if (ego === null) {
        groesse[i] = i === chef?.i ? 9 : 4.5;
        deckkraft[i] = gedimmt ? 0.12 : 0.95;
      } else {
        groesse[i] = i === ego ? 13 : naechste.has(i) ? 7 : 3.5;
        deckkraft[i] = i === ego || naechste.has(i) ? 1 : gedimmt ? 0.1 : 0.45;
      }
    });
    const g = w.punkte.geometry;
    const position = new THREE.BufferAttribute(von.slice(), 3);
    g.setAttribute("position", position);
    g.setAttribute("farbe", new THREE.BufferAttribute(farbe, 3));
    g.setAttribute("groesse", new THREE.BufferAttribute(groesse, 1));
    g.setAttribute("deckkraft", new THREE.BufferAttribute(deckkraft, 1));
    g.computeBoundingSphere();

    const kantenPaare: number[] = [];
    if (ego === null) periode.mdb.forEach((m, i) => m.nn.forEach(j => { if (i < j || !periode.mdb[j].nn.includes(i)) kantenPaare.push(i, j); }));
    const strahlPaare: number[] = ego === null ? [] : [...naechste].flatMap(j => [ego, j]);
    const tinte = new THREE.Color(farben.tinte);
    (w.kanten.material as THREE.LineBasicMaterial).color = tinte;
    (w.kanten.material as THREE.LineBasicMaterial).opacity = hervor === null ? 0.07 : 0.03;
    (w.strahlen.material as THREE.LineBasicMaterial).color = tinte;

    const linien = (paare: number[], quelle: Float32Array) => {
      const a = new Float32Array(paare.length * 3);
      paare.forEach((i, k) => a.set(quelle.subarray(3 * i, 3 * i + 3), 3 * k));
      return a;
    };
    const setzeLinien = (quelle: Float32Array) => {
      w.kanten.geometry.setAttribute("position", new THREE.BufferAttribute(linien(kantenPaare, quelle), 3));
      w.strahlen.geometry.setAttribute("position", new THREE.BufferAttribute(linien(strahlPaare, quelle), 3));
    };
    setzeLinien(von);

    const t0 = performance.now();
    const aktuell = von.slice();
    let bild = 0;
    const schritt = (jetzt: number) => {
      const t = Math.min(1, Math.max(0, (jetzt - t0) / DAUER));   // siehe Karte.tsx
      const e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      for (let k = 0; k < aktuell.length; k++) aktuell[k] = von[k] + (ziel[k] - von[k]) * e;
      position.array.set(aktuell);
      position.needsUpdate = true;
      setzeLinien(aktuell);
      if (t < 1) bild = requestAnimationFrame(schritt);
    };
    bild = requestAnimationFrame(schritt);
    lage.current = new Map(periode.mdb.map((m, i) => [m.id, [ziel[3 * i], ziel[3 * i + 1], ziel[3 * i + 2]]]));
    return () => cancelAnimationFrame(bild);
  }, [periode, umfang, ego, naechste, hervor, chef, farben]);

  // Zeigen und Wählen über einen Strahl in die Szene
  const druck = useRef<[number, number] | null>(null);
  function treffer(e: React.PointerEvent): number | null {
    const w = welt.current;
    if (!w) return null;
    const r = w.renderer.domElement.getBoundingClientRect();
    const maus = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const strahl = new THREE.Raycaster();
    strahl.params.Points = { threshold: 0.02 };
    strahl.setFromCamera(maus, w.kamera);
    const t = strahl.intersectObject(w.punkte);
    if (!t.length) return null;
    t.sort((a, b) => (a.distanceToRay ?? 0) - (b.distanceToRay ?? 0));
    return t[0].index ?? null;
  }

  const m = zeiger ? periode.mdb[zeiger.i] : null;
  return (
    <div className="raum" style={{ height: hoehe }}>
      <div
        ref={huelle}
        className="raum-flaeche"
        role="img"
        aria-label={`Nähe-Netz der ${periode.wp}. Wahlperiode im Raum. Ziehen dreht, Scrollen zoomt.`}
        onPointerDown={e => { druck.current = [e.clientX, e.clientY]; }}
        onPointerMove={e => {
          if (e.pointerType !== "mouse" || e.buttons) return;
          const i = treffer(e);
          const r = e.currentTarget.getBoundingClientRect();
          setZeiger(i === null ? null : { i, x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onPointerLeave={() => setZeiger(null)}
        onClick={e => {
          const d = druck.current;
          if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return;   // war ein Drehen
          const i = treffer(e as unknown as React.PointerEvent);
          if (i !== null) onAuswahl(periode.mdb[i].id);
          else if (ego !== null) onAuswahl(null);
        }}
      />
      {m && zeiger && (
        <div className="raum-etikett" style={{ left: zeiger.x + 12, top: zeiger.y - 34 }}>
          <strong>{m.name}</strong>
          <span>{fraktionsname(periode, m.f)}</span>
        </div>
      )}
      <p className="raum-hinweis">Ziehen dreht, Scrollen zoomt.</p>
    </div>
  );
}
