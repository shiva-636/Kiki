import { App, setScreen, setSession, setRoomState, setLoading, setError, startPolling } from '../state.js?v=5.1';
import { createRoom } from '../api.js?v=5.1';
import { on, qs, escapeHtml } from '../dom.js?v=5.1';

export function renderCreate() {
  const count = App.ui.count || 5;
  const name = App.ui.name || '';
  const roomName = App.ui.roomName || '';
  const counts = [3, 4, 5, 6, 7, 8, 9, 10];
  return `
    <div class="screen screen-form">
      <button class="btn-back" data-action="back" type="button" aria-label="Back to home">←</button>
      <div class="form-card">
        <div class="form-kicker">KIKI ROOM</div>
        <h2>Create a room</h2>
        <p class="form-sub">Get everyone seated — then pick a game.</p>

        <label class="field">
          <span class="field-label">Room Name</span>
          <input class="text-input" id="room-name-input" type="text" maxlength="40" placeholder="e.g. Friday Chaos" value="${escapeHtml(roomName)}" autocomplete="off" />
        </label>

        <label class="field">
          <span class="field-label">Your name</span>
          <input class="text-input" id="name-input" type="text" maxlength="20" placeholder="e.g. Shiva" value="${escapeHtml(name)}" autocomplete="off" />
        </label>

        <div class="field">
          <span class="field-label">Number of players</span>
          <div class="count-grid" role="group" aria-label="Number of players">
            ${counts.map((c) => `
              <button type="button" class="count-pill ${c === count ? 'is-selected' : ''}" data-count="${c}" aria-pressed="${c === count}">${c}</button>
            `).join('')}
          </div>
        </div>

        ${App.error ? `<p class="form-error" role="alert">${escapeHtml(App.error)}</p>` : ''}

        <button class="btn btn-primary btn-lg btn-block" id="submit-create" type="button" ${App.loading ? 'disabled' : ''}>
          ${App.loading ? 'Creating…' : 'Create room'}
        </button>
      </div>
    </div>
  `;
}

export function mountCreate(root) {
  on(root, '[data-action="back"]', 'click', () => setScreen('home'));

  on(root, '.count-pill', 'click', (e, target) => {
    App.ui.count = parseInt(target.dataset.count, 10);
    setScreen('create', App.ui);
  });

  const roomNameInput = qs('#room-name-input', root);
  if (roomNameInput) {
    roomNameInput.addEventListener('input', () => {
      App.ui.roomName = roomNameInput.value;
    });
  }

  const nameInput = qs('#name-input', root);
  if (nameInput) {
    nameInput.focus();
    nameInput.addEventListener('input', () => {
      App.ui.name = nameInput.value;
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  async function submit() {
    const name = (App.ui.name || '').trim();
    const roomName = (App.ui.roomName || '').trim();
    const count = App.ui.count || 5;
    if (!roomName) {
      setError(new Error('Give your room a name.'));
      qs('#room-name-input', root)?.focus();
      return;
    }
    if (!name) {
      setError(new Error("Don't forget to add your name."));
      return;
    }
    setLoading(true);
    try {
      const res = await createRoom(name, count, roomName);
      setSession({ roomCode: res.roomCode, playerId: res.playerId, token: res.token, name });
      setRoomState(res.state);
      setLoading(false);
      setScreen('room', { justCreated: true });
      startPolling();
    } catch (err) {
      setLoading(false);
      setError(err);
    }
  }

  on(root, '#submit-create', 'click', submit);
}
