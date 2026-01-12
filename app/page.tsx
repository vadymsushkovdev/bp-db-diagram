"use client";

import { useMemo, useState } from "react";

import { useThemeMode } from "@/app/hooks/useThemeMode";
import { DEFAULT_SQL } from "@/app/constants";
import { useAppThemeStyles } from "@/app/hooks/useAppThemeStyles";
import { SqlSidebar } from "@/app/sections/SqlSidebar/SqlSidebar";
import { TablesSidebar } from "@/app/sections/TablesSidebar/TablesSidebar";
import { DiagramPanel } from "@/app/sections/DiagramPanel/DiagramPanel";
import { useDiagrams } from "@/app/hooks/useDiagrams";
import { useDragResize } from "@/app/hooks/useDragResize";
import { useBlueprint } from "@/app/hooks/useBlueprint";

export default function HomePage() {
  const [sql, setSql] = useState(DEFAULT_SQL);

  const [leftWidth, setLeftWidth] = useState(30);
  const [rightWidth, setRightWidth] = useState(25);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const [viewportSnapshot, setViewportSnapshot] = useState({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const { themeMode, setThemeMode, resolvedTheme } = useThemeMode();
  const { cssVars, edgeColor } = useAppThemeStyles(resolvedTheme);

  const { graph, nodes, edges, updateNodes, positionsRef, viewportRef } =
    useDiagrams(sql, edgeColor);

  const { startLeftDrag, startRightDrag } = useDragResize(
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
  );
  const { exportBp, importBp } = useBlueprint({
    sql,
    setSql,
    nodes,
    leftWidth,
    positionsRef,
    viewportRef,
    setViewportSnapshot,
  });

  const tablesSorted = useMemo(
    () => [...graph.tables].map((t) => t.name).sort(),
    [graph.tables],
  );

  const middleWidth = useMemo(
    () => 100 - (leftOpen ? leftWidth : 0) - (rightOpen ? rightWidth : 0),
    [leftOpen, rightOpen, leftWidth, rightWidth],
  );

  return (
    <div
      style={{ display: "flex", width: "100vw", height: "100vh", ...cssVars }}
    >
      <SqlSidebar
        open={leftOpen}
        setOpen={setLeftOpen}
        widthPct={leftWidth}
        sql={sql}
        resolvedTheme={resolvedTheme}
        themeMode={themeMode}
        onSqlChange={setSql}
        onThemeChange={setThemeMode}
        onImport={importBp}
        onExport={exportBp}
        onResizeStart={startLeftDrag}
      />

      <DiagramPanel
        widthPct={middleWidth}
        theme={resolvedTheme}
        nodes={nodes}
        edges={edges}
        edgeColor={edgeColor}
        initialViewport={viewportSnapshot}
        focusNodeId={focusNodeId}
        focusNonce={focusNonce}
        onViewportChange={(vp) => (viewportRef.current = vp)}
        onNodesChange={updateNodes}
      />

      <TablesSidebar
        open={rightOpen}
        setOpen={setRightOpen}
        widthPct={rightWidth}
        tables={tablesSorted}
        onResizeStart={startRightDrag}
        onSelectTable={(name) => {
          setFocusNodeId(name);
          setFocusNonce((n) => n + 1);
        }}
      />
    </div>
  );
}
