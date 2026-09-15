import crypto from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 (ambiguous)
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // rooms die after 6h of inactivity
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS_TO_START = 3;
export const PET_TYPES = ['dog','cat','rabbit','fox','panda','koala','frog','bear','penguin','hamster'];
export const AVATARS = [
  { id:'girl1', name:'Maya' }, { id:'girl2', name:'Nina' }, { id:'girl3', name:'Zara' }, { id:'girl4', name:'Ivy' }, { id:'girl5', name:'Luna' },
  { id:'boy1', name:'Leo' }, { id:'boy2', name:'Noah' }, { id:'boy3', name:'Kai' }, { id:'boy4', name:'Eli' }, { id:'boy5', name:'Arun' },
];
export const AVATAR_DEFAULT = 'girl1';
function normalizeAvatar(value) { const v=String(value||'').toLowerCase(); return AVATARS.some(a=>a.id===v) ? v : AVATAR_DEFAULT; }
export const PET_DEFAULT_NAMES = { dog:'Buddy', cat:'Milo', rabbit:'Bun', fox:'Foxy', panda:'Bao', koala:'Koko', frog:'Bubbles', bear:'Teddy', penguin:'Pip', hamster:'Nibbles' };
function normalizePetType(value) { const v = String(value || '').toLowerCase(); return PET_TYPES.includes(v) ? v : 'dog'; }
function normalizePetName(value, type='dog') { const clean = String(value || '').trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16); return clean || PET_DEFAULT_NAMES[type] || 'Pet'; }

/** Cryptographically-secure uniform random int in [0, n) */
export function randInt(n) {
  return crypto.randomInt(0, n);
}

/** Fisher-Yates shuffle using a CSPRNG. Returns a new array. */
export function secureShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickRandom(arr) {
  return arr[randInt(arr.length)];
}

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

class RoomStore {
  constructor() {
    /** @type {Map<string, any>} */
    this.rooms = new Map();
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
    setInterval(() => this.tickPets(), 3500).unref();
  }

