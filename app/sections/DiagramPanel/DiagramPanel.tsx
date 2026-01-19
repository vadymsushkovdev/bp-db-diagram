"use client";

import DiagramCanvas, {
  DiagramNodeModel,
  DiagramEdgeModel,
} from "@/components/konva/DiagramCanvas";
import { styles } from "@/app/sections/DiagramPanel/DiagramPanel.styles";

type DiagramPanelProps = {
  widthPct: number;
  theme: "light" | "dark";

  nodes: DiagramNodeModel[];
  edges: DiagramEdgeModel[];

  edgeColor: string;

  initialViewport: { x: number; y: number; zoom: number };
  focusNodeId: string | null;
  focusNonce: number;

  onViewportChange: (vp: { x: number; y: number; zoom: number }) => void;
  onNodesChange: (nodes: DiagramNodeModel[]) => void;
};

export function DiagramPanel({
  widthPct,
  theme,
  nodes,
  edges,
  edgeColor,
  initialViewport,
  focusNodeId,
  focusNonce,
  onViewportChange,
  onNodesChange,
}: DiagramPanelProps) {
  return (
    <div style={{ ...styles.container, width: `${widthPct}%` }}>
      <div style={styles.header}>Diagram</div>
      <div style={styles.canvas}>
        <DiagramCanvas
          theme={theme}
          nodes={nodes}
          edges={edges}
          edgeColor={edgeColor}
          initialViewport={initialViewport}
          focusNodeId={focusNodeId}
          focusNonce={focusNonce}
          onViewportChange={onViewportChange}
          onNodesChange={onNodesChange}
        />
      </div>
    </div>
  );
}
