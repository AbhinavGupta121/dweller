import { useCallback, useEffect, useState } from "react";

export type Theme = "night" | "day";
export type ThemeChoice = "auto" | Theme;

const KEY = "dweller.theme";

/**
 * Ambient by default, overridable on purpose.
 *
 * Following the system is the right default — someone setting out at ten in the
 * morning should not have to hunt for a setting to be able to read the screen.
 * But the override exists because the system preference and the actual light on
 * your screen disagree more often outdoors than in: phones sit in dark mode all
 * year, and direct sun makes the night palette unreadable regardless.
 *
 * The map needs the resolved value as a prop rather than reading the DOM, hence
 * returning it rather than only setting the attribute.
 */
export function useTheme(): {
  theme: Theme;
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    const saved = localStorage.getItem(KEY);
    return saved === "night" || saved === "day" ? saved : "auto";
  });

  const [ambient, setAmbient] = useState<Theme>(() =>
    window.matchMedia("(prefers-color-scheme: light)").matches
      ? "day"
      : "night",
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => setAmbient(query.matches ? "day" : "night");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const theme = choice === "auto" ? ambient : choice;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // Keeps the phone's own status bar and the browser's overscroll colour in
    // step with the app, which is most of what stops a PWA looking like a page.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "day" ? "#f7f4ee" : "#0b0b0c");
    }
  }, [theme]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    if (c === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  }, []);

  return { theme, choice, setChoice };
}
