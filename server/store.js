import crypto from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 (ambiguous)
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // rooms die after 6h of inactivity

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

  createRoom({ name, maxPlayers }) {
    const code = this.generateCode();
    const now = Date.now();
    const player = {
      id: newId('p'),
      token: newToken(),
      name,
      seat: 0,
      isCoordinator: true,
      active: true,
      lastRank: 1,
      joinedAt: now,
    };
    const room = {
      code,
      maxPlayers,
      createdAt: now,
      lastActivity: now,
      version: 1,
      players: [player],
      currentGame: null,
      round: 0,
      game: null,
      log: [],
      chat: [],
      chatRound: 0,
      coordinatorId: player.id,
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
  }

  addChat(room, text, system = false, player = null) {
    if (!Array.isArray(room.chat) || room.chatRound !== room.round) this.resetRoundChat(room);
    room.chat.push({
      id: `m_${crypto.randomBytes(8).toString('hex')}`,
      ts: Date.now(),
      round: room.round,
      text: String(text).slice(0, 300),
      system: Boolean(system),
      playerId: player?.id || null,
      playerName: player?.name || 'KIKI',
    });
    if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
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

  joinRoom(room, name) {
    const active = this.activePlayers(room);
    if (active.length >= room.maxPlayers) {
      return { error: 'ROOM_FULL' };
    }
    const trimmed = name.trim();
    const dup = active.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return { error: 'NAME_TAKEN' };

    const usedSeats = new Set(active.map((p) => p.seat));
    let seat = 0;
    while (usedSeats.has(seat) && seat < room.maxPlayers) seat++;

    const player = {
      id: newId('p'),
      token: newToken(),
      name: trimmed,
      seat,
      isCoordinator: false,
      active: true,
      lastRank: active.length + 1,
      joinedAt: Date.now(),
    };
    room.players.push(player);
    this.addLog(room, `${trimmed} joined the room.`);
    this.touch(room);
    return { player };
  }

  leaveRoom(room, player) {
    if (room.currentGame) return { error: 'GAME_IN_PROGRESS' };
    player.active = false;
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
    room.currentGame = null;
  }

}

export const store = new RoomStore();
export { newId };
