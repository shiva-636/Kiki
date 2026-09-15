export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
export function clearDelegatedListeners(root) {
  const listeners = root.__kikiDelegatedListeners;
  if (!listeners) return;
  for (const { evt, listener } of listeners) root.removeEventListener(evt, listener);
  root.__kikiDelegatedListeners = [];
}

export function on(root, sel, evt, handler) {
  const listener = (e) => {
    const target = e.target.closest(sel);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(evt, listener);
  (root.__kikiDelegatedListeners ||= []).push({ evt, listener });
}
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
export function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}
/** Deterministic color for a player avatar, based on seat index. */
const AVATAR_COLORS = ['#F2B84D', '#FF6FA8', '#5B9DF2', '#3DD68C', '#F2555B', '#B98DF2', '#4DD2E0', '#F29A4D', '#8DF2A6', '#F24DD2'];
export function avatarColor(seat) {
  return AVATAR_COLORS[seat % AVATAR_COLORS.length];
}
export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
