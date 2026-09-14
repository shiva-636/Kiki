import { setScreen } from '../state.js?v=4.2';
import { on } from '../dom.js?v=4.2';

export function renderHome() {
  return `
    <div class="screen screen-home">
      <div class="home-glow" aria-hidden="true"></div>
      <div class="home-content">
        <div class="home-eyebrow"><span></span> PARTY MODE <span></span></div>
        <div class="brand-mark">
          <span class="crown" aria-hidden="true">✦</span>
          <h1 class="wordmark">KIKI</h1>
          <p class="tagline">More games. More chaos.</p>
        </div>
        <p class="home-blurb">Gather your people. Pick a game. Let the chaos begin.</p>
        <div class="home-actions">
          <button class="btn btn-primary btn-lg" data-action="create" type="button">Create room</button>
          <button class="btn btn-secondary btn-lg" data-action="join" type="button">Join room</button>
        </div>
      </div>
      <div class="home-footer"><span class="produced-by">A SASU PRODUCT</span><span class="home-footer-dot">•</span><span>Made for game night</span></div>
    </div>
  `;
}

export function mountHome(root) {
  on(root, '[data-action="create"]', 'click', () => setScreen('create'));
  on(root, '[data-action="join"]', 'click', () => setScreen('join'));
}
