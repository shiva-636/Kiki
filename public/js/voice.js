import { App, setError, showToast } from './state.js?v=12.0';
import { sendAction } from './api.js?v=12.0';

const Voice = {
  stream: null,
  enabled: false,
  peers: new Map(),
  pendingCandidates: new Map(),
  roomCode: null,
  playerId: null,
  token: null,
  started: false,
};

function pairKey(a,b) { return [a,b].sort().join(':'); }
function shouldInitiate(me, other) { return String(me) < String(other); }

async function ensureStream() {
  if (Voice.stream) return Voice.stream;
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Live voice is not supported by this browser.'), { code:'VOICE_UNSUPPORTED' });
  Voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
  Voice.stream.getAudioTracks().forEach(t => { t.enabled = true; });
  return Voice.stream;
}

function closePeer(id) {
  const pc = Voice.peers.get(id);
  if (pc) { try { pc.close(); } catch {} }
  Voice.peers.delete(id);
  Voice.pendingCandidates.delete(id);
}

async function sendSignal(to, type, data = {}) {
  try { await sendAction(Voice.roomCode, Voice.playerId, Voice.token, 'voice-signal', { to, type, ...data }); }
  catch (err) { if (err.code !== 'VOICE_OFF') setError(err); }
}

function attachPeerAudio(pc, from) {
  pc.ontrack = (event) => {
    let audio = document.querySelector(`audio[data-voice-peer="${CSS.escape(from)}"]`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true; audio.playsInline = true; audio.dataset.voicePeer = from;
      audio.style.display = 'none'; document.body.appendChild(audio);
    }
    audio.srcObject = event.streams[0];
    audio.play().catch(() => {});
  };
}

function setupPeer(remoteId, initiator) {
  if (Voice.peers.has(remoteId)) return Voice.peers.get(remoteId);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  Voice.peers.set(remoteId, pc);
  attachPeerAudio(pc, remoteId);
  if (Voice.stream) Voice.stream.getTracks().forEach(track => pc.addTrack(track, Voice.stream));
  pc.onicecandidate = (e) => { if (e.candidate) sendSignal(remoteId, 'candidate', { candidate:e.candidate }); };
  pc.onconnectionstatechange = () => { if (['failed','closed','disconnected'].includes(pc.connectionState)) closePeer(remoteId); };
  if (initiator) createOffer(remoteId, pc);
  return pc;
}

async function createOffer(remoteId, pc) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal(remoteId, 'offer', { sdp: pc.localDescription });
  } catch (err) { setError(err); }
}

async function handleSignal(signal, room) {
  const from = signal.from;
  if (!from || from === Voice.playerId) return;
  const remote = room.players.find(p => p.id === from);
  if (!remote) return;
  if (signal.type === 'leave') { closePeer(from); return; }
  const pc = setupPeer(from, false);
  try {
    if (signal.type === 'offer') {
      await pc.setRemoteDescription(signal.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(from, 'answer', { sdp: pc.localDescription });
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(signal.sdp);
    } else if (signal.type === 'candidate') {
      try { await pc.addIceCandidate(signal.candidate); } catch { (Voice.pendingCandidates.get(from) || []).push(signal.candidate); }
    }
    const queued = Voice.pendingCandidates.get(from) || [];
    for (const candidate of queued) { try { await pc.addIceCandidate(candidate); } catch {} }
    Voice.pendingCandidates.delete(from);
  } catch (err) { console.warn('KIKI voice signal failed', err); }
}

async function syncPeers(room) {
  if (!Voice.enabled || !window.RTCPeerConnection) return;
  const me = Voice.playerId;
  const activeIds = new Set(room.players.map(p => p.id));
  for (const id of Voice.peers.keys()) if (!activeIds.has(id)) closePeer(id);
  for (const p of room.players) {
    if (p.id === me) continue;
    if (!p.pet?.voiceOn) { if (Voice.peers.has(p.id)) closePeer(p.id); continue; }
    if (!Voice.peers.has(p.id) && shouldInitiate(me, p.id)) setupPeer(p.id, true);
  }
}

export async function syncVoice(room, session) {
  if (!room || !session) return;
  Voice.roomCode = session.roomCode; Voice.playerId = session.playerId; Voice.token = session.token;
  if (!Voice.started) {
    Voice.started = true;
    window.addEventListener('beforeunload', () => { for (const id of Voice.peers.keys()) sendSignal(id, 'leave'); Voice.stream?.getTracks().forEach(t => t.stop()); });
  }
  for (const signal of (room.voiceSignals || [])) await handleSignal(signal, room);
  await syncPeers(room);
  updateVoiceIndicators(room);
}

export async function toggleVoice(enabled, room, session) {
  try {
    if (enabled) {
      await ensureStream();
      Voice.enabled = true;
      await sendAction(session.roomCode, session.playerId, session.token, 'voice-toggle', { enabled:true });
      await syncVoice(room, session);
      showToast('Mic on — your room can hear you 🎙️');
    } else {
      Voice.enabled = false;
      Voice.stream?.getAudioTracks().forEach(t => { t.enabled = false; });
      for (const id of Voice.peers.keys()) await sendSignal(id, 'leave');
      [...Voice.peers.keys()].forEach(closePeer);
      await sendAction(session.roomCode, session.playerId, session.token, 'voice-toggle', { enabled:false });
      showToast('Mic off');
    }
    updateVoiceIndicators(room);
  } catch (err) {
    Voice.enabled = false;
    Voice.stream?.getAudioTracks().forEach(t => { t.enabled = false; });
    setError(err);
  }
}

export function isVoiceEnabled() { return Voice.enabled; }

export function updateVoiceIndicators(room) {
  const me = room?.you?.id;
  const on = Voice.enabled || Boolean(room?.players?.find(p => p.id === me)?.pet?.voiceOn);
  document.querySelectorAll('[data-voice-toggle]').forEach(btn => {
    btn.classList.toggle('is-live', on); btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '🔴🎙️' : '🎙️';
    btn.title = on ? 'Turn microphone off' : 'Turn microphone on';
  });
  document.querySelectorAll('[data-voice-player]').forEach(el => {
    const id = el.dataset.voicePlayer;
    const p = room?.players?.find(x => x.id === id);
    el.classList.toggle('is-speaking-ready', Boolean(p?.pet?.voiceOn));
  });
}
