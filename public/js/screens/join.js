import { App, setScreen, setSession, setRoomState, setLoading, setError, startPolling } from '../state.js?v=12.0';
import { joinRoom } from '../api.js?v=12.0';
import { on, qs, escapeHtml } from '../dom.js?v=12.0';
import { PETS } from '../pets.js?v=12.0';
import { avatarAsset, petAsset } from '../kikiAssets.js?v=12.0';
const AVATARS = [
 {id:'girl1',name:'Maya'},{id:'girl2',name:'Nina'},{id:'girl3',name:'Zara'},{id:'girl4',name:'Ivy'},{id:'girl5',name:'Luna'},
 {id:'boy1',name:'Leo'},{id:'boy2',name:'Noah'},{id:'boy3',name:'Kai'},{id:'boy4',name:'Eli'},{id:'boy5',name:'Arun'}
];

export function renderJoin() {
  const name = App.ui.name || '';
  const code = App.ui.code || '';
  const avatar = App.ui.avatar || 'girl1';
  const petType = App.ui.petType || 'cat';
  const petName = App.ui.petName || '';
  return `
    <div class="screen screen-form">
      <button class="btn-back" data-action="back" type="button" aria-label="Back to home">←</button>
      <div class="form-card">
        <div class="form-brand">KIKI</div>
        <div class="form-title-row"><span class="form-icon">👥</span><h2>Join a Room</h2></div>
        <p class="form-sub">Enter the room code and get ready to hangout!</p>

        <label class="field">
          <span class="field-label">Room Code</span>
          <input class="text-input text-input-code" id="code-input" type="text" maxlength="6" placeholder="K7F3" value="${escapeHtml(code)}" autocomplete="off" autocapitalize="characters" />
        </label>

        <label class="field">
          <span class="field-label">Your Name ♥</span>
          <input class="text-input" id="name-input" type="text" maxlength="20" placeholder="e.g. Shiva" value="${escapeHtml(name)}" autocomplete="off" />
        </label>

        <div class="field avatar-choice-field"><span class="field-label">Select Avatar</span><div class="avatar-choice-grid">${AVATARS.map(a=>`<button type="button" class="avatar-choice ${a.id===avatar?'is-selected':''}" data-avatar-choice="${a.id}" aria-pressed="${a.id===avatar}"><span class="avatar-select-art">${avatarAsset(a.id,'idle')}</span><small>${a.name}</small></button>`).join('')}</div></div>

        <div class="field pet-choice-field">
          <span class="field-label">Select Pet</span>
          <div class="pet-choice-grid">
            ${PETS.map((p) => `<button type="button" class="pet-choice ${p.id === petType ? 'is-selected' : ''}" data-pet-choice="${p.id}" aria-pressed="${p.id === petType}"><span class="pet-select-art">${petAsset(p.id,'idle')}</span><small>${p.name}</small></button>`).join('')}
          </div>
          <input class="text-input" id="pet-name-input" type="text" maxlength="16" placeholder="Give your pet a name" value="${escapeHtml(petName)}" autocomplete="off" />
        </div>

        ${App.error ? `<p class="form-error" role="alert">${escapeHtml(App.error)}</p>` : ''}

        <button class="btn btn-primary btn-lg btn-block" id="submit-join" type="button" ${App.loading ? 'disabled' : ''}>
          ${App.loading ? 'Joining…' : 'Join room'}
        </button>
      </div>
    </div>
  `;
}

export function mountJoin(root) {
  on(root, '[data-avatar-choice]', 'click', (e, target) => { App.ui.avatar = target.dataset.avatarChoice; setScreen('join', App.ui); });
  on(root, '[data-pet-choice]', 'click', (e, target) => { App.ui.petType = target.dataset.petChoice; setScreen('join', App.ui); });
  const petNameInput = qs('#pet-name-input', root);
  if (petNameInput) petNameInput.addEventListener('input', () => { App.ui.petName = petNameInput.value; });

  on(root, '[data-action="back"]', 'click', () => setScreen('home'));

  const nameInput = qs('#name-input', root);
  const codeInput = qs('#code-input', root);
  if (nameInput) {
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
    const selectedAvatar = App.ui.avatar || 'girl1';
    const selectedPet = App.ui.petType || 'cat';
    const selectedPetName = (App.ui.petName || '').trim();
    if (!name) return setError(new Error("Don't forget to add your name."));
    if (!code) return setError(new Error("Enter the room code your friend shared."));
    setLoading(true);
    try {
      const res = await joinRoom(code, name, selectedPet, selectedPetName, selectedAvatar);
      setSession({ roomCode: res.roomCode, playerId: res.playerId, token: res.token, name });
      setRoomState(res.state);
      setLoading(false);
      setScreen('room', { justJoined: true, entryActive: true, entryStartedAt: Date.now() });
      startPolling();
    } catch (err) {
      setLoading(false);
      setError(err);
    }
  }

  on(root, '#submit-join', 'click', submit);
}
