// Canvas und three.js lesen die Farben aus den CSS-Variablen, damit hell und
// dunkel nur an einer Stelle definiert sind.
import { useEffect, useState } from "react";

export interface Farben {
  grund: string;
  tinte: string;
  tinte2: string;
  tinte3: string;
  linie: string;
  fraktion: (kennung: string) => string;
}

function lies(): Farben {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    grund: v("--grund"),
    tinte: v("--tinte"),
    tinte2: v("--tinte-2"),
    tinte3: v("--tinte-3"),
    linie: v("--linie"),
    fraktion: k => v(`--f-${k === "andere" ? "fraktionslos" : k}`),
  };
}

export function useFarben(): Farben {
  const [farben, setFarben] = useState(lies);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const neu = () => setFarben(lies());
    mq.addEventListener("change", neu);
    return () => mq.removeEventListener("change", neu);
  }, []);
  return farben;
}
