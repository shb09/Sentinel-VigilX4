import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "aurora" | "obsidian";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "aurora",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("sentinel-theme") as Theme) || "aurora"
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sentinel-theme", theme);
  }, [theme]);
  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "aurora" ? "obsidian" : "aurora")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
