'use client';

import React, { useMemo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { ListOrdered } from 'lucide-react';
import { KonvaLucide } from '@/components/konva/KonvaLucide';

export const ENUM_CARD = { w: 280, h: 220 };

type EnumDef = { name: string; values: string[] };

type Props = {
    id: string;
    x: number;
    y: number;
    enumDef: EnumDef;
    theme: 'light' | 'dark';
    onMove: (pos: { x: number; y: number }) => void;
    onDragStateChange: (dragging: boolean) => void;
};

const approxTextW = (text: string, fontSize: number) =>
    Math.ceil(text.length * fontSize * 0.56);

export function estimateEnumHeight(enumDef: EnumDef) {
    const padding = 12;
    const headerH = 40;
    const rowH = 18;
    const maxRows = 8;
    return headerH + padding + Math.min(maxRows, enumDef.values.length || 1) * rowH + 22;
}

export function estimateEnumWidth(enumDef: EnumDef) {
    const padding = 12;
    const headerTextW = approxTextW(enumDef.name, 14) + 28; // icon + gap
    const maxValueW = Math.max(
        ...((enumDef.values.length ? enumDef.values : ['No values found']).slice(0, 8).map((v) => approxTextW(v, 12))),
        120
    );

    const needed = padding + Math.max(headerTextW, maxValueW) + padding;
    return Math.ceil(Math.max(ENUM_CARD.w, needed));
}

export default function EnumNodeKonva({ x, y, enumDef, theme, onMove, onDragStateChange }: Props) {
    const palette = useMemo(() => {
        if (theme === 'dark') {
            return {
                bg: '#111',
                header: '#171717',
                border: '#2b2b2b',
                text: '#fff',
                muted: 'rgba(255,255,255,0.7)',
            };
        }
        return {
            bg: '#fff',
            header: '#f4f4f5',
            border: '#e4e4e7',
            text: '#0b0b0b',
            muted: 'rgba(0,0,0,0.65)',
        };
    }, [theme]);

    const padding = 12;
    const headerH = 40;
    const rowH = 18;
    const maxRows = 8;

    const cardW = useMemo(() => estimateEnumWidth(enumDef), [enumDef]);
    const computedH = useMemo(() => estimateEnumHeight(enumDef), [enumDef]);

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
                <ListOrdered size={18} style={{ color: palette.text }} />
            </KonvaLucide>
            <Text x={padding + 28} y={12} text={enumDef.name} fontStyle="700" fontSize={14} fill={palette.text} />

            {(enumDef.values.length ? enumDef.values : ['No values found']).slice(0, maxRows).map((v, i) => (
                <Text
                    key={`${v}-${i}`}
                    x={padding}
                    y={headerH + padding + i * rowH}
                    text={v}
                    fontSize={12}
                    fill={enumDef.values.length ? palette.text : palette.muted}
                />
            ))}

            {enumDef.values.length > maxRows ? (
                <Text
                    x={padding}
                    y={computedH - 22}
                    text={`… ${enumDef.values.length - maxRows} more`}
                    fontSize={12}
                    fill={palette.muted}
                />
            ) : null}
        </Group>
    );
}
