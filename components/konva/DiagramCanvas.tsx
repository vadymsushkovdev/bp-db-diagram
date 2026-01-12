"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Text, Rect } from "react-konva";
import type Konva from "konva";
import { select } from "d3-selection";
import type { Selection } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";

import TableNodeKonva, {
  TABLE_CARD,
  TABLE_LAYOUT,
  estimateTableHeight,
  estimateTableWidth,
} from "@/components/konva/TableNodeKonva";
import EnumNodeKonva, {
  ENUM_CARD,
  estimateEnumHeight,
  estimateEnumWidth,
} from "@/components/konva/EnumNodeKonva";

export type DiagramNodeModel =
  | { id: string; kind: "table"; x: number; y: number; data: any }
  | { id: string; kind: "enum"; x: number; y: number; data: any };

export type DiagramEdgeModel = {
  id: string;
  source: string;
  target: string;
  sourceColumn?: string;
  targetColumn?: string;
  label?: string;
  stroke: string;
  animated?: boolean;
};

export type Viewport = { x: number; y: number; zoom: number };

type TableLike = {
  columns?: { name: string }[];
};

type D3Selection = Selection<Element, unknown, null, undefined>;

type Props = {
  theme: "light" | "dark";
  nodes: DiagramNodeModel[];
  edges: DiagramEdgeModel[];
  edgeColor: string;
  initialViewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
  onNodesChange: (nodes: DiagramNodeModel[]) => void;

  focusNodeId?: string | null;
  focusNonce?: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const GRID_BG = 24;

// Router
const ROUTE_GRID = 24;
const ROUTE_PAD = 260;
const OBSTACLE_PAD = 14;
const ENDPOINT_PAD = 4; // smaller pad for source/target to avoid start/end nudging
const ROUTE_MAX_ITERS = 40_000;

function makeGridLines(width: number, height: number) {
  const lines: number[][] = [];
  for (let x = 0; x <= width; x += GRID_BG) lines.push([x, 0, x, height]);
  for (let y = 0; y <= height; y += GRID_BG) lines.push([0, y, width, y]);
  return lines;
}

const isInsideNode = (stage: Konva.Stage, pos: { x: number; y: number }) => {
  const shape = stage.getIntersection(pos);
  if (!shape) return false;
  const group = shape.findAncestor(".node", true);
  return !!group;
};

function tableAnchorY(table: TableLike, columnName?: string) {
  const cols: { name: string }[] = table?.columns ?? [];
  const { headerH, padding, rowH } = TABLE_LAYOUT;

  const count = Math.max(1, cols.length);
  const idx =
    columnName != null
      ? Math.max(
          0,
          cols.findIndex((c) => c.name === columnName),
        )
      : Math.floor(count / 2);

  const clampedIdx = Math.min(idx < 0 ? 0 : idx, count - 1);
  const rowTop = headerH + padding + clampedIdx * rowH;

  // ✅ center of the row (matches icon/pill centering)
  return rowTop + rowH / 2;
}

// ----- Obstacles + routing -----
type AARect = { x: number; y: number; w: number; h: number };

const inflateRect = (r: AARect, pad: number): AARect => ({
  x: r.x - pad,
  y: r.y - pad,
  w: r.w + pad * 2,
  h: r.h + pad * 2,
});

const pointInRect = (x: number, y: number, r: AARect) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const snap = (v: number, step: number) => Math.round(v / step) * step;

const compressOrthogonal = (pts: number[]) => {
  if (pts.length <= 4) return pts;

  const out: number[] = [pts[0]!, pts[1]!];
  for (let i = 2; i < pts.length; i += 2) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    const ox = out[out.length - 2]!;
    const oy = out[out.length - 1]!;

    if (x === ox && y === oy) continue;

    if (out.length >= 4) {
      const px = out[out.length - 4]!;
      const py = out[out.length - 3]!;
      const collinear = (px === ox && ox === x) || (py === oy && oy === y);
      if (collinear) {
        out[out.length - 2] = x;
        out[out.length - 1] = y;
        continue;
      }
    }

    out.push(x, y);
  }
  return out;
};

