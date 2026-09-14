import { App, setScreen, setSession, setRoomState, setLoading, setError, startPolling } from '../state.js?v=6.0';
import { joinRoom } from '../api.js?v=6.0';
import { on, qs, escapeHtml } from '../dom.js?v=6.0';

export function renderJoin() {
  const name = App.ui.name || '';
  const code = App.ui.code || '';
  return `
    <div class="screen screen-form">
      <button class="btn-back" data-action="back" type="button" aria-label="Back to home">←</button>
      <div class="form-card">
        <div class="form-kicker">JOIN THE SQUAD</div>
        <h2>Join a room</h2>
        <p class="form-sub">Ask the coordinator for the room code.</p>

        <label class="field">
          <span class="field-label">Your name</span>
          <input class="text-input" id="name-input" type="text" maxlength="20" placeholder="e.g. Prathap" value="${escapeHtml(name)}" autocomplete="off" />
        </label>

        <label class="field">
          <span class="field-label">Room code</span>
          <input class="text-input text-input-code" id="code-input" type="text" maxlength="6" placeholder="K7P4XQ" value="${escapeHtml(code)}" autocomplete="off" autocapitalize="characters" />
        </label>

        ${App.error ? `<p class="form-error" role="alert">${escapeHtml(App.error)}</p>` : ''}

        <button class="btn btn-primary btn-lg btn-block" id="submit-join" type="button" ${App.loading ? 'disabled' : ''}>
          ${App.loading ? 'Joining…' : 'Join room'}
        </button>
      </div>
    </div>
  `;
}

export function mountJoin(root) {
  on(root, '[data-action="back"]', 'click', () => setScreen('home'));

  const nameInput = qs('#name-input', root);
  const codeInput = qs('#code-input', root);
  if (nameInput) {
    nameInput.focus();
    nameInput.addEventListener('input', () => { App.ui.name = nameInput.value; });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      App.ui.code = codeInput.value;
    });
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  async function submit() {
    const name = (App.ui.name || '').trim();
    const code = (App.ui.code || '').trim().toUpperCase();
    if (!name) return setError(new Error("Don't forget to add your name."));
    if (!code) return setError(new Error("Enter the room code your friend shared."));
    setLoading(true);
    try {
      const res = await joinRoom(code, name);
      setSession({ roomCode: res.roomCode, playerId: res.playerId, token: res.token, name });
      setRoomState(res.state);
      setLoading(false);
      setScreen('room', { justJoined: true });
      startPolling();
    } catch (err) {
      setLoading(false);
      setError(err);
    }
  }

  on(root, '#submit-join', 'click', submit);
}
