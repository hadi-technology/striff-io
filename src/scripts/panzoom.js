/**
 * Pan and zoom for the diagram stages.
 *
 * This lived twice, inline in index.astro and examples.astro, and the two copies had
 * already drifted apart before being pulled together here. The differences that were
 * real are options; everything else is shared.
 *
 * Markup contract, on the element carrying `data-panzoom`:
 *   .github-diff-graphic          the image to transform (required)
 *   [data-panzoom-hint]           optional hint, hidden on first interaction
 *   [data-panzoom-ignore]         subtree that should not pan or zoom the stage
 *   data-focus-x/-y               point to centre, as a 0..1 fraction of the image
 *   data-mobile-focus-x/-y        optional mobile override of the focal point
 *   data-focus-offset-x/-y        optional px nudge off centre, for stages with overlays
 *   data-initial-scale            desktop zoom
 *   data-mobile-scale             mobile zoom
 *   data-initial-x/-y             legacy absolute offsets, used only without data-focus-*
 *   data-mobile-x/-y              same, for mobile
 * A matching [data-panzoom-reset="<id>"] button elsewhere resets the view.
 *
 * Prefer data-focus-*. The same diagram is rendered into stages of different widths (854px
 * in the homepage carousel, 1252px on /examples), and absolute offsets can only ever be
 * right for one of them: that is why diagrams were opening cropped through the middle of a
 * class box. A fraction of the image is the same point at any stage size.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {object} [options]
 * @param {number} [options.minScaleFloor=1.2]     hard lower bound on zoom out
 * @param {boolean} [options.fitOnMobile=false]    on mobile, fit the whole image to the
 *                                                 stage instead of using data-mobile-*
 * @param {boolean} [options.lockPanWhenUnzoomed=false] no dragging while scale <= 1
 */
