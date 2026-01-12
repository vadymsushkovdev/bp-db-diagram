"use client";

import { useMemo, useState } from "react";
import { styles } from "@/app/sections/TablesSidebar/TablesSidebar.styles";

type TablesSidebarProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  widthPct: number;
  tables: string[];

  onResizeStart: (clientX: number) => void;
  onSelectTable: (tableName: string) => void;
};

export function TablesSidebar({
  open,
  setOpen,
  widthPct,
  tables,
  onResizeStart,
  onSelectTable,
}: TablesSidebarProps) {
  const [query, setQuery] = useState("");

  const filteredTables = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.toLowerCase().includes(q));
  }, [query, tables]);

  return (
    <>
      {open ? (
        <>
          <div
            onMouseDown={(e) => onResizeStart(e.clientX)}
            style={styles.splitter}
          />

          <div style={{ ...styles.sidebar, width: `${widthPct}%` }}>
            <div style={styles.header}>
              <span>Tables</span>
              <button onClick={() => setOpen(false)} style={styles.button}>
                X
              </button>
            </div>

            <div style={styles.search}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search table…"
                style={styles.input}
              />
              <div style={styles.counter}>
                {filteredTables.length} / {tables.length}
              </div>
            </div>

            <div style={styles.list}>
              <div style={{ display: "grid", gap: 8 }}>
                {filteredTables.map((name) => (
                  <button
                    key={name}
                    type="button"
                    style={{ ...styles.button, ...styles.tableButton }}
                    onClick={() => onSelectTable(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <button
          style={{ ...styles.button, ...styles.openButtonRight }}
          onClick={() => setOpen(true)}
        >
          Open Table
        </button>
      )}
    </>
  );
}
