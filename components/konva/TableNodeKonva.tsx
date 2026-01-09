'use client';

import React, { useMemo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { SqlTable } from '@/lib/sql/parseSqlToGraph';
import { Table as TableIcon, KeyRound, CircleSlash2 } from 'lucide-react';
import { KonvaLucide } from '@/components/konva/KonvaLucide';

export const TABLE_CARD = { w: 360, h: 260 };
const ROW_ICON = {
    size: 14,
    gap: 4,
    slotW: 34,
};

// Keep these in sync with DiagramCanvas.tableAnchorY
export const TABLE_LAYOUT = {
    padding: 12,
    headerH: 40,
    rowH: 24,
    colFontSize: 13,
    typeFontSize: 12,
    textBaselineOffset: 1,
};

type Props = {
    id: string;
    x: number;
    y: number;
    table: SqlTable;
    theme: 'light' | 'dark';
    onMove: (pos: { x: number; y: number }) => void;
    onDragStateChange: (dragging: boolean) => void;
    missingFkColumns?: string[];
};

type IndexLike = {
    name: string;
    unique?: boolean;
    method?: string | null;
    expression: string;
    include?: string | null;
    where?: string | null;
};

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const approxTextW = (text: string, fontSize: number) => Math.ceil(text.length * fontSize * 0.56);

const centerInBox = (top: number, boxH: number, innerH: number) =>
    Math.round(top + (boxH - innerH) / 2);

const textY = (rowTop: number, rowH: number, fontSize: number) =>
    centerInBox(rowTop, rowH, fontSize) + TABLE_LAYOUT.textBaselineOffset;

const pillTextY = (pillY: number, pillH: number, fontSize: number) =>
    Math.round(pillY + (pillH - fontSize) / 2) + TABLE_LAYOUT.textBaselineOffset;

const extractColumnsFromIndex = (idx: IndexLike, colNames: string[]) => {
    const hay = `${idx.expression ?? ''} ${idx.include ?? ''} ${idx.where ?? ''}`.toLowerCase();

    return colNames.filter((c) => {
        const n = c.toLowerCase();
        return new RegExp(`(^|[^a-z0-9_])${n}([^a-z0-9_]|$)`).test(hay);
    });
};

const getIndexesBlockHeight = (indexes: IndexLike[]) => {
    const indexesTitleH = indexes.length ? 20 : 0;
    const indexCardGap = indexes.length ? 8 : 0;
    const indexCardPadY = 8;
    const indexLineH = 14;
    const indexCardBaseH = 10 + indexCardPadY * 2;

    const indexCardHeights = indexes.map((idx) => {
        const lines = 1 + 1 + (idx.where ? 1 : 0);
        return indexCardBaseH + lines * indexLineH;
    });

    return indexes.length
        ? indexesTitleH +
        8 +
        indexCardHeights.reduce((a, b) => a + b, 0) +
        indexCardGap * (indexes.length - 1) +
        10
        : 0;
};

export function estimateTableHeight(table: SqlTable) {
    const { headerH, padding, rowH } = TABLE_LAYOUT;
    const colsCount = Math.max(1, table.columns.length);

    const indexes = (table.indexes ?? []) as unknown as IndexLike[];
    const indexesBlockH = getIndexesBlockHeight(indexes);

    return headerH + padding + colsCount * rowH + (indexesBlockH ? 14 : 12) + indexesBlockH;
}

const CHIP_H = 16;
const CHIP_PAD_X = 6;
const CHIP_GAP = 6;
const MAX_CHIPS = 6;

const chipWForId = (id: string) => Math.max(20, id.length * 7 + CHIP_PAD_X * 2);
const moreLabelW = (text: string) => approxTextW(text, 10) + 2;

function buildIndexMaps(table: SqlTable) {
    const indexes = (table.indexes ?? []) as unknown as IndexLike[];
    const colNames = table.columns.map((c) => c.name);

    const indexIdByName = new Map<string, string>();
    indexes.forEach((idx, i) => indexIdByName.set(idx.name, `I${i + 1}`));

    const indexColumnsByName = new Map<string, string[]>();
    indexes.forEach((idx) => indexColumnsByName.set(idx.name, extractColumnsFromIndex(idx, colNames)));

    const indexIdsByColumn = new Map<string, string[]>();
    colNames.forEach((c) => indexIdsByColumn.set(c, []));

    indexes.forEach((idx) => {
        const id = indexIdByName.get(idx.name);
        if (!id) return;

        const cols = indexColumnsByName.get(idx.name) ?? [];
        cols.forEach((c) => indexIdsByColumn.set(c, uniq([...(indexIdsByColumn.get(c) ?? []), id])));
    });

    return { indexes, colNames, indexIdByName, indexColumnsByName, indexIdsByColumn };
}

function getMaxChipRowW(indexIdsByColumn: Map<string, string[]>) {
    const rows = Array.from(indexIdsByColumn.values());
    if (!rows.length) return 0;

    return rows.reduce((maxW, ids) => {
        if (!ids.length) return maxW;

        const visible = ids.slice(0, MAX_CHIPS);
        const hasMore = ids.length > visible.length;

        const chipsW =
            visible.reduce((sum, id, i) => sum + chipWForId(id) + (i ? CHIP_GAP : 0), 0) +
            (hasMore ? CHIP_GAP + moreLabelW(`+${ids.length - visible.length}`) : 0);

        return Math.max(maxW, chipsW);
    }, 0);
}

function getTableHLayout(table: SqlTable) {
    const { padding, typeFontSize, colFontSize } = TABLE_LAYOUT;

    // left icon slot for row icons
    const rowIconSlotW = 22;
    const nameX = padding + rowIconSlotW + 6;

    const enumPillW = 54;
    const enumPillH = 16;
    const enumGap = 12;

    const NN_ICON_SIZE = 14;
    const NN_GAP_AFTER_NAME = 8;  // gap between name text and icon
    const NN_AFTER_ICON_GAP = 12; // gap after icon before next column (enum/chips)
    const NAME_META_W = NN_GAP_AFTER_NAME + NN_ICON_SIZE + NN_AFTER_ICON_GAP;
    const CHIP_TO_TYPE_GAP = 12;

    const TYPE_MIN_W = 110;
    const TYPE_MAX_W = 160;

    const maxNameW = Math.max(
        approxTextW(table.name, 14),
        ...table.columns.map((c) => approxTextW(c.name, colFontSize)),
    );
    const NAME_COL_MIN_W = 140; // ✅ prevents tiny columns like "name" breaking
    const NAME_COL_MAX_W = 260;

    const nameColW = clamp(maxNameW, NAME_COL_MIN_W, NAME_COL_MAX_W);


    const maxTypeW = Math.max(
        ...table.columns.map((c) => approxTextW(c.type ?? '', typeFontSize)),
        approxTextW('varchar(100)', typeFontSize),
    );

    const hasAnyEnum = table.columns.some((c) => c.isEnum);
    const { indexIdsByColumn } = buildIndexMaps(table);
    const maxChipRowW = getMaxChipRowW(indexIdsByColumn);

    const typeColW = clamp(maxTypeW + 16, TYPE_MIN_W, TYPE_MAX_W);

    const enumPillX = nameX + nameColW + NAME_META_W;
    const chipStartX = enumPillX + (hasAnyEnum ? enumPillW + enumGap : 0);

    const contentMinW =
        chipStartX +
        (maxChipRowW ? maxChipRowW + CHIP_TO_TYPE_GAP : 0) +
        typeColW +
        padding;

    const headerNeededW = padding + 18 + 10 + nameColW + padding;

    const cardW = Math.ceil(Math.max(TABLE_CARD.w, contentMinW, headerNeededW));
    const typeX = cardW - padding - typeColW;

    return {
        cardW,
        nameX,
        rowIconSlotW,
        enumPillX,
        enumPillW,
        enumPillH,
        nameColW,
        hasAnyEnum,
        chipStartX,
        typeX,
        typeColW,
    };
}

export function estimateTableWidth(table: SqlTable) {
    return getTableHLayout(table).cardW;
}

export default function TableNodeKonva({
                                           x,
                                           y,
                                           table,
                                           theme,
                                           onMove,
                                           onDragStateChange,
                                           missingFkColumns,
                                       }: Props) {
    const palette = useMemo(() => {
        if (theme === 'dark') {
            return {
                bg: '#111',
                header: '#171717',
                border: '#2b2b2b',
                text: '#fff',
                muted: 'rgba(255,255,255,0.7)',
                chipBg: '#0f0f0f',
                chipBorder: 'rgba(255,255,255,0.10)',
                divider: 'rgba(255,255,255,0.10)',
            };
        }
        return {
            bg: '#fff',
            header: '#f4f4f5',
            border: '#e4e4e7',
            text: '#0b0b0b',
            muted: 'rgba(0,0,0,0.65)',
            chipBg: '#fafafa',
            chipBorder: 'rgba(0,0,0,0.10)',
            divider: 'rgba(0,0,0,0.08)',
        };
    }, [theme]);

    const { padding, headerH, rowH } = TABLE_LAYOUT;

    const { indexes, colNames, indexIdByName, indexColumnsByName, indexIdsByColumn } = useMemo(
        () => buildIndexMaps(table),
        [table],
    );

    const { cardW, nameX, enumPillX, enumPillW, nameColW, enumPillH, hasAnyEnum, chipStartX, typeX, typeColW } =
        useMemo(() => getTableHLayout(table), [table]);

    const indexesBlockH = getIndexesBlockHeight(indexes);
    const computedH = estimateTableHeight(table);

    const colsTopY = headerH + padding;
    const indexesTopY = colsTopY + table.columns.length * rowH + 12;

    const missingFkSet = useMemo(
        () => new Set((missingFkColumns ?? []).map((s) => s.toLowerCase())),
        [missingFkColumns],
    );

    const fkMissingFill = theme === 'dark' ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)';
    const fkMissingStroke = theme === 'dark' ? 'rgba(239,68,68,0.28)' : 'rgba(239,68,68,0.20)';

    return (
        <Group
            x={x}
            y={y}
            name="node"
            draggable
            onDragStart={() => onDragStateChange(true)}
            onDragMove={(e) => onMove({ x: e.target.x(), y: e.target.y() })}
            onDragEnd={(e) => {
                onDragStateChange(false);
                onMove({ x: e.target.x(), y: e.target.y() });
            }}
        >
            <Rect
                width={cardW}
                height={computedH}
                fill={palette.bg}
                stroke={palette.border}
                cornerRadius={10}
                shadowBlur={theme === 'dark' ? 20 : 12}
                shadowOpacity={theme === 'dark' ? 0.35 : 0.12}
                shadowOffset={{ x: 0, y: 8 }}
            />

            <Rect
                width={cardW}
                height={headerH}
                fill={palette.header}
                stroke={palette.border}
                cornerRadius={[10, 10, 0, 0]}
            />

            <KonvaLucide x={padding} y={12}>
                <TableIcon size={18} style={{ color: palette.text }} />
            </KonvaLucide>

            <Text
                x={padding + 28}
                y={12}
                text={table.name}
                fontStyle="700"
                fontSize={14}
                fill={palette.text}
            />

            {/* Columns */}
            {table.columns.map((c, i) => {
                const rowTop = colsTopY + i * rowH;

                const ids = indexIdsByColumn.get(c.name) ?? [];
                const chips = ids.slice(0, MAX_CHIPS);
                const hasMoreChips = ids.length > chips.length;

                const enumPillY = centerInBox(rowTop, rowH, enumPillH);

                const rowIconX = padding + 2;
                const rowIconY = centerInBox(rowTop, rowH, 16);

                const nameTextY = textY(rowTop, rowH, TABLE_LAYOUT.colFontSize);
                const typeTextY = textY(rowTop, rowH, TABLE_LAYOUT.typeFontSize);

                // place chips without overlap (cursor-based)
                const chipLayout = chips.reduce(
                    (acc, id) => {
                        const w = chipWForId(id);
                        const xPos = acc.cursor;
                        return { cursor: xPos + w + CHIP_GAP, items: [...acc.items, { id, x: xPos, w }] };
                    },
                    { cursor: chipStartX, items: [] as Array<{ id: string; x: number; w: number }> },
                );

                const moreLabelX = chipLayout.cursor;


                return (
                    <React.Fragment key={c.name}>
                        {c.isForeignKey && missingFkSet.has(c.name.toLowerCase()) ? (
                            <Rect
                                x={padding - 6}
                                y={rowTop + 2}
                                width={cardW - (padding - 6) * 2}
                                height={rowH - 4}
                                fill={fkMissingFill}
                                stroke={fkMissingStroke}
                                cornerRadius={8}
                            />
                        ) : null}

                        {/* PK icon slot */}
                        {c.isPrimaryKey ? (
                            <KonvaLucide x={rowIconX} y={rowIconY}>
                                <KeyRound size={16} style={{ color: palette.muted }} />
                            </KonvaLucide>
                        ) : null}

                        <Text
                            x={nameX}
                            y={nameTextY}
                            width={nameColW}
                            wrap="none"      // ✅ no wrapping (fixes "nam" + "e")
                            ellipsis         // ✅ shows …
                            text={c.name}
                            fontSize={TABLE_LAYOUT.colFontSize}
                            fill={palette.text}
                        />


                        {c.isNotNull ? (() => {
                            const iconSize = 14;
                            const gap = 8;

                            const fullNameW = approxTextW(c.name, TABLE_LAYOUT.colFontSize);
                            const visibleNameW = Math.min(fullNameW, nameColW);

                            const iconX = nameX + visibleNameW + gap; // ✅ no clamp needed anymore
                            const iconY = centerInBox(rowTop, rowH, iconSize);

                            return (
                                <KonvaLucide x={iconX} y={iconY}>
                                    <CircleSlash2 size={iconSize} style={{ color: palette.muted }} />
                                </KonvaLucide>
                            );
                        })() : null}



                        {c.isEnum ? (
                            <>
                                <Rect
                                    x={enumPillX}
                                    y={enumPillY}
                                    width={enumPillW}
                                    height={enumPillH}
                                    fill={palette.chipBg}
                                    stroke={palette.border}
                                    cornerRadius={999}
                                />
                                <Text
                                    x={enumPillX}
                                    y={pillTextY(enumPillY, enumPillH, 10)}
                                    width={enumPillW}
                                    align="center"
                                    text="ENUM"
                                    fontSize={10}
                                    fill={palette.text}
                                />
                            </>
                        ) : null}

                        {/* If table has any enum, but this row doesn't, we just leave that space (keeps alignment clean) */}
                        {!c.isEnum && hasAnyEnum ? null : null}

                        {/* Index chips */}
                        {chipLayout.items.map(({ id, x: chipX, w: chipW }) => (
                            <React.Fragment key={`${c.name}:${id}`}>
                                <Rect
                                    x={chipX}
                                    y={centerInBox(rowTop, rowH, CHIP_H)}
                                    width={chipW}
                                    height={CHIP_H}
                                    fill={palette.chipBg}
                                    stroke={palette.chipBorder}
                                    cornerRadius={999}
                                />
                                <Text
                                    x={chipX + CHIP_PAD_X}
                                    y={pillTextY(centerInBox(rowTop, rowH, CHIP_H), CHIP_H, 10)}
                                    text={id}
                                    fontSize={10}
                                    fill={palette.text}
                                />
                            </React.Fragment>
                        ))}

                        {hasMoreChips ? (
                            <Text
                                x={moreLabelX}
                                y={pillTextY(centerInBox(rowTop, rowH, CHIP_H), CHIP_H, 10)}
                                text={`+${ids.length - chips.length}`}
                                fontSize={10}
                                fill={palette.muted}
                            />
                        ) : null}

                        {/* Type */}
                        <Text
                            x={typeX}
                            y={typeTextY}
                            width={typeColW}
                            align="right"
                            text={c.type}
                            fontSize={TABLE_LAYOUT.typeFontSize}
                            fill={palette.muted}
                        />
                    </React.Fragment>
                );
            })}

            {/* Indexes section */}
            {indexes.length ? (
                <>
                    <Rect x={padding} y={indexesTopY - 6} width={cardW - padding * 2} height={1} fill={palette.divider} />

                    <Text x={padding} y={indexesTopY + 6} text="Indexes" fontStyle="700" fontSize={12} fill={palette.text} />

                    {(() => {
                        const indexCardGap = 8;
                        const indexCardPadY = 8;
                        const indexLineH = 14;
                        const indexCardBaseH = 10 + indexCardPadY * 2;

                        const indexCardHeights = indexes.map((idx) => {
                            const lines = 1 + 1 + (idx.where ? 1 : 0);
                            return indexCardBaseH + lines * indexLineH;
                        });

                        let yCursor = indexesTopY + 26;

                        return indexes.map((idx, i) => {
                            const id = indexIdByName.get(idx.name) ?? `I${i + 1}`;
                            const cols = indexColumnsByName.get(idx.name) ?? [];
                            const cardH = indexCardHeights[i]!;
                            const cardY = yCursor;
                            yCursor += cardH + indexCardGap;

                            return (
                                <React.Fragment key={idx.name}>
                                    <Rect
                                        x={padding}
                                        y={cardY}
                                        width={cardW - padding * 2}
                                        height={cardH}
                                        fill={palette.chipBg}
                                        stroke={palette.border}
                                        cornerRadius={10}
                                    />

                                    <Rect
                                        x={padding + 8}
                                        y={cardY + 8}
                                        width={24}
                                        height={16}
                                        fill={palette.bg}
                                        stroke={palette.chipBorder}
                                        cornerRadius={999}
                                    />
                                    <Text x={padding + 14} y={cardY + 10} text={id} fontSize={10} fill={palette.text} />

                                    <Text
                                        x={padding + 38}
                                        y={cardY + 8}
                                        text={`${idx.unique ? 'UNIQUE ' : ''}${idx.name}${idx.method ? `  (using ${idx.method})` : ''}`}
                                        fontSize={11}
                                        fill={palette.text}
                                    />

                                    <Text
                                        x={padding + 38}
                                        y={cardY + 8 + indexLineH}
                                        text={`(${idx.expression})${idx.include ? ` include (${idx.include})` : ''}`}
                                        fontSize={11}
                                        fill={palette.muted}
                                    />

                                    {idx.where ? (
                                        <Text
                                            x={padding + 38}
                                            y={cardY + 8 + indexLineH * 2}
                                            text={`where (${idx.where})`}
                                            fontSize={11}
                                            fill={palette.muted}
                                        />
                                    ) : null}

                                    {cols.length ? (
                                        <Text
                                            x={padding + 38}
                                            y={cardY + cardH - 16}
                                            text={`cols: ${cols.join(', ')}`}
                                            fontSize={10}
                                            fill={palette.muted}
                                        />
                                    ) : null}
                                </React.Fragment>
                            );
                        });
                    })()}
                </>
            ) : null}
        </Group>
    );
}

