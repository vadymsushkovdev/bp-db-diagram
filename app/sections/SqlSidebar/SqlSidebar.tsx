"use client";

import { useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { ThemeMode } from "@/app/hooks/useThemeMode";
import { styles } from "@/app/sections/SqlSidebar/SqlSidebar.styles";

type SqlSidebarProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  widthPct: number;

  sql: string;
  resolvedTheme: "light" | "dark";
  themeMode: ThemeMode;

  onSqlChange: (sql: string) => void;
  onThemeChange: (mode: ThemeMode) => void;

  onImport: (file: File) => void;
  onExport: () => void;

  onResizeStart: (clientX: number) => void;
};

export function SqlSidebar({
  open,
  setOpen,
  widthPct,
  sql,
  resolvedTheme,
  themeMode,
  onSqlChange,
  onThemeChange,
  onImport,
  onExport,
  onResizeStart,
}: SqlSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      {open ? (
        <>
          <div style={{ ...styles.sidebar, width: `${widthPct}%` }}>
            <div style={styles.header}>
              <span>SQL</span>
              <div style={{ display: "flex", gap: 5 }}>
                <select
                  value={themeMode}
                  onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
                  style={styles.select}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={styles.button}
                >
                  Import
                </button>
                <button onClick={onExport} style={styles.button}>
                  Export
                </button>
                <button onClick={() => setOpen(false)} style={styles.button}>
                  X
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".bp,application/octet-stream,application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) onImport(file);
                  }}
                />
              </div>
            </div>

            <MonacoEditor
              language="sql"
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
              value={sql}
              onChange={(v) => onSqlChange(v ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineHeight: 18,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                padding: { top: 10, bottom: 10 },
              }}
            />
          </div>

          <div
            onMouseDown={(e) => onResizeStart(e.clientX)}
            style={styles.splitter}
          />
        </>
      ) : (
        <button
          style={{ ...styles.button, ...styles.openButton }}
          onClick={() => setOpen(true)}
        >
          Open SQL
        </button>
      )}
    </>
  );
}
