import { App, setError } from '../state.js?v=5.0';
import { sendAction } from '../api.js?v=5.0';
import { on, escapeHtml } from '../dom.js?v=5.0';

const WALLPAPER_COUNT = 51;
const DEFAULT_WALLPAPER = WALLPAPER_COUNT;
const WALLPAPER_KEY = 'kiki.chatWallpaper';
const CHAT_MAX_LENGTH = 300;

function getWallpaperId() {
  const n = Number.parseInt(localStorage.getItem(WALLPAPER_KEY) || '', 10);
  return Number.isInteger(n) && n >= 1 && n <= WALLPAPER_COUNT ? n : DEFAULT_WALLPAPER;
}

function wallpaperUrl(id) {
  return `/assets/chat-wallpapers/chat-${String(id).padStart(2, '0')}.jpg`;
}

function renderWallpaperPicker() {
  const selected = getWallpaperId();
  const items = Array.from({ length: WALLPAPER_COUNT }, (_, i) => i + 1).map((id) => `
    <button class="chat-wallpaper-option ${id === selected ? 'is-selected' : ''}" data-chat-wallpaper="${id}" type="button" aria-label="Chat wallpaper ${id}" aria-pressed="${id === selected}">
      <img src="${wallpaperUrl(id)}" alt="" loading="lazy" />
      <span>${id}</span>
    </button>
  `).join('');
  return `
    <div class="chat-wallpaper-popover" data-chat-wallpaper-picker hidden>
      <div class="chat-wallpaper-head">
        <div>
          <strong>Chat wallpaper</strong>
          <small>Only this chat area changes</small>
        </div>
        <button class="btn-icon chat-wallpaper-close" data-chat-wallpaper-close type="button" aria-label="Close wallpaper picker">✕</button>
      </div>
      <div class="chat-wallpaper-grid">${items}</div>
    </div>
  `;
}

export function renderChat(room) {
  const rawMessages = Array.isArray(room.chat) ? room.chat.filter((m) => !m.round || m.round === room.round) : [];
  const seenMessageIds = new Set();
  const messages = rawMessages.filter((m) => {
    const id = String(m.id || '');
    if (!id || seenMessageIds.has(id)) return false;
    seenMessageIds.add(id);
    return true;
  });
  const you = room.you?.id;
  const wallpaper = getWallpaperId();
  return `
    <section class="chat-section" aria-label="${escapeHtml(room.roomName || 'KIKI Room')} chat" style="--chat-wallpaper:url('${wallpaperUrl(wallpaper)}')">
      <div class="chat-header">
        <div>
          <p class="chat-title">💬 ${escapeHtml(room.roomName || 'KIKI Room')}</p>
          <p class="chat-subtitle">Group chat · Private to this room · Round ${room.round}</p>
        </div>
        <div class="chat-header-actions">
          <button class="chat-wallpaper-button" data-chat-wallpaper-open type="button" title="Change chat wallpaper">🖼️ Wallpaper</button>
          <span class="chat-live"><span></span> LIVE</span>
        </div>
      </div>
      ${renderWallpaperPicker()}
      <div class="chat-messages" data-chat-messages>
        ${messages.length ? messages.map((m) => `
          <div class="chat-message ${m.system ? 'is-system' : ''} ${m.playerId === you ? 'is-you' : ''}" data-message-id="${escapeHtml(m.id)}">
            <div class="chat-message-meta">
              <span>${escapeHtml(m.system ? 'KIKI' : (m.playerName || 'Player'))}</span>
              <time datetime="${new Date(m.ts || Date.now()).toISOString()}">${new Date(m.ts || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
            </div>
            <div class="chat-message-bubble">${escapeHtml(m.text)}</div>
          </div>
        `).join('') : `<p class="chat-empty">No messages yet. Start the chaos 👀</p>`}
      </div>
      <form class="chat-composer" data-chat-form>
        <input class="text-input chat-input" data-chat-input maxlength="${CHAT_MAX_LENGTH}" autocomplete="off" placeholder="Type a message…" value="${escapeHtml(App.ui.chatDraft || '')}" aria-label="Chat message" />
        <button class="btn btn-primary chat-send" type="submit">Send</button>
      </form>
    </section>
  `;
}

export function mountChat(root, ctx) {
  const { session, refresh } = ctx;
  const input = root.querySelector('[data-chat-input]');
  const box = root.querySelector('[data-chat-messages]');

  if (input) {
    input.addEventListener('input', () => { App.ui.chatDraft = input.value.slice(0, CHAT_MAX_LENGTH); });
  }

  if (box) {
    box.addEventListener('scroll', () => {
      const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
      App.ui.chatStickToBottom = distance < 40;
    }, { passive: true });
  }

  on(root, '[data-chat-wallpaper-open]', 'click', () => {
    const picker = root.querySelector('[data-chat-wallpaper-picker]');
    if (picker) picker.hidden = !picker.hidden;
  });

  on(root, '[data-chat-wallpaper-close]', 'click', () => {
    const picker = root.querySelector('[data-chat-wallpaper-picker]');
    if (picker) picker.hidden = true;
  });

  on(root, '[data-chat-wallpaper]', 'click', (e, target) => {
    const id = Number.parseInt(target.dataset.chatWallpaper, 10);
    if (!Number.isInteger(id) || id < 1 || id > WALLPAPER_COUNT) return;
    localStorage.setItem(WALLPAPER_KEY, String(id));
    App.ui.chatStickToBottom = true;
    refresh();
  });

  on(root, '[data-chat-form]', 'submit', async (e) => {
    e.preventDefault();
    if (App.ui.chatSending) return;

    const text = String(input?.value || App.ui.chatDraft || '').trim();
    if (!text) return;

    const clientMessageId = (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

    App.ui.chatSending = true;
    App.ui.chatClientMessageId = clientMessageId;
    App.ui.chatDraft = text;
    App.ui.chatStickToBottom = true;
    refresh();

    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'send-chat', {
        text,
        clientMessageId,
      });
      App.ui.chatSending = false;
      App.ui.chatClientMessageId = null;
      App.ui.chatDraft = '';
      refresh();
    } catch (err) {
      App.ui.chatSending = false;
      App.ui.chatClientMessageId = null;
      setError(err);
    }
  });

  if (input && !sending && document.activeElement !== input) {
    // Do not steal focus after every polling update.
  }

  requestAnimationFrame(() => {
    const currentBox = root.querySelector('[data-chat-messages]');
    if (!currentBox) return;
    if (App.ui.chatStickToBottom !== false) currentBox.scrollTop = currentBox.scrollHeight;
  });
}