export function initPanzoom(options) {
  const opts = options || {};
  const minScaleFloor = opts.minScaleFloor == null ? 1.2 : opts.minScaleFloor;
  const fitOnMobile = !!opts.fitOnMobile;
  const lockPanWhenUnzoomed = !!opts.lockPanWhenUnzoomed;

  document.querySelectorAll("[data-panzoom]").forEach(function (stage) {
    const id = stage.getAttribute("data-panzoom");
    const media = stage.querySelector(".github-diff-graphic");
    const reset = document.querySelector('[data-panzoom-reset="' + id + '"]');
    if (!media) return;

    // The stylesheet puts a 120ms transition on the image. Every frame is painted from
    // rAF below, so that transition would only add lag and smearing on top.
    media.style.transition = "none";

    const hint = stage.querySelector("[data-panzoom-hint]");
    let hintHidden = false;

    function hideHint() {
      if (hint && !hintHidden) {
        hintHidden = true;
        hint.classList.add("is-hidden");
      }
    }

    let scale = 1;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let dragging = false;

    // Wheel events arrive far faster than a CSS transition can finish, so letting CSS
    // animate the transform meant every event restarted a half-finished tween. The
    // rendered state is eased toward a target here instead: bursts of events accumulate
    // into one continuous motion.
    let targetScale = 1;
    let targetX = 0;
    let targetY = 0;
    let frame = null;
    let lastFrameAt = 0;

    function paint() {
      media.style.transform = "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
    }

    function settle() {
      scale = targetScale;
      x = targetX;
      y = targetY;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      paint();
    }

    function tick(now) {
      const dt = lastFrameAt ? Math.min(now - lastFrameAt, 50) : 16.7;
      lastFrameAt = now;

      const ds = targetScale - scale;
      const dx = targetX - x;
      const dy = targetY - y;

      if (Math.abs(ds) < 0.0004 && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        frame = null;
        settle();
        return;
      }

      // Time based rather than per frame, so the feel is identical on a 60Hz and a
      // 120Hz display. The time constant is what to tune: smaller is snappier.
      const k = 1 - Math.exp(-dt / 26);
      scale += ds * k;
      x += dx * k;
      y += dy * k;
      paint();
      frame = requestAnimationFrame(tick);
    }

    function animate() {
      if (!frame) {
        lastFrameAt = 0;
        frame = requestAnimationFrame(tick);
      }
    }

    function numberAttr(name, fallback) {
      const value = parseFloat(stage.getAttribute(name) || "");
      return Number.isFinite(value) ? value : fallback;
    }

    let baseScale = 1.6;

    // Controls that sit on top of the diagram (findings overlay, report thumbnail) are
    // buttons, not canvas: pressing one should not start a pan, and scrolling over one
    // should not zoom.
    function isOverlayControl(event) {
      const target = event.target;
      return !!(target && target.closest && target.closest("[data-panzoom-ignore]"));
    }

    function resetView() {
      const mobile = window.innerWidth < 768;

      if (mobile && fitOnMobile) {
        // Fit the full diagram to the stage width; the gallery diagram sits behind the
        // check overlay, so a complete view beats a zoomed crop.
        targetScale = 1;
        targetX = 0;
        const stageH = stage.clientHeight;
        const imgH = media.clientHeight || stageH;
        targetY = Math.min(0, (stageH - imgH) / 2);
        baseScale = targetScale;
        settle();
        return;
      }

      targetScale = mobile
        ? numberAttr("data-mobile-scale", 1.2)
        : numberAttr("data-initial-scale", 1.6);

      // The focal point is a property of the diagram, so it is normally shared across
      // breakpoints; the mobile override exists for stages whose overlays differ there.
      const focusX = mobile
        ? numberAttr("data-mobile-focus-x", numberAttr("data-focus-x", NaN))
        : numberAttr("data-focus-x", NaN);
      const focusY = mobile
        ? numberAttr("data-mobile-focus-y", numberAttr("data-focus-y", NaN))
        : numberAttr("data-focus-y", NaN);

      if (Number.isFinite(focusX) && Number.isFinite(focusY)) {
        // Measured every time rather than cached: the same stage is a different width after
        // a resize, an orientation change, or a tab becoming visible.
        const stageW = stage.clientWidth;
        const stageH = stage.clientHeight;
        const imgW = media.offsetWidth || stageW;
        const imgH = media.offsetHeight || stageH;

        targetX = stageW / 2 - focusX * imgW * targetScale + numberAttr("data-focus-offset-x", 0);
        targetY = stageH / 2 - focusY * imgH * targetScale + numberAttr("data-focus-offset-y", 0);
      } else if (mobile) {
        targetX = numberAttr("data-mobile-x", -40);
        targetY = numberAttr("data-mobile-y", -30);
      } else {
        targetX = numberAttr("data-initial-x", -120);
        targetY = numberAttr("data-initial-y", -80);
      }

      baseScale = targetScale;
      settle();
    }

    // The framing is derived from measured sizes, so it has to be recomputed whenever those
    // measurements change. Only while the view is untouched: re-framing under someone who has
    // panned somewhere deliberately would be worse than leaving it alone.
    let userHasMoved = false;

    // Carousel diagrams are loading="lazy", so at init the image often has no layout box yet
    // and the focal-point maths falls back to the stage's own size. That lands the view on an
    // empty corner of the diagram, which is exactly the failure this was meant to fix.
    if (!media.complete || !media.naturalWidth) {
      media.addEventListener(
        "load",
        function () {
          if (!userHasMoved) resetView();
        },
        { once: true }
      );
    }

    if (typeof ResizeObserver !== "undefined") {
      let firstObservation = true;
      new ResizeObserver(function () {
        if (firstObservation) {
          firstObservation = false;
          return;
        }
        if (!userHasMoved) resetView();
      }).observe(stage);
    }

    stage.addEventListener(
      "wheel",
      function (event) {
        if (isOverlayControl(event)) return;
        // Zoom bounds relative to each diagram's initial scale, so dense
        // diagrams that start deeply zoomed can't shrink into a speck.
        const minScale = Math.max(minScaleFloor, baseScale * 0.55);
        const maxScale = Math.min(4, baseScale * 2.2);

        // deltaY is in lines or pages on some browsers, and a trackpad sends a stream of
        // small deltas where a mouse sends one big one. Normalising to pixels and scaling
        // by the magnitude keeps one wheel notch at ~13% on either device.
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
        const delta = clamp(event.deltaY * unit, -100, 100);
        // Multiplicative, so a notch feels the same zoomed in as zoomed out.
        const next = clamp(targetScale * Math.exp(-delta * 0.0012), minScale, maxScale);

        if (Math.abs(next - targetScale) < 0.0004) {
          // Already at the zoom limit in this direction: let the page scroll.
          return;
        }
        event.preventDefault();
        hideHint();
        userHasMoved = true;

        // Anchor on the cursor so the thing being pointed at stays put. rect.left is the
        // transformed left edge and the origin is top left, so rect.left - x is the
        // untransformed origin regardless of where the easing currently sits.
        const rect = media.getBoundingClientRect();
        const cx = event.clientX - (rect.left - x);
        const cy = event.clientY - (rect.top - y);
        const ratio = next / targetScale;

        targetX = cx - (cx - targetX) * ratio;
        targetY = cy - (cy - targetY) * ratio;
        targetScale = next;
        animate();
      },
      { passive: false }
    );

    stage.addEventListener("pointerdown", function (event) {
      if (isOverlayControl(event)) return;
      hideHint();
      userHasMoved = true;
      // Land any in-flight zoom before grabbing, so the drag starts from what is on
      // screen rather than fighting the easing.
      settle();
      dragging = true;
      startX = event.clientX - x;
      startY = event.clientY - y;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add("is-dragging");
    });

    stage.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      if (lockPanWhenUnzoomed && scale <= 1) return;
      // Dragging is 1:1 with the pointer: easing here would feel like lag.
      targetX = x = event.clientX - startX;
      targetY = y = event.clientY - startY;
      paint();
    });

    function stopDragging() {
      dragging = false;
      stage.classList.remove("is-dragging");
    }

    stage.addEventListener("pointerup", stopDragging);
    stage.addEventListener("pointercancel", stopDragging);
    stage.addEventListener("pointerleave", stopDragging);

    if (reset) {
      reset.addEventListener("click", function () {
        userHasMoved = false;
        resetView();
      });
    }

    stage._panzoomReset = function () {
      userHasMoved = false;
      resetView();
    };
    resetView();
  });
}
