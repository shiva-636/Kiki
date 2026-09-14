import { fetchState } from './api.js?v=5.1';

const SESSION_KEY = 'kiki_session_v1';
const POLL_MS = 700;

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — app still works for the current tab */
  }
}

export const App = {
  screen: 'home', // 'home' | 'create' | 'join' | 'room'
  session: loadSession(), // { roomCode, playerId, token, name }
  room: null, // last known server state
  error: null,
  toast: null,
  loading: false,
  ui: {}, // transient, per-screen scratch state
  _listeners: [],
  _pollTimer: null,
  _lastVersion: -1,
};

export function subscribe(fn) {
  App._listeners.push(fn);
  return () => {
    App._listeners = App._listeners.filter((f) => f !== fn);
  };
}

export function notify() {
  for (const fn of App._listeners) fn(App);
}

export function setScreen(screen, uiPatch = {}) {
  App.screen = screen;
  App.ui = { ...uiPatch };
  App.error = null;
  notify();
}

export function setError(err) {
  App.error = err ? (err.message || String(err)) : null;
  notify();
}

export function showToast(text, ms = 2600) {
  App.toast = { text, id: Date.now() };
  notify();
  const id = App.toast.id;
  setTimeout(() => {
    if (App.toast && App.toast.id === id) {
      App.toast = null;
      notify();
    }
  }, ms);
}

export function setLoading(v) {
  App.loading = v;
  notify();
}

export function setSession(session) {
  App.session = session;
  saveSession(session);
  notify();
}

export function clearSession() {
  App.session = null;
  App.room = null;
  App._lastVersion = -1;
  saveSession(null);
  notify();
}

export function setRoomState(state) {
  App.room = state;
  App._lastVersion = state.version;
  notify();
}

export function startPolling() {
  stopPolling();
  App._pollTimer = setInterval(async () => {
    if (!App.session) return;
    try {
      const { state } = await fetchState(App.session.roomCode, App.session.playerId, App.session.token);
      if (state.version !== App._lastVersion) {
        setRoomState(state);
      }
    } catch (err) {
      if (err.code === 'UNAUTHORIZED' || err.code === 'ROOM_NOT_FOUND') {
        clearSession();
        setScreen('home');
        showToast(err.message);
      }
      // transient network errors: fail silently, try again next tick
    }
  }, POLL_MS);
}

export function stopPolling() {
  if (App._pollTimer) clearInterval(App._pollTimer);
  App._pollTimer = null;
}
