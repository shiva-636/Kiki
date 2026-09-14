import { escapeHtml } from '../dom.js?v=4.2';

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
    const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
    return `
      <div class="score-row" data-score-row style="display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:${isYou ? 'rgba(242,184,77,.12)' : 'rgba(255,255,255,.025)'};border:1px solid ${isYou ? 'rgba(242,184,77,.28)' : 'rgba(255,255,255,.06)'};">
        <span style="font-family:var(--font-display);font-weight:700;color:${rank <= 3 ? 'var(--gold)' : 'var(--muted)'};">${medal || `#${rank}`}</span>
        <span style="font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}${isYou ? ' <span style="color:var(--gold);font-size:11px;">YOU</span>' : ''}</span>
        <span style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--gold);">${score}</span>
      </div>
    `;
  }).join('');

  return `
    <section aria-label="KIKI scoreboard" class="scoreboard-section">
      <div class="scoreboard-header">
        <div>
          <p class="scoreboard-title">🏆 Scoreboard</p>
          <p class="scoreboard-subtitle">Highest score ranks first</p>
        </div>
        <span class="scoreboard-count">${players.length} players</span>
      </div>
      <div class="scoreboard-rows">${rows}</div>
    </section>
  `;
}
