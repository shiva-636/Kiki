import { App, setLoading, setError, showToast } from '../state.js?v=7.0';
import { sendAction } from '../api.js?v=7.0';
import { on, escapeHtml, avatarColor, initials } from '../dom.js?v=7.0';
import { renderScoreboard } from './scoreboard.js?v=7.0';
import { renderChat } from './chat.js?v=7.0';

const CARD_EMOJI = {
  Lion: '🦁', Tiger: '🐯', Elephant: '🐘', Fox: '🦊', Wolf: '🐺',
  Panda: '🐼', Eagle: '🦅', Shark: '🦈', Falcon: '🦜', Dolphin: '🐬',
};

export function renderThreeSet(room) {
  const you = room.you;
  const isCoordinator = you?.isCoordinator;
  const g = room.game || {};
  const phase = g.phase;
  const hand = you?.private?.hand || [];
  const canCallSet = you?.private?.canCallSet;
  const canSeeSetButton = phase === 'playing' && !g.finishOrder.includes(you?.id);
  const isMyTurn = you?.private?.isMyTurn;
  const dealerName = room.players.find((p) => p.id === g.dealerId)?.name || '?';

  if (phase === 'waiting-shuffle') {
    const isDealer = you?.id === g.dealerId;
    return `
      <div class="game-panel game-threeset">
        <p class="round-pill">Round ${room.round}</p>
        <div class="deal-block">
          <div class="card-stack" aria-hidden="true">🃏</div>
          ${isDealer ? `
            <p>You're up — shuffle to deal 3 cards to everyone.</p>
            <button class="btn btn-primary btn-lg btn-block" data-action="shuffle" type="button">Shuffle cards</button>
          ` : `<p class="waiting-note">Waiting for ${escapeHtml(dealerName)} to shuffle the cards…</p>`}
        </div>
      </div>
    `;
  }

  const selected = App.ui.selectedCardId;
  const turnName = room.players.find((p) => p.id === g.turnPlayerId)?.name;

  const handHtml = hand.map((c) => `
    <button type="button" class="playing-card ${selected === c.id ? 'is-selected' : ''}" data-card-id="${c.id}">
      <span class="playing-card-emoji">${CARD_EMOJI[c.name] || '🎴'}</span>
      <span class="playing-card-name">${escapeHtml(c.name)}</span>
    </button>
  `).join('');

  const finishRows = g.finishOrder.map((pid, i) => {
    const p = room.players.find((pp) => pp.id === pid);
    const points = i === room.players.length - 1 ? 0 : Math.max(0, 100 - 10 * i);
    return `<li><span class="finish-rank">#${i + 1}</span> ${escapeHtml(p?.name || '?')} <span class="finish-pts">+${points}</span></li>`;
  }).join('');

  const standings = `
    <div class="standings-block">
      <p class="standings-title">Hands in play</p>
      <div class="standings-grid">
        ${room.players.map((p) => `
          <div class="standing-pill ${g.finishOrder.includes(p.id) ? 'is-done' : ''} ${g.turnPlayerId === p.id ? 'is-turn' : ''}">
            <span class="mini-avatar" style="background:${avatarColor(p.seat)}">${initials(p.name)}</span>
            ${escapeHtml(p.name)}
            ${g.finishOrder.includes(p.id) ? ' ✅' : ` · ${g.handCounts?.[p.id] ?? 3}🎴`}
          </div>
        `).join('')}
      </div>
      ${g.finishOrder.length ? `<ol class="finish-list">${finishRows}</ol>` : ''}
    </div>
  `;

  const turnBanner = phase === 'playing'
    ? (isMyTurn ? `<p class="turn-banner is-you">YOUR TURN</p>` : `<p class="turn-banner">${escapeHtml(turnName || '')}'s turn to pass</p>`)
    : '';

  const lastSetName = room.players.find((p) => p.id === g.lastSetClaimerId)?.name || 'A player';
  const nextPosition = (g.finishOrder?.length || 0) + 1;
  const alertVersion = g.setAlertVersion || 0;
  const dismissedAlertVersion = Number(App.ui.dismissedSetAlertVersion || 0);
  const hasPendingSetAlert = phase === 'playing' && alertVersion > dismissedAlertVersion && !g.finishOrder.includes(you?.id);
  const setAlertOverlay = hasPendingSetAlert ? `
    <div class="set-reaction-overlay" role="alert" aria-live="assertive">
      <div class="set-reaction-card">
        <div class="set-reaction-pulse">SET!</div>
        <div class="set-reaction-sub">${escapeHtml(lastSetName)} claimed #${g.finishOrder.length}. React now!</div>
        <button class="btn btn-set btn-reaction" data-action="react-set" data-alert-version="${alertVersion}" type="button">
          SET! — GET #${nextPosition} 🃏
        </button>
        <p class="set-reaction-hint">Fastest valid reaction gets +${nextPosition === room.players.length ? 0 : Math.max(0, 100 - 10 * (nextPosition - 1))} points.</p>
      </div>
    </div>
  ` : '';

  const setButton = canSeeSetButton && !hasPendingSetAlert ? `
    <button class="btn btn-set btn-lg btn-block" data-action="call-set" type="button">SET! 🎉</button>
  ` : '';

  const setRaceStatus = phase === 'playing' && g.finishOrder.length > 0 && g.finishOrder.length < room.players.length ? `
    <p class="set-race-status">${escapeHtml(lastSetName)} claimed <b>#${g.finishOrder.length}</b> — <b>#${g.finishOrder.length + 1}</b> is live!</p>
  ` : '';

  const passControls = phase === 'playing' ? `
    <div class="hand-block">
      <p class="hand-title">Your cards</p>
      <div class="hand-grid">${handHtml}</div>
      ${isMyTurn ? `
        <button class="btn btn-primary btn-block" data-action="pass-card" type="button" ${selected ? '' : 'disabled'}>
          ${selected ? `Pass card` : 'Select a card to pass'}
        </button>
      ` : `<p class="waiting-note">Wait for your turn to pass a card.</p>`}
    </div>
  ` : `
    <div class="hand-block">
      <p class="hand-title">Your final hand</p>
      <div class="hand-grid">${handHtml}</div>
    </div>
  `;

  const roundComplete = phase === 'round-complete' ? `
    <div class="round-complete-block">
      <p>Round ${room.round} complete! 🎉</p>
      ${isCoordinator ? `<button class="btn btn-primary btn-block" data-action="next-round" type="button">Next round</button>` : `<p class="waiting-note">Waiting for the coordinator to reshuffle…</p>`}
    </div>
  ` : '';

  return `
    <div class="game-panel game-threeset">
      ${setAlertOverlay}
      <p class="round-pill">Round ${room.round}</p>
      ${turnBanner}
      ${setButton}
      ${setRaceStatus}
      ${passControls}
      ${renderChat(room)}
      ${renderScoreboard(room)}
      ${roundComplete}
      ${standings}
    </div>
  `;
}

