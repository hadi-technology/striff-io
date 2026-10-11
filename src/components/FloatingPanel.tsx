import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Space between the control and the panel, and between the panel and the window's edge, in px. */
const GAP = 6;
const MARGIN = 8;

/**
 * A panel or menu that opens beside the control that asked for it, drawn at the page's root so
 * that no clipped or scrolling container around the control can cut it off.
 *
 * It opens below the control with their right edges aligned (left edges with `align="start"`). It
 * opens above instead when the window has no room below and does have room above, and it is
 * always kept inside the window from side to side. It follows the control while the page or any
 * container scrolls, when the window resizes, and when its own content changes size. Until it has
 * been placed it is transparent, so it never shows at a wrong place first, yet what it holds can
 * already take focus.
 *
 * Events inside it still reach the control's React ancestors, so a parent that stops a click from
 * closing the panel keeps doing so.
 */
export default function FloatingPanel({
  anchor,
  panelRef,
  align = "end",
  as: Tag = "div",
  style,
  children,
  ...attrs
}: {
  /** The control the panel belongs to. */
  anchor: MutableRefObject<HTMLElement | null>;
  /** Set to the panel's element, for callers that check whether a click landed inside it. */
  panelRef?: MutableRefObject<HTMLElement | null>;
  align?: "start" | "end";
  as?: "div" | "span";
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const own = useRef<HTMLElement | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const panel = own.current;
    if (!panel) return;
    const measure = () => {
      const control = anchor.current;
      if (!control) return;
      const at = control.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const viewWidth = document.documentElement.clientWidth;
      const viewHeight = window.innerHeight;
      const wanted = align === "start" ? at.left : at.right - width;
      const left = Math.max(MARGIN, Math.min(wanted, viewWidth - width - MARGIN));
      const below = at.bottom + GAP;
      const above = at.top - GAP - height;
      const top = below + height <= viewHeight - MARGIN || above < MARGIN ? below : above;
      setPlace((now) => (now && now.top === top && now.left === left ? now : { top, left }));
    };
    measure();
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    const sized = new ResizeObserver(measure);
    sized.observe(panel);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      sized.disconnect();
    };
  }, [anchor, align]);

  const placed: CSSProperties = {
    ...style,
    position: "fixed",
    top: place?.top ?? 0,
    left: place?.left ?? 0,
    right: "auto",
    bottom: "auto",
    maxWidth: `calc(100vw - ${2 * MARGIN}px)`,
    ...(place ? {} : { opacity: 0, pointerEvents: "none" as const }),
  };
  const ref = (node: HTMLElement | null) => {
    own.current = node;
    if (panelRef) panelRef.current = node;
  };
  return createPortal(
    <Tag ref={ref} style={placed} {...attrs}>
      {children}
    </Tag>,
    document.body
  );
}
