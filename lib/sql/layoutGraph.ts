import dagre from 'dagre';
import type { Edge, Node } from 'reactflow';
import { estimateTableHeight, estimateTableWidth } from '@/components/konva/TableNodeKonva';
import { estimateEnumHeight, estimateEnumWidth } from '@/components/konva/EnumNodeKonva';

type Options = {
    keepExistingPositions: boolean;
    existingPositions: Map<string, { x: number; y: number }>;
};

export function layoutGraph(nodes: Node[], edges: Edge[], options: Options) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));

    g.setGraph({
        rankdir: 'LR',
        nodesep: 60,
        ranksep: 120,
    });

    for (const n of nodes) {
        if (n.type === 'table') {
            g.setNode(n.id, {
                width: estimateTableWidth(n.data.table),
                height: estimateTableHeight(n.data.table),
            });
        } else {
            g.setNode(n.id, {
                width: estimateEnumWidth(n.data.enum),
                height: estimateEnumHeight(n.data.enum),
            });
        }
    }

    for (const e of edges) g.setEdge(e.source, e.target);

    dagre.layout(g);

    const laidOutNodes = nodes.map((n) => {
        if (options.keepExistingPositions && options.existingPositions.has(n.id)) return n;
        const p = g.node(n.id);
        return {
            ...n,
            position: { x: p.x - p.width / 2, y: p.y - p.height / 2 },
        };
    });

    return { nodes: laidOutNodes, edges };
}