// ✅ ensures no diagonal at first/last segment after we set exact endpoint coordinates
const enforceRightAngleEndpoints = (pts: number[]) => {
  if (pts.length < 8) return pts;

  const out = [...pts];

  // start
  const sx = out[0]!;
  const sy = out[1]!;
  const nx = out[2]!;
  const ny = out[3]!;
  if (sx !== nx && sy !== ny) {
    // insert corner after start (prefer horizontal-first for left/right handles)
    out.splice(2, 0, nx, sy);
  }

  // end
  const n = out.length;
  const ex = out[n - 2]!;
  const ey = out[n - 1]!;
  const px = out[n - 4]!;
  const py = out[n - 3]!;
  if (ex !== px && ey !== py) {
    // insert corner before end (prefer horizontal-last into target)
    out.splice(n - 2, 0, px, ey);
  }

  return compressOrthogonal(out);
};

type Cell = { x: number; y: number };
const keyOf = (c: Cell) => `${c.x},${c.y}`;
const manhattan = (a: Cell, b: Cell) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const nodeRect = (n: DiagramNodeModel): AARect => {
  const w =
    n.kind === "table"
      ? estimateTableWidth(n.data?.table)
      : estimateEnumWidth(n.data?.enum);

  const h =
    n.kind === "table"
      ? estimateTableHeight(n.data?.table)
      : estimateEnumHeight(n.data?.enum);

  return { x: n.x, y: n.y, w, h };
};

const buildObstaclesForEdge = (
  nodes: DiagramNodeModel[],
  sourceId: string,
  targetId: string,
) => {
  return nodes.map((n) => {
    const pad =
      n.id === sourceId || n.id === targetId ? ENDPOINT_PAD : OBSTACLE_PAD;
    return inflateRect(nodeRect(n), pad);
  });
};

const isBlocked = (x: number, y: number, obstacles: AARect[]) =>
  obstacles.some((r) => pointInRect(x, y, r));

function routeManhattanAStar(
  startWorld: { x: number; y: number },
  endWorld: { x: number; y: number },
  obstacles: AARect[],
  step: number,
): number[] | null {
  const start: Cell = {
    x: snap(startWorld.x, step),
    y: snap(startWorld.y, step),
  };
  const goal: Cell = { x: snap(endWorld.x, step), y: snap(endWorld.y, step) };

  const minX =
    Math.min(start.x, goal.x, ...obstacles.map((r) => r.x)) - ROUTE_PAD;
  const minY =
    Math.min(start.y, goal.y, ...obstacles.map((r) => r.y)) - ROUTE_PAD;
  const maxX =
    Math.max(start.x, goal.x, ...obstacles.map((r) => r.x + r.w)) + ROUTE_PAD;
  const maxY =
    Math.max(start.y, goal.y, ...obstacles.map((r) => r.y + r.h)) + ROUTE_PAD;

  const inBounds = (c: Cell) =>
    c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY;

  const nudgeOut = (c: Cell): Cell => {
    if (!isBlocked(c.x, c.y, obstacles)) return c;
    const candidates: Cell[] = [
      { x: c.x + step, y: c.y },
      { x: c.x - step, y: c.y },
      { x: c.x, y: c.y + step },
      { x: c.x, y: c.y - step },
      { x: c.x + step * 2, y: c.y },
      { x: c.x - step * 2, y: c.y },
    ];
    const ok = candidates.find(
      (k) => inBounds(k) && !isBlocked(k.x, k.y, obstacles),
    );
    return ok ?? c;
  };

  const s = nudgeOut(start);
  const g = nudgeOut(goal);

  const open: Cell[] = [s];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const sKey = keyOf(s);
  const gKey = keyOf(g);

  gScore.set(sKey, 0);
  fScore.set(sKey, manhattan(s, g));

  const neighbors = (c: Cell): Cell[] => [
    { x: c.x + step, y: c.y },
    { x: c.x - step, y: c.y },
    { x: c.x, y: c.y + step },
    { x: c.x, y: c.y - step },
  ];

  const bestIndex = () => {
    let best = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const k = keyOf(open[i]!);
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        best = i;
      }
    }
    return best;
  };

  let iters = 0;
  while (open.length && iters < ROUTE_MAX_ITERS) {
    iters += 1;

    const idx = bestIndex();
    const current = open[idx]!;
    open.splice(idx, 1);

    const cKey = keyOf(current);
    if (cKey === gKey) {
      const path: Cell[] = [current];
      let k = cKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k)!;
        const [x, y] = prev.split(",").map(Number);
        path.push({ x, y });
        k = prev;
      }
      path.reverse();

      const pts: number[] = [];
      for (const p of path) pts.push(p.x, p.y);

      // exact endpoints (these may introduce diagonals -> fixed later)
      pts[0] = startWorld.x;
      pts[1] = startWorld.y;
      pts[pts.length - 2] = endWorld.x;
      pts[pts.length - 1] = endWorld.y;

      return compressOrthogonal(pts);
    }

    for (const nb of neighbors(current)) {
      if (!inBounds(nb)) continue;
      if (isBlocked(nb.x, nb.y, obstacles)) continue;

      const nbKey = keyOf(nb);
      const tentative = (gScore.get(cKey) ?? Infinity) + 1;

      if (tentative < (gScore.get(nbKey) ?? Infinity)) {
        cameFrom.set(nbKey, cKey);
        gScore.set(nbKey, tentative);
        fScore.set(nbKey, tentative + manhattan(nb, g));

        if (!open.some((o) => o.x === nb.x && o.y === nb.y)) open.push(nb);
      }
    }
  }

  return null;
}

