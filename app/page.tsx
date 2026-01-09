'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { parseSqlToGraph, SqlGraph } from '@/lib/sql/parseSqlToGraph';
import { layoutGraph } from '@/lib/sql/layoutGraph';

import DiagramCanvas, {
    DiagramNodeModel,
    DiagramEdgeModel,
} from '@/components/konva/DiagramCanvas';

type BlueprintFileV1 = {
    version: 1;
    sql: string;
    leftWidth: number;
    positions: Record<string, { x: number; y: number }>;
    viewport?: { x: number; y: number; zoom: number };
};

type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'blueprint_theme_mode_v1';

const DEFAULT_SQL = `create table user
(
    id  bigint primary key,
    ame varchar(100)
);

create table content
(
    id         bigint primary key,
    author_id  bigint,
    title      varchar(100),
    created_at timestamp,
    constraint fk_author foreign key (author_id) references user (id)
);

create table view
(
    id             bigint primary key,
    content_id     bigint,
    user_id        bigint,
    total_sec_view int,
    created_at     timestamp,
    constraint fk_content foreign key (content_id) references content (id),
    constraint fk_user foreign key (user_id) references user (id)
);
`;

const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const fileNameWithExt = (base: string, ext: string) => {
    const safe = base.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');
    return `${safe || 'project'}.${ext}`;
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

    const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

    const viewportRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
    const [viewportSnapshot, setViewportSnapshot] = useState(viewportRef.current);

    // ✅ default smaller editor width (was 48)
    const [leftWidth, setLeftWidth] = useState<number>(38);
    const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
    const resolvedTheme: ResolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

    // Right sidebar state
    const [tableQuery, setTableQuery] = useState('');
    const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
    const [focusNonce, setFocusNonce] = useState(0);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
            if (stored === 'system' || stored === 'light' || stored === 'dark') setThemeMode(stored);
        } catch {}
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
        } catch {}
    }, [themeMode]);

    useEffect(() => {
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!mq) return;

        const onChange = () => setSystemTheme(mq.matches ? 'dark' : 'light');
        onChange();

        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onChange);
            return () => mq.removeEventListener('change', onChange);
        }
        mq.addListener(onChange);
        return () => mq.removeListener(onChange);
    }, []);

    const cssVars = useMemo((): React.CSSProperties => {
        const dark = resolvedTheme === 'dark';
        return {
            ...(dark
                ? {
                    ['--app-bg' as any]: '#0b0b0b',
                    ['--panel-bg' as any]: '#111',
                    ['--panel-header-bg' as any]: '#171717',
                    ['--panel-border' as any]: '#2b2b2b',
                    ['--muted-border' as any]: '#222',
                    ['--chip-bg' as any]: '#0f0f0f',
                    ['--text' as any]: '#ffffff',
                    ['--text-muted' as any]: 'rgba(255,255,255,0.7)',
                    ['--btn-bg' as any]: '#121212',
                    ['--btn-border' as any]: '#2b2b2b',
                    ['--splitter-bg' as any]: '#0f0f0f',
                    ['--edge' as any]: '#E5E7EB',
                    ['--rf-bg' as any]: '#0b0b0b',
                }
                : {
                    ['--app-bg' as any]: '#ffffff',
                    ['--panel-bg' as any]: '#ffffff',
                    ['--panel-header-bg' as any]: '#f4f4f5',
                    ['--panel-border' as any]: '#e4e4e7',
                    ['--muted-border' as any]: '#e4e4e7',
                    ['--chip-bg' as any]: '#fafafa',
                    ['--text' as any]: '#0b0b0b',
                    ['--text-muted' as any]: 'rgba(0,0,0,0.65)',
                    ['--btn-bg' as any]: '#ffffff',
                    ['--btn-border' as any]: '#d4d4d8',
                    ['--splitter-bg' as any]: '#f4f4f5',
                    ['--edge' as any]: '#334155',
                    ['--rf-bg' as any]: '#ffffff',
                }),
            background: 'var(--app-bg)',
            color: 'var(--text)',
        };
    }, [resolvedTheme]);

    useEffect(() => {
        document.body.style.background = resolvedTheme === 'dark' ? '#0b0b0b' : '#ffffff';
        document.body.style.color = resolvedTheme === 'dark' ? '#ffffff' : '#0b0b0b';
    }, [resolvedTheme]);

    const edgeColor = useMemo(() => (resolvedTheme === 'dark' ? '#E5E7EB' : '#334155'), [resolvedTheme]);

    const graph: SqlGraph = useMemo(() => parseSqlToGraph(sql), [sql]);

    const [diagramNodes, setDiagramNodes] = useState<DiagramNodeModel[]>([]);
    const [diagramEdges, setDiagramEdges] = useState<DiagramEdgeModel[]>([]);

    useEffect(() => {
        const prev = positionsRef.current;

        const baseNodes: DiagramNodeModel[] = [
            ...graph.tables.map((t) => {
                const prevPos = prev.get(t.name);
                return {
                    id: t.name,
                    kind: 'table',
                    x: prevPos?.x ?? 0,
                    y: prevPos?.y ?? 0,
                    data: { table: t },
                };
            }),
            ...graph.enums.map((e, i) => {
                const id = `enum:${e.name}`;
                const prevPos = prev.get(id);
                return {
                    id,
                    kind: 'enum',
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
            id: r.id ?? `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}:${idx}`,
            source: r.fromTable,
            target: r.toTable,
            sourceHandle: `s:${r.fromTable}.${r.fromColumn}`,
            targetHandle: `t:${r.toTable}.${r.toColumn}`,
        }));

        const { nodes: laidOutNodes } = layoutGraph(layoutInputNodes as any, layoutInputEdges as any, {
            keepExistingPositions: true,
            existingPositions: prev,
        });

        const laidOut = (laidOutNodes as any[]).map((n) => ({
            id: n.id,
            kind: n.type as 'table' | 'enum',
            x: n.position.x,
            y: n.position.y,
            data: n.data,
        })) as DiagramNodeModel[];

        setDiagramNodes(laidOut);

        // carry column names for anchoring
        setDiagramEdges(
            graph.relations.map((r, idx) => ({
                id: r.id ?? `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}:${idx}`,
                source: r.fromTable,
                target: r.toTable,
                sourceColumn: r.fromColumn,
                targetColumn: r.toColumn,
                label: `${r.fromColumn} → ${r.toColumn}`,
                stroke: edgeColor,
                animated: true,
            }))
        );
    }, [graph, edgeColor]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const deltaPx = e.clientX - dragRef.current.startX;
            const deltaPct = (deltaPx / window.innerWidth) * 100;
            const next = Math.min(80, Math.max(20, dragRef.current.startWidth + deltaPct));
            setLeftWidth(next);
        };

        const onUp = () => {
            dragRef.current = null;
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

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

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileNameWithExt('project', 'bp');
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
            alert('Invalid .bp file (not JSON)');
            return;
        }

        const data = parsed as Partial<BlueprintFileV1>;
        if (
            data.version !== 1 ||
            typeof data.sql !== 'string' ||
            typeof data.leftWidth !== 'number' ||
            typeof data.positions !== 'object' ||
            !data.positions
        ) {
            alert('Invalid .bp file structure');
            return;
        }

        positionsRef.current = recordToMap(data.positions);
        if (data.viewport && typeof data.viewport.x === 'number' && typeof data.viewport.zoom === 'number') {
            viewportRef.current = { x: data.viewport.x, y: data.viewport.y, zoom: data.viewport.zoom };
            setViewportSnapshot(viewportRef.current);
        }

        setLeftWidth(Math.min(80, Math.max(20, data.leftWidth)));
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
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid var(--panel-border)',
        background: 'var(--panel-bg)',
        color: 'var(--text)',
        cursor: 'pointer',
        textAlign: 'left',
    };

    return (
        <div style={{ height: '100vh', display: 'flex', ...cssVars }}>
            {/* LEFT: SQL */}
            <div
                style={{
                    width: `${leftWidth}%`,
                    borderRight: '1px solid var(--panel-border)',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div
                    style={{
                        padding: 10,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--panel-border)',
                        background: 'var(--panel-header-bg)',
                    }}
                >
                    <span>SQL</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                            value={themeMode}
                            onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
                            style={{
                                height: 32,
                                padding: '0 10px',
                                borderRadius: 8,
                                border: '1px solid var(--btn-border)',
                                background: 'var(--btn-bg)',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                        >
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: '6px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--btn-border)',
                                background: 'var(--btn-bg)',
                                color: 'var(--text)',
                                cursor: 'pointer',
                            }}
                            type="button"
                        >
                            Import
                        </button>

                        <button
                            onClick={exportBp}
                            style={{
                                padding: '6px 10px',
                                borderRadius: 8,
                                border: '1px solid var(--btn-border)',
                                background: 'var(--btn-bg)',
                                color: 'var(--text)',
                                cursor: 'pointer',
                            }}
                            type="button"
                        >
                            Export
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".bp,application/octet-stream,application/json"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) void importBp(f);
                            }}
                        />
                    </div>
                </div>

                <div style={{ flex: 1 }}>
                    <MonacoEditor
                        language="sql"
                        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
                        value={sql}
                        onChange={(v) => setSql(v ?? '')}
                        options={{
                            minimap: { enabled: false },
                            // ✅ smaller by default (was 14)
                            fontSize: 12,
                            lineHeight: 18,
                            wordWrap: 'on',
                            scrollBeyondLastLine: false,
                            padding: { top: 10, bottom: 10 },
                        }}
                    />
                </div>
            </div>

            {/* splitter */}
            <div
                onMouseDown={(e) => {
                    dragRef.current = { startX: e.clientX, startWidth: leftWidth };
                }}
                style={{
                    width: 6,
                    cursor: 'col-resize',
                    background: 'var(--splitter-bg)',
                    borderRight: '1px solid var(--panel-border)',
                }}
            />

            {/* RIGHT: Diagram + sidebar */}
            <div
                style={{
                    width: `${100 - leftWidth}%`,
                    background: 'var(--rf-bg)',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div
                    style={{
                        padding: 10,
                        fontWeight: 600,
                        display: 'flex',
                        gap: 10,
                        borderBottom: '1px solid var(--panel-border)',
                        background: 'var(--panel-header-bg)',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div>
                        Diagram
                    </div>
                </div>

                <div style={{ height: 'calc(100vh - 44px)', display: 'flex' }}>
                    {/* canvas */}
                    <div style={{ flex: 1 }}>
                        <DiagramCanvas
                            theme={resolvedTheme}
                            nodes={diagramNodes}
                            edges={diagramEdges}
                            edgeColor={edgeColor}
                            initialViewport={viewportSnapshot}
                            focusNodeId={focusNodeId}
                            focusNonce={focusNonce}
                            onViewportChange={(vp) => {
                                viewportRef.current = vp;
                            }}
                            onNodesChange={(next) => {
                                setDiagramNodes(next);
                                for (const n of next) positionsRef.current.set(n.id, { x: n.x, y: n.y });
                            }}
                        />
                    </div>

                    {/* right sidebar */}
                    <div
                        style={{
                            width: 280,
                            borderLeft: '1px solid var(--panel-border)',
                            background: 'var(--panel-bg)',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div
                            style={{
                                padding: 10,
                                borderBottom: '1px solid var(--panel-border)',
                                background: 'var(--panel-header-bg)',
                                fontWeight: 700,
                            }}
                        >
                            Tables
                        </div>

                        <div style={{ padding: 10, borderBottom: '1px solid var(--panel-border)' }}>
                            <input
                                value={tableQuery}
                                onChange={(e) => setTableQuery(e.target.value)}
                                placeholder="Search table…"
                                style={{
                                    width: '100%',
                                    height: 34,
                                    borderRadius: 10,
                                    border: '1px solid var(--btn-border)',
                                    background: 'var(--btn-bg)',
                                    color: 'var(--text)',
                                    padding: '0 10px',
                                    outline: 'none',
                                }}
                            />
                            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                                {filteredTables.length} / {tablesSorted.length}
                            </div>
                        </div>

                        <div style={{ padding: 10, overflow: 'auto' }}>
                            <div style={{ display: 'grid', gap: 8 }}>
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
                </div>
            </div>
        </div>
    );
}


