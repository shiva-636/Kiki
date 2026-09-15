import { App, setLoading, setError, showToast } from '../state.js?v=7.0';
import { sendAction } from '../api.js?v=7.0';
import { on, escapeHtml, avatarColor } from '../dom.js?v=7.0';
import { prefersReducedMotion } from '../dom.js?v=7.0';
import { renderChat } from './chat.js?v=7.0';
import { renderScoreboard } from './scoreboard.js?v=7.0';

const CONFIG = {
  truthOrDare: {
    title: "WHO'S NEXT?",
    spinLabel: 'Spin',
    respinLabel: 'Spin again',
    resultPrefix: "IT'S",
    resultSuffix: '! 👀',
    selfMessage: null,
    discussPrompt: 'Choose Truth or Dare, then continue everything in the KIKI group chat.',
  },
  guessWho: {
    title: 'WHO WILL THINK OF SOMEONE?',
    spinLabel: 'Spin',
    respinLabel: 'Next round — spin',
    resultPrefix: '',
    resultSuffix: ' IS THE THINKER 🧠',
    selfMessage: "YOU'RE THE THINKER — imagine someone in your mind, then confirm below. Don't tell anyone who it is!",
    discussPrompt: 'Ask yes/no questions in the KIKI group chat. The Thinker answers with the Yes/No buttons.',
  },
};

function buildWheelSvg(names, colors, rotationDeg) {
  const n = names.length;
  const size = 280;
  const r = 128;
  const cx = size / 2;
  const cy = size / 2;
  const slice = 360 / n;
  let paths = '';
  let labels = '';
  for (let i = 0; i < n; i++) {
    const a0 = (slice * i - 90) * (Math.PI / 180);
    const a1 = (slice * (i + 1) - 90) * (Math.PI / 180);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = slice > 180 ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${colors[i]}" stroke="#14111A" stroke-width="2"/>`;
    const mid = (a0 + a1) / 2;
    const lx = cx + (r * 0.62) * Math.cos(mid);
    const ly = cy + (r * 0.62) * Math.sin(mid);
    const rot = (slice * i + slice / 2);
    labels += `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(2)} ${ly.toFixed(2)})" text-anchor="middle" dominant-baseline="middle" class="wheel-label">${escapeHtml(names[i])}</text>`;
  }
  return `
    <svg viewBox="0 0 ${size} ${size}" class="wheel-svg" style="transform: rotate(${rotationDeg}deg)" role="img" aria-label="Player selection wheel">
      <circle cx="${cx}" cy="${cy}" r="${r + 4}" class="wheel-ring" />
      ${paths}
      ${labels}
      <circle cx="${cx}" cy="${cy}" r="14" class="wheel-hub" />
    </svg>
  `;
}

