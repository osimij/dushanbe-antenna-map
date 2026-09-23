/* Shared touch helpers for both maps: vertical drags and the phone bottom sheet. */
(function () {
  'use strict';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let suppressClickUntil = 0;
  // A drag that started on a button must not also count as a tap on it.
  window.addEventListener('click', (e) => {
    if (performance.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Tracks one vertical pointer drag on `el`. Movement under 6px stays an ordinary tap.
  // end(dy, velocity) receives the release velocity in px/ms (positive = downwards).
  function dragY(el, {enabled = () => true, start, move, end}) {
    let d = null;
    el.addEventListener('pointerdown', (e) => {
      if (d || !e.isPrimary || e.button > 0 || !enabled(e)) return;
      d = {id: e.pointerId, y0: e.clientY, moved: false, samples: [[e.timeStamp, e.clientY]]};
    });
    el.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y0;
      if (!d.moved) {
        if (Math.abs(dy) < 6) return;
        d.moved = true;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
        start?.();
      }
      d.samples.push([e.timeStamp, e.clientY]);
      if (d.samples.length > 8) d.samples.shift();
      move(dy);
    });
    const finish = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const drag = d; d = null;
      if (!drag.moved) return;
      suppressClickUntil = performance.now() + 300;
      const s = drag.samples, last = s[s.length - 1];
      const y = e.type === 'pointercancel' ? last[1] : e.clientY, now = e.timeStamp;
      let i = s.length - 1;
      while (i > 0 && now - s[i - 1][0] < 100) i--;
      const dt = now - s[i][0];
      end(y - drag.y0, e.type === 'pointercancel' || dt <= 0 ? 0 : (y - s[i][1]) / dt);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }

  // Matches app.css: on phones and short windows the whole panel scrolls, so only the handle drags the sheet.
  const panelScrolls = matchMedia('(max-width: 720px), (min-width: 721px) and (max-height: 560px)');

  const translateY = (el) => {
    const t = getComputedStyle(el).transform;
    return t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
  };
  // iOS-like resistance past the ends of the track.
  const rubber = (x) => (1 - 1 / (x * .55 / 120 + 1)) * 120;

  // Phone bottom sheet with two resting points: collapsed to the handle, or open.
  // It follows the finger, and a flick decides the direction regardless of distance.
  function bottomSheet({panel, toggle, handles, enabled, onChange}) {
    const body = document.body;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:var(--peek);visibility:hidden;pointer-events:none';
    body.appendChild(probe);
    const isCollapsed = () => body.classList.contains('sheet-collapsed');
    let max = 0, base = 0, settle, peek = 0;
    // Reading the probe forces layout, so the handle height is measured once per viewport size.
    const peekHeight = () => peek || (peek = probe.offsetHeight);
    addEventListener('resize', () => { peek = 0; });
    function set(collapsed) {
      body.classList.toggle('sheet-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      onChange?.(collapsed);
    }
    toggle.addEventListener('click', () => set(!isCollapsed()));
    for (const handle of handles) dragY(handle, {
      enabled: (e) => enabled(e) && (handle === toggle || !panelScrolls.matches),
      start() {
        max = panel.offsetHeight - peekHeight();
        base = translateY(panel);            // grab mid-animation without a jump
        clearTimeout(settle);
        panel.style.transitionDuration = '';
        panel.classList.add('dragging');
        panel.style.transform = `translate3d(0,${base}px,0)`;
      },
      move(dy) {
        let y = base + dy;
        if (y < 0) y = -rubber(-y); else if (y > max) y = max + rubber(y - max);
        panel.style.transform = `translate3d(0,${y}px,0)`;
      },
      end(dy, v) {
        const y = Math.min(Math.max(base + dy, 0), max);
        const flick = Math.abs(v) > .35;
        const collapse = flick ? v > 0 : y > max / 2;
        const dist = Math.abs((collapse ? max : 0) - y);
        // A fast flick settles quickly; a slow release eases in at the normal pace.
        const ms = reduceMotion.matches ? 0 : Math.round(Math.min(380, Math.max(180, flick ? dist / Math.abs(v) * 2.2 : 320)));
        panel.style.transitionDuration = ms + 'ms';
        panel.classList.remove('dragging');
        panel.style.transform = '';
        set(collapse);
        settle = setTimeout(() => { panel.style.transitionDuration = ''; }, ms + 60);
      },
    });
    return {set, collapsed: isCollapsed, peek: peekHeight};
  }

  // Eased scroll that typing can't cancel (the browser's own smooth scroll stops at the first keystroke).
  const scrolling = new WeakMap();
  function scrollTo(el, top, duration = 320) {
    cancelAnimationFrame(scrolling.get(el));
    const from = el.scrollTop, delta = top - from;
    if (reduceMotion.matches || Math.abs(delta) < 2) { el.scrollTop = top; return; }
    const t0 = performance.now();
    // The user's own scroll gesture always wins over the animation.
    const stop = () => cancelAnimationFrame(scrolling.get(el));
    el.addEventListener('wheel', stop, {once: true, passive: true});
    el.addEventListener('touchstart', stop, {once: true, passive: true});
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      el.scrollTop = from + delta * (1 - Math.pow(1 - t, 3));
      if (t < 1) scrolling.set(el, requestAnimationFrame(step));
    };
    scrolling.set(el, requestAnimationFrame(step));
  }

  // Leaflet canvas renderer whose taps pick the closest shape, not whichever overlapping one was drawn last.
  // Pair it with a `tolerance` option on touch screens so small dots get finger-sized targets.
  let NearestCanvas;
  function nearestCanvas(options) {
    NearestCanvas = NearestCanvas || L.Canvas.extend({
      _onClick(e) {
        const point = this._map.mouseEventToLayerPoint(e), click = e.type === 'click' || e.type === 'preclick';
        let best = null, bestDistance = Infinity;
        for (let order = this._drawFirst; order; order = order.next) {
          const layer = order.layer;
          if (!layer.options.interactive || !layer._containsPoint(point) || (click && this._map._draggableMoved(layer))) continue;
          const distance = layer._point ? layer._point.distanceTo(point) - (layer._radius || 0) : 0;
          if (distance <= bestDistance) { best = layer; bestDistance = distance; }
        }
        this._fireEvent(best ? [best] : false, e);
      },
    });
    return new NearestCanvas(options);
  }

  window.UI = {dragY, bottomSheet, nearestCanvas, panelScrolls, scrollTo, translateY, rubber, reduceMotion: () => reduceMotion.matches};
})();
