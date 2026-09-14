import { App, setLoading, setError } from '../state.js?v=4.2';
import { sendAction } from '../api.js?v=4.2';
import { on, escapeHtml } from '../dom.js?v=4.2';

export function renderChat(room) {
  const messages = Array.isArray(room.chat) ? room.chat.filter((m) => !m.round || m.round === room.round) : [];
  const you = room.you?.id;
  return `
    <section class="chat-section" aria-label="KIKI group chat">
      <div class="chat-header">
        <div>
          <p class="chat-title">💬 Group chat</p>
          <p class="chat-subtitle">Private to this room · Round ${room.round}</p>
        </div>
        <span class="chat-live"><span></span> LIVE</span>
      </div>
      <div class="chat-messages" data-chat-messages>
        ${messages.length ? messages.map((m) => `
          <div class="chat-message ${m.system ? 'is-system' : ''} ${m.playerId === you ? 'is-you' : ''}">
            <div class="chat-message-meta">${escapeHtml(m.system ? 'KIKI' : (m.playerName || 'Player'))}</div>
            <div class="chat-message-bubble">${escapeHtml(m.text)}</div>
          </div>
        `).join('') : `<p class="chat-empty">No messages yet. Start the chaos 👀</p>`}
      </div>
      <form class="chat-composer" data-chat-form>
        <input class="text-input chat-input" data-chat-input maxlength="300" autocomplete="off" placeholder="Type a message…" value="${escapeHtml(App.ui.chatDraft || '')}" aria-label="Chat message" />
        <button class="btn btn-primary chat-send" type="submit">Send</button>
      </form>
    </section>
  `;
}

export function mountChat(root, ctx) {
  const { session, refresh } = ctx;
  const input = root.querySelector('[data-chat-input]');
  if (input) {
    input.addEventListener('input', () => { App.ui.chatDraft = input.value; });
  }

  on(root, '[data-chat-form]', 'submit', async (e) => {
    e.preventDefault();
    const text = String(App.ui.chatDraft || input?.value || '').trim();
    if (!text) return;
    const button = root.querySelector('.chat-send');
    if (button) button.disabled = true;
    try {
      await sendAction(session.roomCode, session.playerId, session.token, 'send-chat', { text });
      App.ui.chatDraft = '';
      refresh();
      requestAnimationFrame(() => {
        const box = root.querySelector('[data-chat-messages]');
        if (box) box.scrollTop = box.scrollHeight;
      });
    } catch (err) {
      setError(err);
      if (button) button.disabled = false;
    }
  });

  requestAnimationFrame(() => {
    const box = root.querySelector('[data-chat-messages]');
    if (box) box.scrollTop = box.scrollHeight;
  });
}
