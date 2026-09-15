import { escapeHtml, avatarColor, initials } from '../dom.js?v=7.0';

const SCORE_GAMES = new Set(['imposter', 'guessWho', 'threeSet']);

export function renderScoreboard(room) {
  if (room.status !== 'in-game' || !SCORE_GAMES.has(room.currentGame)) return '';
  const players = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0) || a.seat - b.seat);
  let previousScore = null;
  let previousRank = 0;
  const rows = players.map((p, index) => {
    const score = Number(p.score || 0);
    const rank = score === previousScore ? previousRank : index + 1;
    previousScore = score;
    previousRank = rank;
    const isYou = p.id === room.you?.id;
    return `
      <div class="score-row ${isYou ? 'is-you' : ''}">
        <span class="score-rank">${rank === 1 ? '👑' : `#${rank}`}</span>
        <span class="score-player">
          <span class="score-avatar" style="background:${avatarColor(p.seat)}">${escapeHtml(initials(p.name))}</span>
          <span class="score-player-name">${escapeHtml(p.name)}</span>
          ${isYou ? '<small>YOU</small>' : ''}
        </span>
        <strong class="score-total">${score}</strong>
      </div>`;
  }).join('');
  const labels = { imposter: 'IMPOSTER', guessWho: 'GUESS WHO?', threeSet: 'THREE SET' };
  return `
    <section class="scoreboard-section" aria-label="KIKI scoreboard">
      <div class="scoreboard-heading">
        <div><span class="scoreboard-kicker">KIKI</span><h3>${labels[room.currentGame] || 'GAME'} SCOREBOARD</h3></div>
        <span class="score-round">ROUND ${room.round || 1}</span>
      </div>
      <div class="score-table">
        <div class="score-head"><span>#</span><span>PLAYER</span><span>POINTS</span></div>
        ${rows}
      </div>
    </section>`;
}
