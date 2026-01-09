'use client';

import React from 'react';
import { Html } from 'react-konva-utils';

type KonvaLucideProps = {
    x: number;
    y: number;
    gap?: number;
    children: React.ReactNode;
};

export function KonvaLucide({ x, y, gap = 0, children }: KonvaLucideProps) {
    return (
        <Html
            groupProps={{ x, y }}
            divProps={{ style: { pointerEvents: 'none' } }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap,
                }}
            >
                {children}
            </div>
        </Html>
    );
}
