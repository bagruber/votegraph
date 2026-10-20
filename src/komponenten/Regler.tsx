// Regler über die Wahlperioden, als ARIA-Slider: Pfeiltasten, Pos1/Ende,
// Ziehen mit Maus oder Finger. Ist jemand ausgewählt, sind dessen Perioden
// auf der Leiste markiert.
import { useRef } from "react";
import type { Index } from "../lib/daten.ts";

interface Props {
  perioden: Index["perioden"];
  wp: number;
  markiert: number[] | null;
  onWp: (wp: number) => void;
}

export function Regler({ perioden, wp, markiert, onWp }: Props) {
  const leiste = useRef<HTMLDivElement>(null);
  const pos = perioden.findIndex(p => p.wp === wp);
  const anteil = (i: number) => (perioden.length === 1 ? 0.5 : i / (perioden.length - 1));

  function ausZeiger(clientX: number) {
    const r = leiste.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / r.width) * (perioden.length - 1));
    const p = perioden[Math.max(0, Math.min(perioden.length - 1, i))];
    if (p.wp !== wp) onWp(p.wp);
  }

  function taste(e: React.KeyboardEvent) {
    const ziel = { ArrowLeft: pos - 1, ArrowDown: pos - 1, ArrowRight: pos + 1, ArrowUp: pos + 1,
      Home: 0, End: perioden.length - 1 }[e.key];
    if (ziel === undefined) return;
    e.preventDefault();
    const p = perioden[Math.max(0, Math.min(perioden.length - 1, ziel))];
    if (p.wp !== wp) onWp(p.wp);
  }

  const aktuell = perioden[pos];
  return (
    <div className="regler">
      <div
        ref={leiste}
        className="regler-leiste"
        role="slider"
        tabIndex={0}
        aria-label="Wahlperiode"
        aria-valuemin={perioden[0].wp}
        aria-valuemax={perioden[perioden.length - 1].wp}
        aria-valuenow={wp}
        aria-valuetext={`${wp}. Wahlperiode, ${aktuell.von.slice(0, 4)} bis ${aktuell.bis?.slice(0, 4) ?? "heute"}`}
        onKeyDown={taste}
        onPointerDown={e => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          ausZeiger(e.clientX);
        }}
        onPointerMove={e => { if (e.buttons) ausZeiger(e.clientX); }}
      >
        <div className="regler-schiene" />
        {perioden.map((p, i) => {
          const dabei = markiert?.includes(p.wp);
          return (
            <div
              key={p.wp}
              className={"regler-station"
                + (p.wp === wp ? " aktiv" : "")
                + (markiert ? (dabei ? " dabei" : " ohne") : "")}
              style={{ left: `${anteil(i) * 100}%` }}
            >
              <span className="regler-punkt" />
              <span className="regler-wp">{p.wp}</span>
              <span className="regler-jahr">{p.von.slice(0, 4)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
