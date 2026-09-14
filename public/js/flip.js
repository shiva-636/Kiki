import { prefersReducedMotion } from './dom.js?v=4.2';

/** Capture current bounding rects of elements matching selector, keyed by data-flip-id. */
export function captureRects(selector) {
  const map = new Map();
  document.querySelectorAll(selector).forEach((el) => {
    const id = el.getAttribute('data-flip-id');
    if (id) map.set(id, el.getBoundingClientRect());
  });
  return map;
}

/** After the DOM has been replaced, animate matched elements from their old rects to their new ones. */
export function playFlip(oldRects, selector) {
  if (!oldRects || oldRects.size === 0) return;
  const reduced = prefersReducedMotion();
  document.querySelectorAll(selector).forEach((el) => {
    const id = el.getAttribute('data-flip-id');
    const oldRect = oldRects.get(id);
    if (!oldRect) return;
    const newRect = el.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    if (reduced) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight; // force reflow
    el.style.transition = 'transform 0.55s cubic-bezier(0.22, 0.8, 0.2, 1)';
    el.style.transform = '';
  });
}
