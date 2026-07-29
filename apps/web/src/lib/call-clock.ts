/**
 * The live call's elapsed seconds, published by the session page so the notes
 * dock can timestamp a marker.
 *
 * ponytail: a module-level number, not a context provider. Exactly one call runs
 * at a time, the dock reads it only on click, and a provider would re-render the
 * whole session tree every second for a value nothing renders.
 */
let elapsed = 0;
let active = false;

export function setCallClock(seconds: number) { elapsed = seconds; }
export function startCallClock() { active = true; elapsed = 0; }
export function stopCallClock() { active = false; elapsed = 0; }
export function callClock(): number { return elapsed; }
export function callRunning(): boolean { return active; }