export function renderWheelGame(room, game) {
  const cfg = CONFIG[game];
  const you = room.you;
  const isCoordinator = you?.isCoordinator;
  const g = room.game || {};
  const selectedId = game === 'guessWho' ? g.thinkerId : g.lastSelected;
  const truthReceiverId = game === 'truthOrDare' ? (g.truthReceiverId || g.lastSelected) : null;
  const truthAskerId = game === 'truthOrDare' ? g.truthAskerId : null;
  const wheelOrder = (g.wheelOrder && g.wheelOrder.length) ? g.wheelOrder : room.players.map((p) => p.id);
  const names = wheelOrder.map((id) => room.players.find((p) => p.id === id)?.name || '?');
  const colors = wheelOrder.map((id) => avatarColor(room.players.find((p) => p.id === id)?.seat || 0));

  const n = names.length;
  const slice = 360 / n;
  let rotationDeg = App.ui.wheelRotation || 0;
  const spinToken = g.spinToken || null;

  if (selectedId && spinToken && App.ui.lastSpinToken !== spinToken) {
    const idx = wheelOrder.indexOf(selectedId);
    const targetAngle = 360 - (slice * idx + slice / 2); // rotate wheel so slice lands under top pointer
    const extraSpins = prefersReducedMotion() ? 0 : 360 * 4;
    rotationDeg = (App.ui.wheelRotation || 0) - ((App.ui.wheelRotation || 0) % 360) + extraSpins + targetAngle;
    App.ui.wheelRotation = rotationDeg;
    App.ui.lastSpinToken = spinToken;
    App.ui.wheelJustLanded = true;
  }

  const selectedName = selectedId ? (room.players.find((p) => p.id === selectedId)?.name) : null;
  const isMeSelected = selectedId && you && selectedId === you.id;
  const truthReceiverName = truthReceiverId ? (room.players.find((p) => p.id === truthReceiverId)?.name || '?') : null;
  const truthAskerName = truthAskerId ? (room.players.find((p) => p.id === truthAskerId)?.name || '?') : null;
  const receiverIdx = truthReceiverId ? wheelOrder.indexOf(truthReceiverId) : -1;
  const askerIdx = truthAskerId ? wheelOrder.indexOf(truthAskerId) : -1;
  const receiverAngle = receiverIdx >= 0 ? (slice * receiverIdx + slice / 2 + rotationDeg) : 0;
  const askerAngle = askerIdx >= 0 ? (slice * askerIdx + slice / 2 + rotationDeg) : 0;
  const truthNeedles = game === 'truthOrDare' && truthReceiverId && truthAskerId ? `
    <div class="td-needle td-needle-red" style="--td-angle:${receiverAngle.toFixed(2)}deg" aria-label="Red needle: ${escapeHtml(truthReceiverName)} answers or does the dare"></div>
    <div class="td-needle td-needle-blue" style="--td-angle:${askerAngle.toFixed(2)}deg" aria-label="Blue needle: ${escapeHtml(truthAskerName)} asks or gives the dare"></div>
    <div class="td-needle-hub" aria-hidden="true"></div>
  ` : '';
  const thinkerPopup = game === 'guessWho' && isMeSelected && !g.thinkerConfirmed ? `
    <div class="action-popup" role="dialog" aria-label="Thinker action">
      <div class="action-popup-icon">🧠</div>
      <p class="action-popup-title">You’re the Thinker</p>
      <p class="action-popup-text">Imagine someone in your mind. Don't tell anyone who it is.</p>
      <button class="btn btn-primary btn-block" data-action="confirm-thinker" type="button">I imagined someone 🧠</button>
    </div>
  ` : '';
  const truthDarePopup = game === 'truthOrDare' && truthReceiverId && truthAskerId && isMeSelected && !g.chosenType ? `
    <div class="action-popup" role="dialog" aria-label="Truth or Dare choice">
      <div class="action-popup-icon">🎡</div>
      <p class="action-popup-title">You’re up!</p>
      <p class="action-popup-text">You are the 🔴 red player. Choose Truth or Dare. <strong>${escapeHtml(truthAskerName)}</strong> is the 🔵 blue player who will ask/give it.</p>
      <div class="action-popup-actions">
        <button class="btn btn-primary" data-action="choose-truth" type="button">💬 Truth</button>
        <button class="btn btn-secondary" data-action="choose-dare" type="button">🔥 Dare</button>
      </div>
    </div>
  ` : '';
  const thinkerAnswers = game === 'guessWho' && isMeSelected && g.thinkerConfirmed ? `
    <div class="action-popup thinker-answer-panel" role="group" aria-label="Answer yes or no">
      <div class="action-popup-icon">💭</div>
      <p class="action-popup-title">Answer the questions</p>
      <p class="action-popup-text">Use these buttons whenever the group asks you a yes/no question.</p>
      <div class="action-popup-actions">
        <button class="btn btn-primary" data-action="answer-yes" type="button">✅ Yes</button>
        <button class="btn btn-secondary" data-action="answer-no" type="button">❌ No</button>
      </div>
    </div>
  ` : '';

  const resultBanner = game === 'truthOrDare' && truthReceiverId && truthAskerId ? `
    <div class="wheel-result td-role-result ${App.ui.wheelJustLanded ? 'is-fresh' : ''}">
      <p class="wheel-result-text td-red-result">🔴 ${escapeHtml(truthReceiverName).toUpperCase()} — ANSWERS / DOES DARE</p>
      <p class="wheel-result-text td-blue-result">🔵 ${escapeHtml(truthAskerName).toUpperCase()} — ASKS / GIVES DARE</p>
    </div>
  ` : selectedId ? `
    <div class="wheel-result ${App.ui.wheelJustLanded ? 'is-fresh' : ''}">
      ${game === 'guessWho' && isMeSelected ? `<p class="wheel-result-text you">${cfg.selfMessage}</p>` : ''}
      ${!(game === 'guessWho' && isMeSelected) ? `<p class="wheel-result-text">${cfg.resultPrefix} ${escapeHtml(selectedName).toUpperCase()}${cfg.resultSuffix}</p>` : ''}
    </div>
  ` : `<p class="wheel-idle-hint">Tap spin to pick a player.</p>`;

  const guessWhoScoring = game === 'guessWho' && selectedId && isMeSelected && g.thinkerConfirmed ? `
    <div class="coord-panel thinker-results-panel">
      <p class="coord-title">${g.resultsRecorded ? 'Results locked ✅' : 'Who guessed correctly?'}</p>
      ${!g.resultsRecorded ? `
        <p class="waiting-note">Select the player or players who guessed the person correctly, then lock the results.</p>
        <div class="chip-grid">
          ${room.players.filter((p) => p.id !== selectedId).map((p) => `
            <button type="button" class="chip ${App.ui.selectedCorrect?.has(p.id) ? 'is-selected' : ''}" data-toggle-correct="${p.id}">${escapeHtml(p.name)}</button>
          `).join('')}
        </div>
        <button class="btn btn-primary btn-block" data-action="confirm-guess-results" type="button">Lock results & award points</button>
      ` : `<p class="waiting-note">Correct guessers automatically received +10 points each.</p>`}
    </div>
  ` : (game === 'guessWho' && selectedId ? `<p class="waiting-note">${g.resultsRecorded ? 'Results are locked. The coordinator can start the next round.' : 'The Thinker will lock the correct guessers.'}</p>` : '');

  const spinBlocked = game === 'guessWho' && selectedId && !g.resultsRecorded;



  return `
    <div class="game-panel game-wheel">
      <p class="round-pill">Round ${room.round}</p>
      <h3 class="wheel-title">${cfg.title}</h3>
      <div class="wheel-wrap">
        ${game === 'guessWho' ? '<div class="wheel-pointer" aria-hidden="true">▼</div>' : ''}
        ${buildWheelSvg(names, colors, rotationDeg)}
        ${truthNeedles}
      </div>
      ${resultBanner}
      ${isCoordinator ? `
        <button class="btn btn-primary btn-lg btn-block" data-action="spin" type="button" ${spinBlocked ? 'disabled' : ''}>${selectedId ? cfg.respinLabel : cfg.spinLabel}</button>
      ` : `<p class="waiting-note">Waiting for the coordinator to spin…</p>`}
      ${thinkerPopup}
      ${thinkerAnswers}
      ${truthDarePopup}
      ${selectedId ? `<p class="wheel-chat-hint">${game === 'truthOrDare' ? '🔴 Receiver faces it · 🔵 Asker/Giver gives it. Choose Truth or Dare, then continue in the KIKI group chat.' : escapeHtml(cfg.discussPrompt)}</p>` : ''}
      ${renderChat(room)}
      ${renderScoreboard(room)}
      ${guessWhoScoring}
    </div>
  `;
}

