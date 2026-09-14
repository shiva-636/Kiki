import { App, subscribe, setScreen, setRoomState, clearSession, startPolling } from './state.js?v=4.2';
import { fetchState } from './api.js?v=4.2';
import { captureRects, playFlip } from './flip.js?v=4.2';
import { renderHome, mountHome } from './screens/home.js?v=4.2';
import { renderCreate, mountCreate } from './screens/create.js?v=4.2';
import { renderJoin, mountJoin } from './screens/join.js?v=4.2';
import { renderRoom, mountRoom } from './screens/room.js?v=4.2';

const ROUTES = {
  home: { render: renderHome, mount: mountHome },
  create: { render: renderCreate, mount: mountCreate },
  join: { render: renderJoin, mount: mountJoin },
  room: { render: renderRoom, mount: mountRoom },
};

const rootEl = document.getElementById('app');

function render() {
  const route = ROUTES[App.screen] || ROUTES.home;
  const oldRects = captureRects('[data-score-row]');
  rootEl.innerHTML = route.render();
  route.mount(rootEl);
  requestAnimationFrame(() => playFlip(oldRects, '[data-score-row]'));
  requestAnimationFrame(() => {
    rootEl.querySelectorAll('[data-seat-enter]').forEach((el) => el.classList.add('seat-enter-play'));
  });
}

subscribe(render);

async function boot() {
  if (App.session) {
    try {
      const { state } = await fetchState(App.session.roomCode, App.session.playerId, App.session.token);
      setRoomState(state);
      setScreen('room');
      startPolling();
      return;
    } catch {
      clearSession();
    }
  }
  setScreen('home');
}

boot();
