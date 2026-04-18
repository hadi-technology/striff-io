export const SVG_CANVAS = { width: 1800, height: 1400 };
export const SVG_CONTENT_BOUNDS = { x: 0, y: 0, width: 1563, height: 1133 };

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function createViewportForBounds(stage, bounds, options = {}) {
  const {
    paddingX = 32,
    paddingY = 32,
    minScale = 0.18,
    maxScale = 2,
    offsetX = 0,
    offsetY = 0,
  } = options;

  const safeWidth = Math.max(1, bounds.width);
  const safeHeight = Math.max(1, bounds.height);
  const usableWidth = Math.max(1, stage.width - paddingX * 2);
  const usableHeight = Math.max(1, stage.height - paddingY * 2);
  const scale = clamp(
    Math.min(usableWidth / safeWidth, usableHeight / safeHeight),
    minScale,
    maxScale,
  );

  return {
    scale,
    x: (stage.width - safeWidth * scale) / 2 - bounds.x * scale + offsetX,
    y: (stage.height - safeHeight * scale) / 2 - bounds.y * scale + offsetY,
  };
}

export function getTransformedBounds(bounds, viewport) {
  return {
    left: bounds.x * viewport.scale + viewport.x,
    top: bounds.y * viewport.scale + viewport.y,
    right: (bounds.x + bounds.width) * viewport.scale + viewport.x,
    bottom: (bounds.y + bounds.height) * viewport.scale + viewport.y,
  };
}

export function createOverviewSweep(stage) {
  return [
    createViewportForBounds(stage, { x: 92, y: 214, width: 1180, height: 650 }, { paddingX: 18, paddingY: 12 }),
    createViewportForBounds(stage, { x: 86, y: 206, width: 1010, height: 590 }, { paddingX: 20, paddingY: 18 }),
    createViewportForBounds(stage, { x: 98, y: 234, width: 860, height: 500 }, { paddingX: 24, paddingY: 22, offsetY: -6 }),
  ];
}
