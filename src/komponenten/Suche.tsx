// Suche über alle MdB aller Perioden, als Combobox mit Listbox.
import { useId, useMemo, useState } from "react";
import type { Person } from "../lib/daten.ts";

const falte = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function spanne(wps: number[]): string {
  // 10, 11, 12, 16, 17 -> "10–12, 16–17"
  const teile: string[] = [];
  let a = wps[0], b = wps[0];
  for (const w of [...wps.slice(1), Infinity]) {
    if (w === b + 1) { b = w; continue; }
    teile.push(a === b ? `${a}` : `${a}–${b}`);
    a = b = w;
  }
  return teile.join(", ");
}

interface Props {
  personen: Person[];
  onWahl: (p: Person) => void;
}

export function Suche({ personen, onWahl }: Props) {
  const [text, setText] = useState("");
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(0);
  const id = useId();
  const gefaltet = useMemo(() => personen.map(p => falte(p.name)), [personen]);

  const treffer = useMemo(() => {
    const q = falte(text.trim());
    if (q.length < 2) return [];
    const out: Person[] = [];
    // Nachnamen-Anfang zuerst, dann irgendwo im Namen
    personen.forEach((p, i) => { if (gefaltet[i].split(" ").some(t => t.startsWith(q))) out.push(p); });
    personen.forEach((p, i) => { if (!out.includes(p) && gefaltet[i].includes(q)) out.push(p); });
    return out.slice(0, 8);
  }, [text, personen, gefaltet]);

  function waehle(p: Person) {
    onWahl(p);
    setText("");
    setOffen(false);
  }

  const sichtbar = offen && treffer.length > 0;
  return (
    <div className="suche">
      <label htmlFor={`${id}-feld`} className="unsichtbar">Abgeordnete suchen</label>
      <input
        id={`${id}-feld`}
        type="search"
        placeholder="Abgeordnete suchen"
        autoComplete="off"
        role="combobox"
        aria-expanded={sichtbar}
        aria-controls={`${id}-liste`}
        aria-activedescendant={sichtbar ? `${id}-${markiert}` : undefined}
        value={text}
        onChange={e => { setText(e.target.value); setOffen(true); setMarkiert(0); }}
        onFocus={() => setOffen(true)}
        onBlur={() => setTimeout(() => setOffen(false), 120)}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setMarkiert(m => Math.min(treffer.length - 1, m + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setMarkiert(m => Math.max(0, m - 1)); }
          else if (e.key === "Enter" && treffer[markiert]) waehle(treffer[markiert]);
          else if (e.key === "Escape") { setOffen(false); }
        }}
      />
      {sichtbar && (
        <ul className="suche-liste" id={`${id}-liste`} role="listbox">
          {treffer.map((p, i) => (
            <li
              key={p.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === markiert}
              onMouseDown={e => { e.preventDefault(); waehle(p); }}
              onMouseEnter={() => setMarkiert(i)}
            >
              <span>{p.name}</span>
              <span className="suche-wp">WP {spanne(p.wps)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
