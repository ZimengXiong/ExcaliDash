import React from "react";
import { createPortal } from "react-dom";

export type Point = { x: number; y: number };

export type SelectionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export const getSelectionBounds = (
  start: Point,
  current: Point,
): SelectionBounds => {
  const left = Math.min(start.x, current.x);
  const right = Math.max(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const bottom = Math.max(start.y, current.y);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

export const DragOverlayPortal: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => createPortal(children, document.body);
