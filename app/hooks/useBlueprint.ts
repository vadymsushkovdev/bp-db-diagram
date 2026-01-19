import { DiagramNodeModel } from "@/components/konva/DiagramCanvas";

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

export function useBlueprint({
  sql,
  setSql,
  nodes,
  leftWidth,
  positionsRef,
  viewportRef,
  setViewportSnapshot,
}: {
  sql: string;
  setSql: (v: string) => void;
  nodes: DiagramNodeModel[];
  leftWidth: number;
  positionsRef: React.MutableRefObject<Map<string, { x: number; y: number }>>;
  viewportRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>;
  setViewportSnapshot: (vp: { x: number; y: number; zoom: number }) => void;
}) {
  const exportBp = () => {
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of nodes) pos.set(n.id, { x: n.x, y: n.y });

    const payload = {
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
    if (!data.version || !data.sql || !data.leftWidth || !data.positions) {
      alert("Invalid .bp file");
      return;
    }

    positionsRef.current = recordToMap(data.positions);
    if (data.viewport) {
      viewportRef.current = data.viewport;
      setViewportSnapshot(viewportRef.current);
    }
    setSql(data.sql);
  };

  return { exportBp, importBp };
}
