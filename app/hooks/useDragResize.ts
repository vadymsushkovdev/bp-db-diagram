import { useEffect, useRef } from "react";

export function useDragResize(
  leftWidth: number,
  setLeftWidth: (v: number) => void,
  rightWidth: number,
  setRightWidth: (v: number) => void,
) {
  const dragLeftRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const dragRightRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragLeftRef.current) {
        const deltaPx = e.clientX - dragLeftRef.current.startX;
        const deltaPct = (deltaPx / window.innerWidth) * 100;
        setLeftWidth(
          Math.min(
            80 - rightWidth,
            Math.max(25, dragLeftRef.current.startWidth + deltaPct),
          ),
        );
      }
      if (dragRightRef.current) {
        const deltaPx = dragRightRef.current.startX - e.clientX;
        const deltaPct = (deltaPx / window.innerWidth) * 100;
        setRightWidth(
          Math.min(
            80 - leftWidth,
            Math.max(10, dragRightRef.current.startWidth + deltaPct),
          ),
        );
      }
    };
    const onMouseUp = () => {
      dragLeftRef.current = null;
      dragRightRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [leftWidth, rightWidth, setLeftWidth, setRightWidth]);

  const startLeftDrag = (startX: number) => {
    dragLeftRef.current = { startX, startWidth: leftWidth };
  };
  const startRightDrag = (startX: number) => {
    dragRightRef.current = { startX, startWidth: rightWidth };
  };

  return { startLeftDrag, startRightDrag };
}
