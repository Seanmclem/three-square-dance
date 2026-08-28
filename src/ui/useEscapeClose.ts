import { useEffect, useRef } from "react";

/**
 * Esc closes the TOPMOST open editor modal (v4.79.45). Modals register on mount
 * in a stack, so a confirm dialog stacked over another modal closes alone.
 * The single window listener runs in the capture phase and stops the event,
 * so the editor's own Escape handling (tool disarm, preview exit, drag
 * cancel) does not also fire while a modal is up.
 */
const stack: Array<() => void> = [];

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  stack[stack.length - 1]!();
}

export function useEscapeClose(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = () => ref.current();
    stack.push(entry);
    if (stack.length === 1) window.addEventListener("keydown", onKeyDown, true);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}
