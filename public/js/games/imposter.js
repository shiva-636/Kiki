import { App, setLoading, setError, showToast } from '../state.js?v=7.0';
import { sendAction } from '../api.js?v=7.0';
import { on, escapeHtml } from '../dom.js?v=7.0';
import { renderScoreboard } from './scoreboard.js?v=7.0';
import { renderChat } from './chat.js?v=7.0';

function ensureRoundUi(room) {
  if (App.ui.imposterRound !== room.round) {
    App.ui.imposterRound = room.round;
    App.ui.imposterView = 'hidden';
    App.ui.imposterVote = null;
  }
}

export function renderImposter(room) {
  ensureRoundUi(room);
  const you = room.you;
  const isCoordinator = you?.isCoordinator;
  const word = you?.private?.word;
  const view = App.ui.imposterView || 'hidden';
  const voteLocked = Boolean(you?.private?.voteLocked);
  const myVote = you?.private?.vote || App.ui.imposterVote;
  const resultsRecorded = Boolean(room.game?.resultsRecorded);
  const lockedCount = room.game?.lockedCount || 0;
  const totalPlayers = room.game?.totalPlayers || room.players.length;

  const revealCard = `
    <div class="reveal-card ${view}">
      ${view === 'hidden' ? `
        <p class="reveal-label">YOUR SECRET WORD</p>
        <button class="reveal-flip" data-action="reveal" type="button" aria-label="Tap to reveal your word">
          <span class="reveal-flip-icon">🕵️</span>
          <span>Tap to reveal</span>
        </button>
      ` : `
        <p class="reveal-label">YOUR SECRET WORD</p>
        <p class="reveal-word">${escapeHtml(word || '')}</p>
        <p class="reveal-hint">Keep it secret 🤫</p>
        <button class="btn btn-secondary" data-action="back-to-room" type="button">Hide word</button>
      `}
    </div>
  `;

  const discuss = renderChat(room);

  const targets = room.players.filter((p) => p.id !== you?.id);
  const votePanel = resultsRecorded ? `
    <div class="coord-panel">
      <p class="coord-title">Round ${room.round} complete 🎉</p>
      <p class="waiting-note">The imposter was <strong>${escapeHtml(room.players.find((p) => p.id === room.game.imposterId)?.name || 'Unknown')}</strong>.</p>
      <p class="waiting-note">Correct players automatically received <strong>+10</strong>. Check the scoreboard above for the live ranking.</p>
      ${isCoordinator ? `<button class="btn btn-primary btn-block" data-action="next-round" type="button">Next round</button>` : `<p class="waiting-note">Waiting for the coordinator to start the next round…</p>`}
    </div>
  ` : `
    <div class="coord-panel">
      <p class="coord-title">Lock your guess</p>
      <p class="waiting-note">Choose who you think the imposter is. Your vote stays private until everyone locks.</p>
      <div class="chip-grid">
        ${targets.map((p) => `
          <button type="button" class="chip ${myVote === p.id ? 'is-selected' : ''}" data-vote-player="${p.id}" ${voteLocked ? 'disabled' : ''}>
            ${escapeHtml(p.name)}
          </button>
        `).join('')}
      </div>
      ${voteLocked ? `
        <p class="waiting-note">🔒 Your vote is locked. Waiting for the rest of the squad…</p>
      ` : `
        <button class="btn btn-primary btn-block" data-action="lock-vote" type="button" ${myVote ? '' : 'disabled'}>🔒 Lock my vote</button>
      `}
      <div style="margin-top:12px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.035);color:var(--muted);font-size:13px;text-align:center;">
        ${lockedCount}/${totalPlayers} players locked their vote
      </div>
    </div>
  `;

  return `
    <div class="game-panel game-imposter">
      <p class="round-pill">Round ${room.round}</p>
      ${revealCard}
      ${discuss}
      ${renderScoreboard(room)}
      ${votePanel}
    </div>
  `;
}

export function mountImposter(root, ctx) {
  const { session, refresh } = ctx;

  on(root, '[data-action="reveal"]', 'click', () => {
    App.ui.imposterView = 'revealed';
    refresh();
  });
  on(root, '[data-action="back-to-room"]', 'click', () => {
    App.ui.imposterView = 'hidden';
    refresh();
  });

  on(root, '[data-vote-player]', 'click', (e, target) => {
    if (target.disabled) return;
    App.ui.imposterVote = target.dataset.votePlayer;
    refresh();
  });

  on(root, '[data-action="lock-vote"]', 'click', async () => {
    const targetPlayerId = App.ui.imposterVote;
    if (!targetPlayerId) return;
    setLoading(true);
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'lock-vote', { targetPlayerId });
      showToast('Vote locked 🔒');
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  });

  on(root, '[data-action="next-round"]', 'click', async () => {
    setLoading(true);
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'next-round', {});
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  });
}
