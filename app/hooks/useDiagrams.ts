import { useEffect, useMemo, useRef, useState } from "react";
import { parseSqlToGraph, SqlGraph } from "@/lib/sql/parseSqlToGraph";
import { layoutGraph } from "@/lib/sql/layoutGraph";
import {
  DiagramNodeModel,
  DiagramEdgeModel,
} from "@/components/konva/DiagramCanvas";

export function useDiagrams(sql: string, edgeColor: string) {
  const graph: SqlGraph = useMemo(() => parseSqlToGraph(sql), [sql]);

  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });

  const [nodes, setNodes] = useState<DiagramNodeModel[]>([]);
  const [edges, setEdges] = useState<DiagramEdgeModel[]>([]);

  useEffect(() => {
    const prev = positionsRef.current;

    const baseNodes: DiagramNodeModel[] = [
      ...graph.tables.map(
        (t): DiagramNodeModel => ({
          id: t.name,
          kind: "table",
          x: prev.get(t.name)?.x ?? 0,
          y: prev.get(t.name)?.y ?? 0,
          data: { table: t },
        }),
      ),
      ...graph.enums.map((e, i): DiagramNodeModel => {
        const id = `enum:${e.name}`;
        return {
          id,
          kind: "enum",
          x: prev.get(id)?.x ?? 600 + i * 40,
          y: prev.get(id)?.y ?? 40 + i * 40,
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

    setNodes(
      laidOutNodes.map((n) => ({
        id: n.id,
        kind: n.type as "table" | "enum",
        x: n.position.x,
        y: n.position.y,
        data: n.data,
      })),
    );

    setEdges(
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

  const updateNodes = (next: DiagramNodeModel[]) => {
    setNodes(next);
    for (const n of next) {
      positionsRef.current.set(n.id, { x: n.x, y: n.y });
    }
  };

  return {
    graph,
    nodes,
    edges,
    updateNodes,
    positionsRef,
    viewportRef,
  };
}
