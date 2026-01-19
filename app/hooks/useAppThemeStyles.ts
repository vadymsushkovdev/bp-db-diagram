import { useEffect, useMemo } from "react";
import { ResolvedTheme } from "./useThemeMode";

export function useAppThemeStyles(resolvedTheme: ResolvedTheme) {
  const cssVars = useMemo<React.CSSProperties>(() => {
    const dark = resolvedTheme === "dark";

    return {
      ...(dark
        ? {
            "--app-bg": "#0b0b0b",
            "--panel-bg": "#111",
            "--panel-header-bg": "#171717",
            "--panel-border": "#2b2b2b",
            "--muted-border": "#222",
            "--chip-bg": "#0f0f0f",
            "--text": "#ffffff",
            "--text-muted": "rgba(255,255,255,0.7)",
            "--btn-bg": "#121212",
            "--btn-border": "#2b2b2b",
            "--splitter-bg": "#0f0f0f",
            "--edge": "#E5E7EB",
            "--rf-bg": "#0b0b0b",
          }
        : {
            "--app-bg": "#ffffff",
            "--panel-bg": "#ffffff",
            "--panel-header-bg": "#f4f4f5",
            "--panel-border": "#e4e4e7",
            "--muted-border": "#e4e4e7",
            "--chip-bg": "#fafafa",
            "--text": "#0b0b0b",
            "--text-muted": "rgba(0,0,0,0.65)",
            "--btn-bg": "#ffffff",
            "--btn-border": "#d4d4d8",
            "--splitter-bg": "#f4f4f5",
            "--edge": "#334155",
            "--rf-bg": "#ffffff",
          }),
      background: "var(--app-bg)",
      color: "var(--text)",
    };
  }, [resolvedTheme]);

  useEffect(() => {
    document.body.style.background =
      resolvedTheme === "dark" ? "#0b0b0b" : "#ffffff";
    document.body.style.color =
      resolvedTheme === "dark" ? "#ffffff" : "#0b0b0b";
  }, [resolvedTheme]);

  const edgeColor = resolvedTheme === "dark" ? "#E5E7EB" : "#334155";

  return { cssVars, edgeColor };
}