  tickPets() {
    for (const room of this.rooms.values()) {
      let changed = false;
      for (const player of this.activePlayers(room)) {
        const pet = player.pet; if (!pet) continue;
        if (['sleep','stay'].includes(pet.action) && Date.now() < (pet.actionUntil || 0)) continue;
        const dx = (Number(player.x)||50) - (Number(pet.x)||50);
        const dy = (Number(player.y)||50) - (Number(pet.y)||50);
        const tooFar = Math.hypot(dx,dy) > 18;
        if (tooFar || Math.random() < 0.35) {
          const step = tooFar ? 0.35 : 0.18;
          pet.targetX = Math.max(8, Math.min(92, (Number(pet.x)||50) + dx * step + (Math.random()-.5)*4));
          pet.targetY = Math.max(20, Math.min(86, (Number(pet.y)||50) + dy * step + (Math.random()-.5)*4));
          pet.x = pet.targetX; pet.y = pet.targetY; pet.action = tooFar ? 'follow' : (Math.random() < 0.5 ? 'curious' : 'idle'); pet.actionUntil = Date.now()+2600; changed = true;
        }
      }
      if (changed) this.touch(room);
    }
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_TTL_MS) this.rooms.delete(code);
    }
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: 6 }, () => CODE_CHARS[randInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  get(code) {
    return this.rooms.get((code || '').toUpperCase().trim());
  }

  touch(room) {
    room.lastActivity = Date.now();
    room.version += 1;
  }

  createRoom({ name, roomName, petType = 'dog', petName = '', avatar = AVATAR_DEFAULT }) {
    const maxPlayers = MAX_PLAYERS;
    const code = this.generateCode();
    const now = Date.now();
    const player = {
      id: newId('p'),
      token: newToken(),
      name,
      avatar: normalizeAvatar(avatar),
      x: 22, y: 58, targetX: 22, targetY: 58, action: 'idle', actionUntil: 0,
      seat: 0,
      isCoordinator: true,
      active: true,
      lastRank: 1,
      score: 0,
      roundScores: {},
      pet: { type: normalizePetType(petType), name: normalizePetName(petName, normalizePetType(petType)), x: 18, y: 52, targetX: 18, targetY: 52, action: 'idle', actionUntil: 0, voiceOn: false },
      joinedAt: now,
      carrying: null,
    };
    const room = {
      code,
      maxPlayers,
      roomName: String(roomName || 'KIKI Room').trim().slice(0, 40) || 'KIKI Room',
      createdAt: now,
      lastActivity: now,
      version: 1,
      players: [player],
      currentGame: null,
      viewMode: 'world',
      gameProposal: null,
      worldSetup: null,
      round: 0,
      game: null,
      log: [],
      chat: [],
      chatRound: 0,
      chatClientIds: new Map(),
      coordinatorId: player.id,
      voiceSignals: new Map(),
      pendingInteractions: [],
      interactionSeq: 0,
      interactionReservations: {},
    };
    this.addLog(room, `Room created. Waiting for the squad…`);
    this.rooms.set(code, room);
    return { room, player };
  }

  addLog(room, text) {
    room.log.push({ ts: Date.now(), text });
    if (room.log.length > 12) room.log.shift();
  }

  resetRoundChat(room) {
    room.chat = [];
    room.chatRound = room.round;
    room.chatClientIds = new Map();
  }

  addChat(room, text, system = false, player = null, clientMessageId = null) {
    if (!Array.isArray(room.chat) || room.chatRound !== room.round) this.resetRoundChat(room);

    const dedupeKey = !system && player && clientMessageId
      ? `${player.id}:${clientMessageId}`
      : null;
    if (dedupeKey && room.chatClientIds?.has(dedupeKey)) {
      return room.chat.find((m) => m.id === room.chatClientIds.get(dedupeKey)) || null;
    }

    const message = {
      id: `m_${crypto.randomBytes(8).toString('hex')}`,
      ts: Date.now(),
      round: room.round,
      text: String(text).slice(0, 300),
      system: Boolean(system),
      playerId: player?.id || null,
      playerName: player?.name || 'KIKI',
    };
    room.chat.push(message);

    if (dedupeKey) {
      if (!room.chatClientIds) room.chatClientIds = new Map();
      room.chatClientIds.set(dedupeKey, message.id);
    }

    while (room.chat.length > 80) {
      const removed = room.chat.shift();
      if (removed && room.chatClientIds) {
        for (const [key, id] of room.chatClientIds) {
          if (id === removed.id) room.chatClientIds.delete(key);
        }
      }
    }
    return message;
  }

  activePlayers(room) {
    return room.players.filter((p) => p.active);
  }

  findPlayer(room, playerId) {
    return room.players.find((p) => p.id === playerId);
  }

  authenticate(room, playerId, token) {
    const player = this.findPlayer(room, playerId);
    if (!player || !player.active) return null;
    if (player.token !== token) return null;
    return player;
  }

  joinRoom(room, name, petType = 'dog', petName = '', avatar = AVATAR_DEFAULT) {
    const active = this.activePlayers(room);
    if (active.length >= MAX_PLAYERS) {
      return { error: 'ROOM_FULL' };
    }
    const trimmed = name.trim();
    const dup = active.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return { error: 'NAME_TAKEN' };

    const usedSeats = new Set(active.map((p) => p.seat));
    let seat = 0;
    while (usedSeats.has(seat) && seat < MAX_PLAYERS) seat++;

    const player = {
      id: newId('p'),
      token: newToken(),
      name: trimmed,
      avatar: normalizeAvatar(avatar),
      x: 20 + (active.length * 9) % 65, y: 52 + (active.length * 7) % 28, targetX: 20 + (active.length * 9) % 65, targetY: 52 + (active.length * 7) % 28, action: 'idle', actionUntil: 0,
      seat,
      isCoordinator: false,
      active: true,
      lastRank: active.length + 1,
      score: 0,
      roundScores: {},
      pet: { type: normalizePetType(petType), name: normalizePetName(petName, normalizePetType(petType)), x: 18 + (active.length * 7) % 64, y: 40 + (active.length * 11) % 36, targetX: 18 + (active.length * 7) % 64, targetY: 40 + (active.length * 11) % 36, action: 'idle', actionUntil: 0, voiceOn: false },
      joinedAt: Date.now(),
      carrying: null,
    };
    room.players.push(player);
    this.addLog(room, `${trimmed} joined the room.`);
    this.touch(room);
    return { player };
  }

  leaveRoom(room, player) {
    player.active = false;
    // Active games remain alive; game modules use the current active-player set.
    room.interactionReservations = room.interactionReservations || {};
    delete room.interactionReservations[player.id];
    room.pendingInteractions = room.pendingInteractions || [];
    room.pendingInteractions = room.pendingInteractions.filter(r => r.from !== player.id && r.to !== player.id);

    this.addLog(room, `${player.name} left the room.`);
    if (room.coordinatorId === player.id) {
      const next = this.activePlayers(room).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) {
        next.isCoordinator = true;
        room.coordinatorId = next.id;
        this.addLog(room, `${next.name} is now the coordinator 👑`);
      }
    }
    this.touch(room);
  }

  /** Permanently remove this temporary room and all of its in-memory game data. */
  closeRoom(room) {
    this.rooms.delete(room.code);
    // Explicitly clear sensitive references before allowing the room object to be collected.
    room.players = [];
    room.game = null;
    room.log = [];
    room.chat = [];
    room.chatRound = 0;
    room.chatClientIds = new Map();
    room.voiceSignals = new Map();
    room.pendingInteractions = [];
    room.interactionSeq = 0;
    room.currentGame = null;
    room.gameProposal = null;
    room.worldSetup = null;
  }

}

export const store = new RoomStore();
export { newId };
