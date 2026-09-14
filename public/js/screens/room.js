import { App, setScreen, setRoomState, clearSession, setError, setLoading, showToast, stopPolling } from '../state.js?v=7.0';
import { selectGame, leaveRoom as apiLeaveRoom, closeGame as apiCloseGame, sendAction } from '../api.js?v=7.0';
import { on, escapeHtml, initials, avatarColor } from '../dom.js?v=7.0';
import { getRoomImage, getSeatLayout } from '../seatLayouts.js?v=7.0';
import { renderImposter, mountImposter } from '../games/imposter.js?v=7.0';
import { renderWheelGame, mountWheelGame } from '../games/wheelGame.js?v=7.0';
import { renderThreeSet, mountThreeSet } from '../games/threeSet.js?v=7.0';
import { renderChat, mountChat } from '../games/chat.js?v=7.0';

const GAMES = [
  { id: 'imposter', emoji: '🕵️', name: 'Imposter', min: 3 },
  { id: 'truthOrDare', emoji: '🎡', name: 'Truth or Dare', min: 3 },
  { id: 'guessWho', emoji: '🧠', name: 'Guess Who?', min: 3 },
  { id: 'threeSet', emoji: '🃏', name: 'Three Set', min: 4 },
];

function renderSeats(room) {
  const layout = getSeatLayout(room.maxPlayers);
  const bg = getRoomImage(room.maxPlayers);
  const bySeat = new Map(room.players.map((p) => [p.seat, p]));

  if (!App.ui.knownPlayerIds) App.ui.knownPlayerIds = new Set();
  const known = App.ui.knownPlayerIds;

  const badges = layout.map((pos, seat) => {
    const player = bySeat.get(seat);
    const isYou = player && room.you && player.id === room.you.id;
    if (!player) {
      return `
        <div class="seat empty-seat" style="left:${pos.x}%; top:${pos.y}%">
          <span class="seat-avatar seat-avatar-empty">＋</span>
          <span class="seat-label seat-label-empty">Open seat</span>
        </div>
      `;
    }
    const isNew = !known.has(player.id);
    return `
      <div class="seat filled-seat ${isYou ? 'is-you' : ''}" style="left:${pos.x}%; top:${pos.y}%" ${isNew ? 'data-seat-enter' : ''}>
        <span class="seat-avatar" style="background:${avatarColor(player.seat)}">${initials(player.name)}</span>
        <span class="seat-label">${escapeHtml(player.name)}${player.isCoordinator ? ' <span class="tiny-crown" title="Coordinator">👑</span>' : ''}</span>
      </div>
    `;
  }).join('');

  App.ui.knownPlayerIds = new Set(room.players.map((p) => p.id));

  return `
    <div class="room-visual" style="background-image:url('${bg}')">
      ${badges}
    </div>
  `;
}

