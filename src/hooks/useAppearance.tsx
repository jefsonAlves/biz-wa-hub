import { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const FONT_SCALES = [0.9, 1, 1.1, 1.25] as const;
export type FontScale = (typeof FONT_SCALES)[number];
export const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 0.9, label: "Pequena" },
  { value: 1, label: "Padrão" },
  { value: 1.1, label: "Grande" },
  { value: 1.25, label: "Muito grande" },
];

interface AppearanceContextValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  fontScale: FontScale;
  setFontScale: (s: FontScale) => void;
  increaseFont: () => void;
  decreaseFont: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const THEME_KEY = "app.theme";
const FONT_KEY = "app.fontScale";

function readTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "light";
}

function readFontScale(): FontScale {
  const stored = Number(localStorage.getItem(FONT_KEY));
  return (FONT_SCALES as readonly number[]).includes(stored) ? (stored as FontScale) : 1;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);
  const [fontScale, setFontScaleState] = useState<FontScale>(readFontScale);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(fontScale * 100)}%`;
    localStorage.setItem(FONT_KEY, String(fontScale));
  }, [fontScale]);

  const shift = (delta: number) => {
    const index = FONT_SCALES.indexOf(fontScale);
    const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, index + delta))];
    setFontScaleState(next);
  };

  return (
    <AppearanceContext.Provider
      value={{
        theme,
        setTheme: setThemeState,
        toggleTheme: () => setThemeState(theme === "dark" ? "light" : "dark"),
        fontScale,
        setFontScale: setFontScaleState,
        increaseFont: () => shift(1),
        decreaseFont: () => shift(-1),
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance deve ser usado dentro de AppearanceProvider");
  return ctx;
}
