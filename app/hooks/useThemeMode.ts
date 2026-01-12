"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export const THEME_STORAGE_KEY = "blueprint_theme_mode_v1";

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("dark");

  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(mq.matches ? "dark" : "light");

    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(THEME_STORAGE_KEY);
      if (v === "system" || v === "light" || v === "dark") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeMode(v);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {}
  }, [themeMode]);

  return { themeMode, setThemeMode, resolvedTheme };
}
