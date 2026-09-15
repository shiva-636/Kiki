import { App, setError } from '../state.js?v=12.0';
import { sendAction } from '../api.js?v=12.0';
import { escapeHtml } from '../dom.js?v=12.0';

const CHAT_MAX_LENGTH = 300;

export function renderChat(room) {
  if (!App.ui.chatOpen) return '';
  const rawMessages = Array.isArray(room.chat) ? room.chat.filter((m) => !m.round || m.round === room.round) : [];
  const seen = new Set();
  const messages = rawMessages.filter(m => { const id=String(m.id||''); if(!id||seen.has(id))return false; seen.add(id); return true; });
  const you=room.you?.id;
  return `<section class="chat-section v10-chat" aria-label="${escapeHtml(room.roomName||'KIKI Room')} chat">
    <div class="chat-header"><div><p class="chat-title">💬 ${escapeHtml(room.roomName||'KIKI Room')}</p><p class="chat-subtitle">Round ${room.round}</p></div><button class="btn-icon" data-chat-close type="button" aria-label="Close chat">✕</button></div>
    <div class="chat-messages" data-chat-messages>${messages.length?messages.map(m=>`<div class="chat-message ${m.system?'is-system':''} ${m.playerId===you?'is-you':''}"><div class="chat-message-meta"><span>${escapeHtml(m.system?'KIKI':(m.playerName||'Player'))}</span><time>${new Date(m.ts||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time></div><div class="chat-message-bubble">${escapeHtml(m.text)}</div></div>`).join(''):`<p class="chat-empty">No messages yet. Start the chaos 👀</p>`}</div>
    <form class="chat-composer" data-chat-form><input class="text-input chat-input" data-chat-input maxlength="${CHAT_MAX_LENGTH}" autocomplete="off" placeholder="Type a message…" value="${escapeHtml(App.ui.chatDraft||'')}"/><button class="btn btn-primary chat-send" type="submit">Send</button></form>
  </section>`;
}

export function mountChat(root, ctx) {
  const { session, refresh } = ctx;
  const input = root.querySelector('[data-chat-input]');
  const box = root.querySelector('[data-chat-messages]');
  const closeButton = root.querySelector('[data-chat-close]');
  const form = root.querySelector('[data-chat-form]');

  // IMPORTANT: attach listeners to the freshly-rendered chat controls directly.
  // The app replaces root.innerHTML on every polling update. Delegating through
  // root with a new listener on every render would stack handlers and, for the
  // wallpaper toggle, one tap could open AND immediately close the picker.
  if (input) {
    input.addEventListener('input', () => {
      App.ui.chatDraft = input.value.slice(0, CHAT_MAX_LENGTH);
    });
  }

  if (box) {
    box.addEventListener('scroll', () => {
      const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
      App.ui.chatStickToBottom = distance < 40;
    }, { passive: true });
  }

  if (closeButton) closeButton.addEventListener('click', () => { App.ui.chatOpen=false; refresh(); });

  if (form) {
    form.addEventListener('submit', async (e) => {
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
  }

  // Do not steal focus after every polling update.
  requestAnimationFrame(() => {
    const currentBox = root.querySelector('[data-chat-messages]');
    if (!currentBox) return;
    if (App.ui.chatStickToBottom !== false) currentBox.scrollTop = currentBox.scrollHeight;
  });
}
