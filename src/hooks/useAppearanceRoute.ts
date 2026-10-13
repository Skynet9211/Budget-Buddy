import { useSyncExternalStore } from "react";

/**
 * The Appearance page lives at "#/appearance". Using the URL hash means the browser/Android back
 * button closes it, without pulling in a router for a single extra page.
 */
const HASH = "#/appearance";

/** True when this page was opened from inside the app (so "back" can safely mean history.back()). */
let openedByApp = false;

const isOpen = () => location.hash === HASH;

function subscribe(cb: () => void) {
  const onChange = () => {
    if (!isOpen()) openedByApp = false;
    cb();
  };
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function openAppearance() {
  openedByApp = true;
  location.hash = HASH;
}

export function closeAppearance() {
  if (openedByApp) {
    openedByApp = false;
    history.back();
  } else {
    // Opened by a direct link: drop the hash instead of leaving the app.
    history.replaceState(null, "", location.pathname + location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}

export function useAppearanceOpen() {
  return useSyncExternalStore(subscribe, isOpen);
}
