"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import { parseSqlToGraph, SqlGraph } from "@/lib/sql/parseSqlToGraph";
import { layoutGraph } from "@/lib/sql/layoutGraph";

import DiagramCanvas, {
  DiagramNodeModel,
  DiagramEdgeModel,
} from "@/components/konva/DiagramCanvas";
import { ThemeMode, useThemeMode } from "@/app/hooks/useThemeMode";
import { DEFAULT_SQL } from "@/app/constants";
import { useAppThemeStyles } from "@/app/hooks/useAppThemeStyles";

type BlueprintFileV1 = {
  version: 1;
  sql: string;
  leftWidth: number;
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
};

const fileNameWithExt = (base: string, ext: string) => {
  const safe = base.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "project"}.${ext}`;
};

const mapToRecord = (m: Map<string, { x: number; y: number }>) => {
  const r: Record<string, { x: number; y: number }> = {};
  for (const [k, v] of m.entries()) r[k] = { x: v.x, y: v.y };
  return r;
};

const recordToMap = (r: Record<string, { x: number; y: number }>) => {
  const m = new Map<string, { x: number; y: number }>();
  for (const [k, v] of Object.entries(r)) m.set(k, { x: v.x, y: v.y });
  return m;
};

export default function HomePage() {
  const [sql, setSql] = useState(DEFAULT_SQL);

  const [leftWidth, setLeftWidth] = useState(30);
  const [rightWidth, setRightWidth] = useState(25);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const dragLeftRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const dragRightRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [viewportSnapshot, setViewportSnapshot] = useState({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const viewportRef = useRef(viewportSnapshot);
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());

  // Right sidebar state
  const [tableQuery, setTableQuery] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const { themeMode, setThemeMode, resolvedTheme } = useThemeMode();
  const { cssVars, edgeColor } = useAppThemeStyles(resolvedTheme);

  const graph: SqlGraph = useMemo(() => parseSqlToGraph(sql), [sql]);

  const [diagramNodes, setDiagramNodes] = useState<DiagramNodeModel[]>([]);
  const [diagramEdges, setDiagramEdges] = useState<DiagramEdgeModel[]>([]);

  useEffect(() => {
    const prev = positionsRef.current;

    const baseNodes: DiagramNodeModel[] = [
      ...graph.tables.map((t): DiagramNodeModel => {
        const prevPos = prev.get(t.name);
        return {
          id: t.name,
          kind: "table",
          x: prevPos?.x ?? 0,
          y: prevPos?.y ?? 0,
          data: { table: t },
        };
      }),
      ...graph.enums.map((e, i): DiagramNodeModel => {
        const id = `enum:${e.name}`;
        const prevPos = prev.get(id);
        return {
          id,
          kind: "enum",
          x: prevPos?.x ?? 600 + i * 40,
          y: prevPos?.y ?? 40 + i * 40,
          data: { enum: e },
        };
      }),
    ];

    const layoutInputNodes = baseNodes.map((n) => ({
      id: n.id,
      position: { x: n.x, y: n.y },
      data: n.data,
      type: n.kind,
    }));

    const layoutInputEdges = graph.relations.map((r, idx) => ({
      id:
        r.id ??
        `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}:${idx}`,
      source: r.fromTable,
      target: r.toTable,
      sourceHandle: `s:${r.fromTable}.${r.fromColumn}`,
      targetHandle: `t:${r.toTable}.${r.toColumn}`,
    }));

    const { nodes: laidOutNodes } = layoutGraph(
      layoutInputNodes,
      layoutInputEdges,
      {
        keepExistingPositions: true,
        existingPositions: prev,
      },
    );

    const laidOut = laidOutNodes.map((n) => ({
      id: n.id,
      kind: n.type as "table" | "enum",
      x: n.position.x,
      y: n.position.y,
      data: n.data,
    })) as DiagramNodeModel[];

    setDiagramNodes(laidOut);

    // carry column names for anchoring
    setDiagramEdges(
      graph.relations.map((r, idx) => ({
        id:
          r.id ??
          `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}:${idx}`,
        source: r.fromTable,
        target: r.toTable,
        sourceColumn: r.fromColumn,
        targetColumn: r.toColumn,
        label: `${r.fromColumn} → ${r.toColumn}`,
        stroke: edgeColor,
        animated: true,
      })),
    );
  }, [graph, edgeColor]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragLeftRef.current) {
        const deltaPx = e.clientX - dragLeftRef.current.startX;
        const deltaPct = (deltaPx / window.innerWidth) * 100;
        const next = Math.min(
          80 - rightWidth,
          Math.max(25, dragLeftRef.current.startWidth + deltaPct),
        );
        setLeftWidth(next);
      }
      if (dragRightRef.current) {
        const deltaPx = dragRightRef.current.startX - e.clientX;
        const deltaPct = (deltaPx / window.innerWidth) * 100;
        const next = Math.min(
          80 - leftWidth,
          Math.max(10, dragRightRef.current.startWidth + deltaPct),
        );
        setRightWidth(next);
      }
    };
    const onMouseUp = () => {
      dragLeftRef.current = null;
      dragRightRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [leftWidth, rightWidth]);

  const exportBp = () => {
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of diagramNodes) pos.set(n.id, { x: n.x, y: n.y });

    const payload: BlueprintFileV1 = {
      version: 1,
      sql,
      leftWidth,
      positions: mapToRecord(pos),
      viewport: viewportRef.current,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = fileNameWithExt("project", "bp");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importBp = async (file: File) => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert("Invalid .bp file (not JSON)");
      return;
    }

    const data = parsed as Partial<BlueprintFileV1>;
    if (
      data.version !== 1 ||
      typeof data.sql !== "string" ||
      typeof data.leftWidth !== "number" ||
      typeof data.positions !== "object" ||
      !data.positions
    ) {
      alert("Invalid .bp file structure");
      return;
    }

    positionsRef.current = recordToMap(data.positions);
    if (
      data.viewport &&
      typeof data.viewport.x === "number" &&
      typeof data.viewport.zoom === "number"
    ) {
      viewportRef.current = {
        x: data.viewport.x,
        y: data.viewport.y,
        zoom: data.viewport.zoom,
      };
      setViewportSnapshot(viewportRef.current);
    }

    // setLeftWidth(Math.min(80, Math.max(20, data.leftWidth)));
    setSql(data.sql);
  };

  const tablesSorted = useMemo(() => {
    const list = graph.tables.map((t) => t.name);
    return list.sort((a, b) => a.localeCompare(b));
  }, [graph.tables]);

  const filteredTables = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    if (!q) return tablesSorted;
    return tablesSorted.filter((name) => name.toLowerCase().includes(q));
  }, [tableQuery, tablesSorted]);

  const sideBtnStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--panel-border)",
    background: "var(--panel-bg)",
    color: "var(--text)",
    cursor: "pointer",
    textAlign: "left",
  };

  const middleWidth =
    100 - (leftOpen ? leftWidth : 0) - (rightOpen ? rightWidth : 0);

  return (
    <div
      style={{ display: "flex", width: "100vw", height: "100vh", ...cssVars }}
    >
      {/* LEFT SIDEBAR */}
      {leftOpen && (
        <div
          style={{
            width: `${leftWidth}%`,
            borderRight: "1px solid var(--panel-border)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: 10,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            <span>SQL</span>
            <div style={{ display: "flex", gap: 5 }}>
              <select
                value={themeMode}
                onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
                style={{
                  height: 32,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid var(--btn-border)",
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--btn-border)",
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                Import
              </button>
              <button
                onClick={exportBp}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--btn-border)",
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                Export
              </button>
              <button
                onClick={() => setLeftOpen(false)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--btn-border)",
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                X
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".bp,application/octet-stream,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void importBp(f);
                }}
              />
            </div>
          </div>
          <MonacoEditor
            language="sql"
            theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
            value={sql}
            onChange={(v) => setSql(v ?? "")}
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
      )}

      {/* LEFT SPLITTER */}
      {leftOpen && (
        <div
          onMouseDown={(e) =>
            (dragLeftRef.current = { startX: e.clientX, startWidth: leftWidth })
          }
          style={{
            width: 6,
            cursor: "col-resize",
            background: "var(--splitter-bg)",
            borderRight: "1px solid var(--panel-border)",
          }}
        />
      )}

      {/* MIDDLE */}
      <div
        style={{
          width: `${middleWidth}%`,
          display: "flex",
          flexDirection: "column",
          background: "var(--app-bg)",
        }}
      >
        <div style={{ padding: 10, fontWeight: 600 }}>Diagram</div>
        <div style={{ flex: 1 }}>
          <DiagramCanvas
            theme={resolvedTheme}
            nodes={diagramNodes}
            edges={diagramEdges}
            edgeColor={edgeColor}
            initialViewport={viewportSnapshot}
            focusNodeId={focusNodeId}
            focusNonce={focusNonce}
            onViewportChange={(vp) => (viewportRef.current = vp)}
            onNodesChange={(next) => {
              setDiagramNodes(next);
              for (const n of next)
                positionsRef.current.set(n.id, { x: n.x, y: n.y });
            }}
          />
        </div>
      </div>

      {/* RIGHT SPLITTER */}
      {rightOpen && (
        <div
          onMouseDown={(e) =>
            (dragRightRef.current = {
              startX: e.clientX,
              startWidth: rightWidth,
            })
          }
          style={{
            width: 6,
            cursor: "col-resize",
            background: "var(--splitter-bg)",
            borderLeft: "1px solid var(--panel-border)",
          }}
        />
      )}

      {/* RIGHT SIDEBAR */}
      {rightOpen && (
        <div
          style={{
            width: `${rightWidth}%`,
            borderLeft: "1px solid var(--panel-border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--panel-bg)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 10,
              borderBottom: "1px solid var(--panel-border)",
              fontWeight: 700,
            }}
          >
            <span>Tables</span>
            <button
              onClick={() => setRightOpen(false)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              X
            </button>
          </div>
          <div
            style={{
              padding: 10,
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            <input
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Search table…"
              style={{
                width: "100%",
                height: 34,
                borderRadius: 10,
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "0 10px",
                outline: "none",
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              {filteredTables.length} / {tablesSorted.length}
            </div>
          </div>
          <div style={{ padding: 10, overflow: "auto", flex: 1 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {filteredTables.map((name) => (
                <button
                  key={name}
                  type="button"
                  style={sideBtnStyle}
                  onClick={() => {
                    setFocusNodeId(name);
                    setFocusNonce((n) => n + 1); // force re-focus even if same table clicked
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OPEN BUTTONS */}
      {!leftOpen && (
        <button
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            zIndex: 10,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--btn-border)",
            background: "var(--btn-bg)",
            color: "var(--text)",
            cursor: "pointer",
          }}
          onClick={() => setLeftOpen(true)}
        >
          Open SQL
        </button>
      )}
      {!rightOpen && (
        <button
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            zIndex: 10,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--btn-border)",
            background: "var(--btn-bg)",
            color: "var(--text)",
            cursor: "pointer",
          }}
          onClick={() => setRightOpen(true)}
        >
          Open Table
        </button>
      )}
    </div>
  );
}
