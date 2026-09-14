import { escapeHtml } from '../dom.js?v=5.1';

export function renderScoreboard(room) {
  if (room.status !== 'in-game') return '';
  const players = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0) || a.seat - b.seat);
  let previousScore = null;
  let previousRank = 0;
  const rows = players.map((p, index) => {
    const score = p.score || 0;
    const rank = score === previousScore ? previousRank : index + 1;
    previousScore = score;
    previousRank = rank;
    const isYou = p.id === room.you?.id;
    const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    return `
      <div class="score-template-row ${isYou ? 'is-you' : ''}">
        <span class="score-rank">${medal}</span>
        <span class="score-player"><span class="score-player-dot">${escapeHtml((p.name || 'P').slice(0,1).toUpperCase())}</span>${escapeHtml(p.name)}${isYou ? '<small>YOU</small>' : ''}</span>
        <span class="score-total">${score}</span>
      </div>
    `;
  }).join('');

  const gameLabels = { imposter: 'IMPOSTER', truthOrDare: 'TRUTH OR DARE', guessWho: 'GUESS WHO?', threeSet: 'THREE SET' };
  const gameLabel = gameLabels[room.currentGame] || 'KIKI';
  return `
    <section aria-label="KIKI scoreboard" class="scoreboard-section score-template">
      <div class="score-template-art" aria-hidden="true"></div>
      <div class="score-template-overlay">
        <div class="score-template-titlebar">
          <div><strong>${gameLabel}</strong><span>SCORE BOARD</span></div>
          <span class="score-template-round">ROUND ${room.round || 1}</span>
        </div>
        <div class="score-template-table">
          <div class="score-template-head"><span>#</span><span>Player</span><span>Total</span></div>
          <div class="score-template-rows">${rows}</div>
        </div>
        <div class="score-template-footer">Same people. Different chaos. ♡</div>
      </div>
    </section>
  `;
}