export function mountWheelGame(root, ctx, game) {
  const { session, refresh } = ctx;
  App.ui.wheelJustLanded = false;

  on(root, '[data-action="confirm-thinker"]', 'click', async (e, target) => {
    target.disabled = true;
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'confirm-thinker', {});
      showToast('Posted to the group chat 🧠');
    } catch (err) { setError(err); }
  });

  on(root, '[data-action="answer-yes"]', 'click', async (e, target) => {
    target.disabled = true;
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'answer-question', { answer: 'yes' });
    } catch (err) { setError(err); }
    finally { target.disabled = false; }
  });

  on(root, '[data-action="answer-no"]', 'click', async (e, target) => {
    target.disabled = true;
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'answer-question', { answer: 'no' });
    } catch (err) { setError(err); }
    finally { target.disabled = false; }
  });

  on(root, '[data-action="choose-truth"]', 'click', async (e, target) => {
    target.disabled = true;
    const buttons = root.querySelectorAll('[data-action="choose-truth"], [data-action="choose-dare"]');
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'choose-truth-dare', { choice: 'truth' });
      showToast('Truth posted to the group chat 💬');
    } catch (err) { setError(err); }
  });

  on(root, '[data-action="choose-dare"]', 'click', async (e, target) => {
    target.disabled = true;
    const buttons = root.querySelectorAll('[data-action="choose-truth"], [data-action="choose-dare"]');
    buttons.forEach((b) => { b.disabled = true; });
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'choose-truth-dare', { choice: 'dare' });
      showToast('Dare posted to the group chat 🔥');
    } catch (err) { setError(err); }
  });

  on(root, '[data-action="spin"]', 'click', async (e, target) => {
    target.disabled = true;
    App.ui.selectedCorrect = new Set();
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'spin', {});
    } catch (err) {
      setError(err);
    }
  });

  on(root, '[data-toggle-correct]', 'click', (e, target) => {
    if (!App.ui.selectedCorrect) App.ui.selectedCorrect = new Set();
    const id = target.dataset.toggleCorrect;
    if (App.ui.selectedCorrect.has(id)) App.ui.selectedCorrect.delete(id);
    else App.ui.selectedCorrect.add(id);
    refresh();
  });

  on(root, '[data-action="confirm-guess-results"]', 'click', async () => {
    setLoading(true);
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'record-correct', {
        correctPlayerIds: Array.from(App.ui.selectedCorrect || []),
      });
      showToast('Results locked. Correct guessers received +10 each.');
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  });

  setTimeout(() => { App.ui.wheelJustLanded = false; }, 2400);
}