// ----- Label and arrowhead helpers -----
function longestSegmentMidpoint(points: number[]) {
  let bestLen2 = -1;
  let best = { x: points[0]!, y: points[1]!, x2: points[2]!, y2: points[3]! };

  for (let i = 0; i < points.length - 2; i += 2) {
    const x1 = points[i]!;
    const y1 = points[i + 1]!;
    const x2 = points[i + 2]!;
    const y2 = points[i + 3]!;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 > bestLen2) {
      bestLen2 = len2;
      best = { x: x1, y: y1, x2, y2 };
    }
  }

  return {
    midX: (best.x + best.x2) / 2,
    midY: (best.y + best.y2) / 2,
    seg: best,
  };
}

function arrowHeadPoints(points: number[], size = 10, spread = 6) {
  const n = points.length;
  if (n < 4) return null;

  const x2 = points[n - 2]!;
  const y2 = points[n - 1]!;
  const x1 = points[n - 4]!;
  const y1 = points[n - 3]!;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return null;

  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;

  const px = -uy;
  const py = ux;

  const ax = x2 - ux * size + px * spread;
  const ay = y2 - uy * size + py * spread;
  const bx = x2 - ux * size - px * spread;
  const by = y2 - uy * size - py * spread;

  return [ax, ay, x2, y2, bx, by];
}