function renderWaitingPanel(room) {
  const filled = room.players.length;
  const isCoordinator = room.you?.isCoordinator;
  const waText = encodeURIComponent(`Join my KIKI room “${room.roomName || 'KIKI Room'}”! Code: ${room.roomCode} 🎉`);

  return `
    <div class="waiting-panel">
      <div class="room-code-block">
        <p class="room-code-label">ROOM CODE</p>
        <p class="room-code-value">${room.roomCode}</p>
        <div class="room-code-actions">
          <button class="btn btn-secondary" data-action="copy-code" type="button">Copy code</button>
          <a class="btn btn-whatsapp" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener">💬 Share room on WhatsApp</a>
        </div>
      </div>
      <p class="squad-status">${filled >= room.maxPlayers ? 'THE SQUAD IS COMPLETE 🔥' : `Waiting for the squad… ${filled}/${room.maxPlayers} seated`}</p>

      ${isCoordinator ? `
        <div class="game-grid ${App.ui.gameStartPending ? 'game-grid-starting' : ''}">
          ${GAMES.map((g) => {
            const enabled = room.canStart[g.id];
            const pending = App.ui.gameStartPending === g.id;
            const locked = Boolean(App.ui.gameStartPending);
            return `
              <button type="button" class="game-card ${enabled && !locked ? '' : 'is-disabled'} ${pending ? 'is-starting' : ''}" data-select-game="${g.id}" ${enabled && !locked ? '' : 'disabled aria-disabled="true"'}>
                <span class="game-card-emoji">${pending ? '⏳' : g.emoji}</span>
                <span class="game-card-name">${pending ? 'Starting…' : g.name}</span>
                ${!enabled && !locked ? `<span class="game-card-hint">Needs ${g.min}+ players</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      ` : `<p class="waiting-note">Waiting for the coordinator to choose a game…</p>`}
    </div>
  `;
}


function renderSwitchGame(room) {
  if (room.status !== 'in-game' || !room.you?.isCoordinator) return '';
  const games = GAMES.filter((g) => room.canStart[g.id]);
  return `
    <div class="switch-game-panel">
      <p class="switch-game-title">Switch Game</p>
      <p class="switch-game-note">Keep the same room, players and Room Name. The selected game starts fresh.</p>
      <div class="switch-game-grid">
        ${games.map((g) => `<button class="btn btn-secondary switch-game-btn" data-switch-game="${g.id}" type="button"><span>${g.emoji}</span>${g.name}</button>`).join('')}
      </div>
    </div>`;
}

const GAME_RENDERERS = {
  imposter: renderImposter,
  truthOrDare: (room) => renderWheelGame(room, 'truthOrDare'),
  guessWho: (room) => renderWheelGame(room, 'guessWho'),
  threeSet: renderThreeSet,
};

export function renderRoom() {
  const room = App.room;
  if (!room) return `<div class="screen screen-room"><p class="loading-note">Loading room…</p></div>`;

  return `
    <div class="screen screen-room">
      <header class="room-topbar">
        <div class="room-topbar-room">
          <span class="room-topbar-brand"><b>K</b>IKI</span>
          <div class="room-topbar-name" title="${escapeHtml(room.roomName || 'KIKI Room')}">${escapeHtml(room.roomName || 'KIKI Room')}</div>
        </div>
        <button class="room-code-pill" data-action="copy-code" type="button" title="Copy room code">${room.roomCode}</button>
        <div class="room-topbar-actions">
          ${room.you?.isCoordinator ? `<button class="btn-icon" data-action="close-game" aria-label="Close game" title="Close game">✕</button>` : ''}
          <button class="btn-icon" data-action="leave" aria-label="Leave room">🚪</button>
        </div>
      </header>

      ${renderSeats(room)}

      <main class="room-main">
        ${room.status === 'waiting' ? renderWaitingPanel(room) : `${GAME_RENDERERS[room.currentGame] ? GAME_RENDERERS[room.currentGame](room) : ''}${renderSwitchGame(room)}`}
      </main>

      ${App.toast ? `<div class="toast" role="status">${escapeHtml(App.toast.text)}</div>` : ''}
    </div>
  `;
}

export function mountRoom(root) {
  const room = App.room;
  if (!room) return;
  const session = App.session;
  const refresh = () => setScreen('room', App.ui);

  on(root, '[data-action="copy-code"]', 'click', async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      showToast('Room code copied 📋');
    } catch {
      showToast(`Room code: ${room.roomCode}`);
    }
  });


  on(root, '[data-action="close-game"]', 'click', async () => {
    if (!confirm('Close this game? All temporary room, game, and score data will be deleted for everyone.')) return;
    setLoading(true);
    try {
      await apiCloseGame(session.roomCode, session.playerId, session.token);
      stopPolling();
      clearSession();
      setScreen('home');
      showToast('Game closed. Temporary data deleted.');
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  });

  on(root, '[data-action="leave"]', 'click', async () => {
    if (!confirm('Leave this room?')) return;
    setLoading(true);
    try {
      await apiLeaveRoom(session.roomCode, session.playerId, session.token);
      stopPolling();
      clearSession();
      setScreen('home');
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  });

  on(root, '[data-switch-game]', 'click', async (e, target) => {
    const game = target.dataset.switchGame;
    const meta = GAMES.find((g) => g.id === game);
    if (!meta || App.ui.gameSwitchPending) return;
    if (!confirm(`Switch to ${meta.name}? The current game round will end and ${meta.name} will start fresh. Your room and players stay.`)) return;
    App.ui.gameSwitchPending = game;
    refresh();
    try {
      const result = await sendAction(session.roomCode, session.playerId, session.token, 'switch-game', { game });
      App.ui.gameSwitchPending = null;
      setRoomState(result.state);
    } catch (err) {
      App.ui.gameSwitchPending = null;
      setError(err);
    }
  });

  on(root, '[data-select-game]', 'click', async (e, target) => {
    const game = target.dataset.selectGame;
    if (App.ui.gameStartPending) return;

    // Lock immediately so a double-tap can never fire two requests.
    App.ui.gameStartPending = game;
    refresh();

    try {
      const result = await selectGame(session.roomCode, session.playerId, session.token, game);
      // The selection response already contains the authoritative new room state,
      // so don't make the coordinator wait for the next polling tick.
      App.ui.gameStartPending = null;
      setRoomState(result.state);
    } catch (err) {
      App.ui.gameStartPending = null;
      setError(err);
    }
  });


  if (room.status === 'in-game' && room.currentGame) {
    const ctx = { room, session, refresh };
    if (room.currentGame === 'imposter') mountImposter(root, ctx);
    else if (room.currentGame === 'truthOrDare') mountWheelGame(root, ctx, 'truthOrDare');
    else if (room.currentGame === 'guessWho') mountWheelGame(root, ctx, 'guessWho');
    else if (room.currentGame === 'threeSet') mountThreeSet(root, ctx);
    mountChat(root, ctx);
  }
}
