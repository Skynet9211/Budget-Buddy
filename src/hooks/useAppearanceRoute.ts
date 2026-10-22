import { useCallback } from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";

/** The Appearance page lives at this path. It is drawn on top of whichever page opened it. */
export const APPEARANCE_PATH = "/appearance";

/** Where to land when Appearance is opened directly (a typed/bookmarked URL) and then closed. */
export const DEFAULT_PATH = "/dashboard";

type AppearanceState = { background?: Location } | null;

/** The page that was on screen when Appearance was opened, if it was opened from inside the app. */
export function useBackgroundLocation(): Location | undefined {
  const location = useLocation();
  return (location.state as AppearanceState)?.background;
}

export function useAppearanceOpen() {
  return useLocation().pathname === APPEARANCE_PATH;
}

export function useOpenAppearance() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    () => navigate(APPEARANCE_PATH, { state: { background: location } }),
    [navigate, location],
  );
}

export function useCloseAppearance() {
  const navigate = useNavigate();
  const background = useBackgroundLocation();
  return useCallback(() => {
    // Opened from inside the app: "back" returns to the page underneath, as the browser/Android
    // back button does. Opened by a direct link: go to the default page instead of leaving the app.
    if (background) navigate(-1);
    else navigate(DEFAULT_PATH, { replace: true });
  }, [navigate, background]);
}