export default function DiagramCanvas({
  theme,
  nodes,
  edges,
  initialViewport,
  onViewportChange,
  onNodesChange,
  focusNodeId,
  focusNonce,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });

  const nodesById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const missingFkByTableId = useMemo(() => {
    const by = new Map<string, string[]>();

    // Edge lookup: we consider an FK "resolved" if there is an edge whose
    // source is the table and sourceColumn matches the FK field.
    const edgeKey = new Set(
      edges.map((e) => `${e.source}::${(e.sourceColumn ?? "").toLowerCase()}`),
    );

    for (const n of nodes) {
      if (n.kind !== "table") continue;

      const table = n.data?.table;
      const cols = (table?.columns ?? []) as {
        name: string;
        isForeignKey?: boolean;
      }[];

      const missing = cols
        .filter((c) => !!c.isForeignKey)
        .filter((c) => !edgeKey.has(`${n.id}::${c.name.toLowerCase()}`))
        .map((c) => c.name);

      by.set(n.id, missing);
    }

    return by;
  }, [nodes, edges]);

  const gridLines = useMemo(
    () => makeGridLines(size.w * 2, size.h * 2),
    [size.w, size.h],
  );

  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const zoomRef = useRef<ZoomBehavior<Element, unknown> | null>(null);
  const d3SelRef = useRef<D3Selection | null>(null);
  const viewportRef = useRef<Viewport>(initialViewport);

  const isNodeDraggingRef = useRef(false);
  const [, forceRender] = useState(0);

  const setNodeDragging = (v: boolean) => {
    isNodeDraggingRef.current = v;
    forceRender((x) => x + 1);
  };

  const applyViewport = (vp: Viewport) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x: vp.x, y: vp.y });
    stage.scale({ x: vp.zoom, y: vp.zoom });
    stage.batchDraw();
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      const rect = containerRef.current!.getBoundingClientRect();
      setSize({ w: Math.max(200, rect.width), h: Math.max(200, rect.height) });
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cancel = () => {
      const stage = stageRef.current;
      if (!stage) return;
      stage.stopDrag();
      isNodeDraggingRef.current = false;
      forceRender((x) => x + 1);
    };

    window.addEventListener("mouseup", cancel, true);
    window.addEventListener("pointerup", cancel, true);
    window.addEventListener("touchend", cancel, true);
    window.addEventListener("blur", cancel, true);

    return () => {
      window.removeEventListener("mouseup", cancel, true);
      window.removeEventListener("pointerup", cancel, true);
      window.removeEventListener("touchend", cancel, true);
      window.removeEventListener("blur", cancel, true);
    };
  }, []);

  // D3 zoom init
  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const sel = select(el);
    d3SelRef.current = sel as any;

    viewportRef.current = initialViewport;
    applyViewport(initialViewport);

    const z = zoom<Element, unknown>()
      .scaleExtent([0.2, 2.5])
      .filter((event: any) => {
        if (event.type === "wheel") {
          const isZoomGesture = !!event.ctrlKey || !!event.metaKey;
          return isZoomGesture && !isNodeDraggingRef.current;
        }

        if (isNodeDraggingRef.current) return false;

        if (event.type === "mousedown") {
          const stage = stageRef.current;
          if (!stage) return true;
          const pos = stage.getPointerPosition();
          if (!pos) return true;
          return !isInsideNode(stage, pos);
        }

        return event.type === "mousemove";
      })
      .on("zoom", (event) => {
        const t = event.transform;
        const vp: Viewport = { x: t.x, y: t.y, zoom: t.k };
        viewportRef.current = vp;
        applyViewport(vp);
        onViewportChangeRef.current(vp);
      });

    zoomRef.current = z;
    sel.call(z as any);

    const t0 = zoomIdentity
      .translate(initialViewport.x, initialViewport.y)
      .scale(initialViewport.zoom);
    sel.call((z as any).transform, t0);

    return () => {
      sel.on(".zoom", null);
    };
  }, [initialViewport.x, initialViewport.y, initialViewport.zoom]);

  // Wheel/trackpad scroll = pan (no scrollbars)
  useEffect(() => {
    const el = containerRef.current;
    const sel = d3SelRef.current;
    const z = zoomRef.current;
    if (!el || !sel || !z) return;

    const onWheel = (e: WheelEvent) => {
      if (isNodeDraggingRef.current) return;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return;
      }

      e.preventDefault();

      const cur = viewportRef.current;
      const nx = cur.x - e.deltaX;
      const ny = cur.y - e.deltaY;

      const t = zoomIdentity.translate(nx, ny).scale(cur.zoom);
      sel.call((z as any).transform, t);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, []);

  // focus/center
  useEffect(() => {
    const sel = d3SelRef.current;
    const z = zoomRef.current;
    if (!sel || !z) return;
    if (!focusNodeId) return;

    const n = nodesRef.current.find((x) => x.id === focusNodeId);
    if (!n) return;

    const k = viewportRef.current.zoom;

    const w =
      n.kind === "table"
        ? estimateTableWidth(n.data?.table)
        : estimateEnumWidth(n.data?.enum);

    const h =
      n.kind === "table"
        ? estimateTableHeight(n.data?.table)
        : estimateEnumHeight(n.data?.enum);

    const worldCx = n.x + w / 2;
    const worldCy = n.y + h / 2;

    const screenCx = size.w / 2;
    const screenCy = size.h / 2;

    const nx = screenCx - worldCx * k;
    const ny = screenCy - worldCy * k;

    const t = zoomIdentity.translate(nx, ny).scale(k);
    sel.call((z as any).transform, t);
  }, [focusNonce, focusNodeId, size.w, size.h]);

  const zoomTo = (nextZoom: number) => {
    const sel = d3SelRef.current;
    const z = zoomRef.current;
    if (!sel || !z) return;

    const cur = viewportRef.current;
    const k0 = cur.zoom;
    const k1 = clamp(nextZoom, 0.2, 2.5);

    const cx = size.w / 2;
    const cy = size.h / 2;

    const wx = (cx - cur.x) / k0;
    const wy = (cy - cur.y) / k0;

    const nx = cx - wx * k1;
    const ny = cy - wy * k1;

    const t = zoomIdentity.translate(nx, ny).scale(k1);
    sel.call((z as any).transform, t);
  };

  const resetView = () => {
    const sel = d3SelRef.current;
    const z = zoomRef.current;
    if (!sel || !z) return;
    const t = zoomIdentity.translate(0, 0).scale(1);
    sel.call((z as any).transform, t);
  };

  // ✅ routing + correct anchor side + correct labels + arrow direction + hard 90° at endpoints
  const edgePaths = useMemo(() => {
    return edges
      .map((e) => {
        const a = nodesById.get(e.source);
        const b = nodesById.get(e.target);
        if (!a || !b) return null;

        const aRect = nodeRect(a);
        const bRect = nodeRect(b);

        const aCx = aRect.x + aRect.w / 2;
        const bCx = bRect.x + bRect.w / 2;

        const exitRight = bCx >= aCx;
        const enterLeft = exitRight;

        const start = {
          x: exitRight ? aRect.x + aRect.w : aRect.x,
          y:
            a.kind === "table"
              ? aRect.y + tableAnchorY(a.data?.table, e.sourceColumn)
              : aRect.y + aRect.h / 2,
        };

        const end = {
          x: enterLeft ? bRect.x : bRect.x + bRect.w,
          y:
            b.kind === "table"
              ? bRect.y + tableAnchorY(b.data?.table, e.targetColumn)
              : bRect.y + bRect.h / 2,
        };

        const obstacles = buildObstaclesForEdge(nodes, e.source, e.target);

        const ptsRaw =
          routeManhattanAStar(start, end, obstacles, ROUTE_GRID) ??
          compressOrthogonal([
            start.x,
            start.y,
            (start.x + end.x) / 2,
            start.y,
            (start.x + end.x) / 2,
            end.y,
            end.x,
            end.y,
          ]);

        const pts = enforceRightAngleEndpoints(ptsRaw);

        const { midX, midY, seg } = longestSegmentMidpoint(pts);

        const segDx = seg.x2 - seg.x;
        const segDy = seg.y2 - seg.y;
        const segLen = Math.sqrt(segDx * segDx + segDy * segDy) || 1;
        const nx = -segDy / segLen;
        const ny = segDx / segLen;

        const labelPos = { x: midX + nx * 10, y: midY + ny * 10 };

        const head = arrowHeadPoints(pts, 10, 6);

        return {
          id: e.id,
          stroke: e.stroke,
          points: pts,
          label: e.label ?? "",
          labelPos,
          animated: !!e.animated,
          arrowHead: head,
        };
      })
      .filter(Boolean) as {
      id: string;
      stroke: string;
      points: number[];
      label: string;
      labelPos: { x: number; y: number };
      animated: boolean;
      arrowHead: number[] | null;
    }[];
  }, [edges, nodesById, nodes]);

  const [dashOffset, setDashOffset] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setDashOffset((v) => (v - 1) % 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const controlBtnStyle: React.CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid var(--panel-border)",
    background: "var(--panel-bg)",
    color: "var(--text)",
    cursor: "pointer",
    boxShadow:
      theme === "dark"
        ? "0 8px 30px rgba(0,0,0,0.35)"
        : "0 8px 30px rgba(0,0,0,0.08)",
    userSelect: "none",
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "var(--rf-bg)",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 5,
          right: 12,
          top: 12,
          display: "grid",
          gap: 8,
        }}
      >
        <button
          type="button"
          style={controlBtnStyle}
          onClick={() => zoomTo(viewportRef.current.zoom * 1.1)}
        >
          +
        </button>
        <button
          type="button"
          style={controlBtnStyle}
          onClick={() => zoomTo(viewportRef.current.zoom / 1.1)}
        >
          -
        </button>
        <button type="button" style={controlBtnStyle} onClick={resetView}>
          Reset
        </button>
      </div>

      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        style={{ background: "transparent" }}
      >
        <Layer listening={false}>
          {gridLines.map((p, i) => (
            <Line
              key={i}
              points={p}
              stroke={
                theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
              }
              strokeWidth={1}
            />
          ))}
        </Layer>

        {/* edges under nodes */}
        <Layer listening={false}>
          {edgePaths.map((e) => (
            <React.Fragment key={e.id}>
              <Line
                points={e.points}
                stroke={e.stroke}
                strokeWidth={2}
                lineCap="butt"
                lineJoin="miter"
                dash={e.animated ? [10, 10] : undefined}
                dashOffset={e.animated ? dashOffset : 0}
              />

              {e.arrowHead ? (
                <Line
                  points={e.arrowHead}
                  stroke={e.stroke}
                  strokeWidth={2}
                  lineCap="butt"
                  lineJoin="miter"
                />
              ) : null}

              {e.label ? (
                <>
                  <Rect
                    x={e.labelPos.x - 4}
                    y={e.labelPos.y - 2}
                    width={Math.min(240, Math.max(80, e.label.length * 7))}
                    height={18}
                    fill={
                      theme === "dark"
                        ? "rgba(17,17,17,0.9)"
                        : "rgba(255,255,255,0.92)"
                    }
                    stroke={
                      theme === "dark"
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.08)"
                    }
                    cornerRadius={8}
                  />
                  <Text
                    x={e.labelPos.x}
                    y={e.labelPos.y}
                    text={e.label}
                    fontSize={12}
                    fill={
                      theme === "dark"
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(0,0,0,0.75)"
                    }
                  />
                </>
              ) : null}
            </React.Fragment>
          ))}
        </Layer>

        <Layer>
          {nodes.map((n) =>
            n.kind === "table" ? (
              <TableNodeKonva
                key={n.id}
                id={n.id}
                x={n.x}
                missingFkColumns={missingFkByTableId.get(n.id) ?? []}
                y={n.y}
                table={n.data.table}
                onDragStateChange={setNodeDragging}
                theme={theme}
                onMove={(pos) => {
                  onNodesChange(
                    nodes.map((nn) =>
                      nn.id === n.id ? { ...nn, x: pos.x, y: pos.y } : nn,
                    ),
                  );
                }}
              />
            ) : (
              <EnumNodeKonva
                key={n.id}
                id={n.id}
                x={n.x}
                y={n.y}
                enumDef={n.data.enum}
                onDragStateChange={setNodeDragging}
                theme={theme}
                onMove={(pos) => {
                  onNodesChange(
                    nodes.map((nn) =>
                      nn.id === n.id ? { ...nn, x: pos.x, y: pos.y } : nn,
                    ),
                  );
                }}
              />
            ),
          )}
        </Layer>
      </Stage>
    </div>
  );
}
