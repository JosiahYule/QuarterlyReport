import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

// True while the browser is printing (the Save PDF button, or Ctrl/Cmd+P).
//
// Parts of the report fold content away on screen: campaigns collapse, long
// audience lists stop at a "show more". A printout can't be clicked open, so
// those parts read this and show everything while it's true.
//
// The browser lays the page out for print straight after `beforeprint`, so
// the re-render has to land inside that handler. flushSync makes React
// render immediately instead of on its usual next tick, which would be too
// late and print the folded version.
export function usePrinting() {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return printing;
}