export function mountThreeSet(root, ctx) {
  const { session, refresh } = ctx;

  on(root, '[data-action="shuffle"]', 'click', async (e, target) => {
    target.disabled = true;
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'shuffle', {});
    } catch (err) {
      setError(err);
    }
  });

  on(root, '[data-card-id]', 'click', (e, target) => {
    App.ui.selectedCardId = App.ui.selectedCardId === target.dataset.cardId ? null : target.dataset.cardId;
    refresh();
  });

  on(root, '[data-action="pass-card"]', 'click', async () => {
    if (!App.ui.selectedCardId) return;
    setLoading(true);
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'pass-card', { cardId: App.ui.selectedCardId });
      App.ui.selectedCardId = null;
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  });

  on(root, '[data-action="call-set"]', 'click', async (e, target) => {
    target.disabled = true;
    try {
      const result = await sendAction(session.roomCode, session.playerId, session.token, 'call-set', {});
      if (result?.result?.points !== undefined) {
        showToast(`SET locked — #${result.result.position} · +${result.result.points} points! 🎉`);
      }
    } catch (err) {
      setError(err);
    }
  });

  on(root, '[data-action="react-set"]', 'click', async (e, target) => {
    const alertVersionAtClick = Number(target.dataset.alertVersion || App.room?.game?.setAlertVersion || 0);
    target.disabled = true;
    target.textContent = 'CLAIMING…';
    // Consume this alert for this player immediately. A failed reaction should
    // never leave a modal stuck in CLAIMING; a newer SET alert will reopen it.
    App.ui.dismissedSetAlertVersion = alertVersionAtClick;
    try {
      const result = await sendAction(session.roomCode, session.playerId, session.token, 'call-set', {});
      if (result?.result?.points !== undefined) {
        showToast(`SET claimed — #${result.result.position} · +${result.result.points} points! 🎉`);
      }
    } catch (err) {
      const currentNextPosition = (App.room?.game?.finishOrder?.length || 0) + 1;
      target.disabled = false;
      target.textContent = `SET! — GET #${currentNextPosition} 🃏`;
      setError(err);
    }
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
