import { showToast, setError } from './state.js?v=7.0';
import { sendAction } from './api.js?v=7.0';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
class VoiceChatManager {
  constructor() {
    this.roomKey = null;
    this.session = null;
    this.button = null;
    this.localStream = null;
    this.enabled = false;
    this.peers = new Map();
    this.seenSignals = new Set();
    this.initiated = new Set();
    this.room = null;
  }

  attachButton(button) {
    this.button = button;
    this.updateButton();
  }

  async updateRoom(room, session) {
    if (!room || !session) return;
    const key = `${room.roomCode}:${session.playerId}`;
    if (this.roomKey && this.roomKey !== key) await this.shutdown(false);
    this.roomKey = key;
    this.room = room;
    this.session = session;

    const states = room.voice?.states || {};
    if (this.enabled) {
      for (const p of room.players || []) {
        if (p.id === session.playerId) continue;
        if (states[p.id]) this.ensurePeer(p.id);
        else this.closePeer(p.id);
      }
    }

    for (const signal of room.voice?.signals || []) {
      if (signal.to === session.playerId) await this.handleSignal(signal);
    }
    this.updateButton();
  }

  async toggle() {
    if (!this.session || !this.room) return;
    if (this.enabled) {
      await this.setEnabled(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Live voice is not supported by this browser.');
      return;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.enabled = true;
      this.updateButton();
      await sendAction(this.session.roomCode, this.session.playerId, this.session.token, 'voice-state', { enabled: true });
      this.updateRoom(this.room, this.session);
      showToast('Voice chat ON 🎙️');
    } catch (err) {
      this.enabled = false;
      this.localStream?.getTracks().forEach((track) => track.stop());
      this.localStream = null;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        showToast('Microphone permission is required for voice chat.');
      } else {
        setError(err);
      }
      this.updateButton();
    }
  }

  async setEnabled(enabled) {
    if (!this.session) return;
    const previous = this.enabled;
    this.enabled = Boolean(enabled);
    this.updateButton();
    try {
      await sendAction(this.session.roomCode, this.session.playerId, this.session.token, 'voice-state', { enabled: this.enabled });
    } catch (err) {
      this.enabled = previous;
      this.updateButton();
      setError(err);
      return;
    }
    if (!this.enabled) {
      for (const id of this.peers.keys()) this.closePeer(id);
      this.initiated.clear();
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = null;
      }
      showToast('Voice chat OFF 🔇');
    }
    this.updateButton();
  }

  ensurePeer(remoteId) {
    if (!this.enabled || !this.localStream || !this.session || remoteId === this.session.playerId) return null;
    let entry = this.peers.get(remoteId);
    if (entry) return entry;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream));

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute('aria-hidden', 'true');
    audio.style.display = 'none';
    document.body.appendChild(audio);

    entry = { pc, audio, pendingCandidates: [] };
    this.peers.set(remoteId, entry);

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      this.signal(remoteId, { type: 'candidate', candidate: candidate.toJSON ? candidate.toJSON() : candidate });
    };
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) {
        audio.srcObject = stream;
        audio.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        this.closePeer(remoteId);
      }
    };

    // Deterministic offerer prevents offer/answer glare when both players
    // enable their microphones at nearly the same time.
    if (this.session.playerId < remoteId && !this.initiated.has(remoteId)) {
      this.initiated.add(remoteId);
      this.makeOffer(remoteId, entry).catch(() => {});
    }
    return entry;
  }

  async makeOffer(remoteId, entry) {
    if (entry.pc.signalingState !== 'stable') return;
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    await this.signal(remoteId, { type: 'offer', description: entry.pc.localDescription });
  }

  async handleSignal(signal) {
    if (!this.enabled || !signal?.id || this.seenSignals.has(signal.id)) return;
    this.seenSignals.add(signal.id);
    if (this.seenSignals.size > 500) {
      const first = this.seenSignals.values().next().value;
      if (first) this.seenSignals.delete(first);
    }

    const remoteId = signal.from;
    const data = signal.signal || {};
    if (!remoteId || !data.type) return;
    const entry = this.ensurePeer(remoteId);
    if (!entry) return;
    const { pc } = entry;

    try {
      if (data.type === 'offer') {
        // The deterministic lower-id peer is the offerer. If an offer arrives
        // while we have an unstable local description, ignore it to avoid glare.
        if (pc.signalingState !== 'stable') return;
        await pc.setRemoteDescription(data.description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.signal(remoteId, { type: 'answer', description: pc.localDescription });
      } else if (data.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(data.description);
        }
      } else if (data.type === 'candidate' && data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else entry.pendingCandidates.push(data.candidate);
      }

      if (pc.remoteDescription && entry.pendingCandidates.length) {
        const candidates = entry.pendingCandidates.splice(0);
        for (const candidate of candidates) await pc.addIceCandidate(candidate);
      }
    } catch {
      // A stale ICE candidate or a replaced peer connection should not break
      // the rest of the room. A later state poll can establish a fresh peer.
    }
  }

  async signal(to, signal) {
    if (!this.session || !to) return;
    try {
      await sendAction(this.session.roomCode, this.session.playerId, this.session.token, 'voice-signal', {
        to,
        signal,
      });
    } catch {
      // Transient signaling errors are retried naturally by subsequent offers
      // or the next room-state update.
    }
  }

  closePeer(remoteId) {
    const entry = this.peers.get(remoteId);
    if (!entry) return;
    try { entry.pc.close(); } catch {}
    try { entry.audio.remove(); } catch {}
    this.peers.delete(remoteId);
    this.initiated.delete(remoteId);
  }

  updateButton() {
    if (!this.button) return;
    this.button.classList.toggle('is-active', this.enabled);
    this.button.textContent = this.enabled ? '🎙️' : '🎙️';
    this.button.title = this.enabled ? 'Turn voice chat off' : 'Turn voice chat on';
    this.button.setAttribute('aria-pressed', String(this.enabled));
    this.button.setAttribute('aria-label', this.enabled ? 'Turn voice chat off' : 'Turn voice chat on');
  }

  async shutdown(notifyServer = true) {
    if (notifyServer && this.enabled && this.session) {
      try {
        await sendAction(this.session.roomCode, this.session.playerId, this.session.token, 'voice-state', { enabled: false });
      } catch {}
    }
    for (const id of this.peers.keys()) this.closePeer(id);
    this.initiated.clear();
    this.seenSignals.clear();
    if (this.localStream) this.localStream.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.enabled = false;
    this.room = null;
    this.session = null;
    this.roomKey = null;
    this.updateButton();
  }
}

export const voiceChat = new VoiceChatManager();

export function mountVoiceChat(root, ctx) {
  const button = root.querySelector('[data-voice-toggle]');
  if (button) {
    voiceChat.attachButton(button);
    button.addEventListener('click', () => voiceChat.toggle());
  }
  voiceChat.updateRoom(ctx.room, ctx.session);
}

export function shutdownVoiceChat() {
  return voiceChat.shutdown(true);
}
