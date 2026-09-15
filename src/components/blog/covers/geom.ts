/**
 * Small geometry helpers the cover drawings share, so every arrow on every cover has the same head.
 * Arrowheads are drawn as their own filled paths rather than SVG markers: a marker appears the
 * moment its line exists, before the stroke-draw animation has reached it.
 */

/** A filled arrowhead with its tip at (x2, y2), pointing away from (x1, y1). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 7): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const back = (side: number) => {
    const x = x2 - size * Math.cos(angle) + side * size * 0.55 * Math.sin(angle);
    const y = y2 - size * Math.sin(angle) - side * size * 0.55 * Math.cos(angle);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  return `M${x2} ${y2} L${back(1)} L${back(-1)} Z`;
}

/** A horizontal S-curve from (x1, y1) to (x2, y2), and the control point its end leaves from. */
export function sCurve(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { d: string; from: [number, number]; to: [number, number] } {
  const mid = (x1 + x2) / 2;
  return { d: `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`, from: [mid, y2], to: [x2, y2] };
}
