import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './server/store.js';
import { startGame, performAction, publicGameView, privateGameView, canStart, serializeProposal } from './server/games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
    ...extra,
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, securityHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...headers }));
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

/* ------------------------------- serialization ------------------------------- */

function serializeRoom(room, viewerPlayer) {
  const players = room.players
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      isCoordinator: p.isCoordinator,
      score: p.score || 0,
      roundScores: p.roundScores || {},
      avatar: p.avatar || 'girl1',
      x: p.x ?? 50, y: p.y ?? 50, targetX: p.targetX ?? p.x ?? 50, targetY: p.targetY ?? p.y ?? 50, action: p.action || 'idle', actionUntil: p.actionUntil || 0,
      pet: { ...(p.pet || {}), voiceOn: Boolean(p.pet?.voiceOn) },
      carrying: p.carrying || null,
    }))
    .sort((a, b) => a.seat - b.seat);

  const payload = {
    roomCode: room.code,
    maxPlayers: room.maxPlayers,
    roomName: room.roomName,
    status: room.currentGame ? 'in-game' : 'waiting',
    coordinatorId: room.coordinatorId,
    players,
    currentGame: room.currentGame,
    viewMode: 'world',
    gameProposal: room.gameProposal ? { ...serializeProposal(room), myVote: viewerPlayer ? (room.gameProposal.votes?.[viewerPlayer.id] || null) : null } : null,
    worldSetup: room.worldSetup || null,
    round: room.round,
    game: publicGameView(room),
    log: room.log,
    chat: room.chat || [],
    version: room.version,
    voiceSignals: viewerPlayer ? (room.voiceSignals?.get(viewerPlayer.id)?.splice(0) || []) : [],
    // Interaction requests are confidential: only the intended recipient receives incoming requests;
    // the requester receives only their own pending request status. No other player gets these objects.
    interactionRequests: viewerPlayer ? (room.pendingInteractions || []).filter(r => r.expiresAt > Date.now() && (r.to === viewerPlayer.id || r.from === viewerPlayer.id)).map(r => ({...r, text: r.to === viewerPlayer.id ? r.text : undefined})) : [],
    canStart: {
      imposter: canStart('imposter', players.length),
      truthOrDare: canStart('truthOrDare', players.length),
      guessWho: canStart('guessWho', players.length),
      threeSet: canStart('threeSet', players.length),
    },
  };

  if (viewerPlayer) {
    payload.you = {
      id: viewerPlayer.id,
      name: viewerPlayer.name,
      seat: viewerPlayer.seat,
      isCoordinator: viewerPlayer.isCoordinator,
      private: privateGameView(room, viewerPlayer.id),
    };
  }
  return payload;
}

/* ---------------------------------- routes ---------------------------------- */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',...]

  try {
    // POST /api/rooms
    if (parts.length === 2 && parts[1] === 'rooms' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 20);
      const roomName = String(body.roomName || '').trim().slice(0, 40);
      const petType = String(body.petType || 'dog');
      const petName = String(body.petName || '');
      const avatar = String(body.avatar || 'girl1');
      const maxPlayers = 10;
      if (!name) return send(res, 400, { error: 'NAME_REQUIRED' });
      if (!roomName) return send(res, 400, { error: 'ROOM_NAME_REQUIRED' });
      const { room, player } = store.createRoom({ name, maxPlayers, roomName, petType, petName, avatar });
      return send(res, 200, {
        roomCode: room.code,
        playerId: player.id,
        token: player.token,
        seat: player.seat,
        state: serializeRoom(room, player),
      });
    }

    // /api/rooms/:code/...
    if (parts.length >= 3 && parts[1] === 'rooms') {
      const code = decodeURIComponent(parts[2]).toUpperCase();
      const sub = parts[3];
      const room = store.get(code);

      if (sub === 'join' && req.method === 'POST') {
        if (!room) return send(res, 404, { error: 'ROOM_NOT_FOUND' });
        const body = await readBody(req);
        const name = String(body.name || '').trim().slice(0, 20);
        const petType = String(body.petType || 'dog');
        const petName = String(body.petName || '');
        const avatar = String(body.avatar || 'girl1');
        if (!name) return send(res, 400, { error: 'NAME_REQUIRED' });
        if (room.currentGame) return send(res, 409, { error: 'GAME_IN_PROGRESS' });
        const result = store.joinRoom(room, name, petType, petName, avatar);
        if (result.error) return send(res, 409, { error: result.error });
        return send(res, 200, {
          roomCode: room.code,
          playerId: result.player.id,
          token: result.player.token,
          seat: result.player.seat,
          state: serializeRoom(room, result.player),
        });
      }

      if (!room) return send(res, 404, { error: 'ROOM_NOT_FOUND' });

      if (sub === 'state' && req.method === 'GET') {
        const playerId = url.searchParams.get('playerId');
        const token = url.searchParams.get('token');
        let viewer = null;
        if (playerId && token) {
          viewer = store.authenticate(room, playerId, token);
          if (!viewer) return send(res, 401, { error: 'UNAUTHORIZED' });
        }
        return send(res, 200, { state: serializeRoom(room, viewer) });
      }

      if (sub === 'leave' && req.method === 'POST') {
        const body = await readBody(req);
        const player = store.authenticate(room, body.playerId, body.token);
        if (!player) return send(res, 401, { error: 'UNAUTHORIZED' });
        const result = store.leaveRoom(room, player);
        if (result?.error) return send(res, 409, { error: result.error });
        return send(res, 200, { ok: true });
      }

      if (sub === 'close-game' && req.method === 'POST') {
        const body = await readBody(req);
        const player = store.authenticate(room, body.playerId, body.token);
        if (!player) return send(res, 401, { error: 'UNAUTHORIZED' });
        if (!player.isCoordinator) return send(res, 403, { error: 'NOT_COORDINATOR' });
        store.closeRoom(room);
        return send(res, 200, { ok: true, closed: true });
      }

      if (sub === 'select-game' && req.method === 'POST') {
        const body = await readBody(req);
        const player = store.authenticate(room, body.playerId, body.token);
        if (!player) return send(res, 401, { error: 'UNAUTHORIZED' });
        if (!player.isCoordinator) return send(res, 403, { error: 'NOT_COORDINATOR' });
        const game = body.game;
        const activeCount = store.activePlayers(room).length;
        if (!['imposter', 'truthOrDare', 'guessWho', 'threeSet'].includes(game)) {
          return send(res, 400, { error: 'INVALID_GAME' });
        }
        if (room.currentGame) return send(res, 409, { error: 'GAME_IN_PROGRESS' });
        if (!canStart(game, activeCount)) return send(res, 400, { error: 'NOT_ENOUGH_PLAYERS' });
        if (!room.gameProposal) return send(res, 409, { error: 'NO_GAME_PROPOSAL' });
        startGame(room, game);
        return send(res, 200, { state: serializeRoom(room, player) });
      }

      if (sub === 'action' && req.method === 'POST') {
        const body = await readBody(req);
        const player = store.authenticate(room, body.playerId, body.token);
        if (!player) return send(res, 401, { error: 'UNAUTHORIZED' });
        const result = performAction(room, player, body.action, body.payload || {});
        if (result.error) return send(res, 400, { error: result.error });
        return send(res, 200, { ok: true, result, state: serializeRoom(room, player) });
      }
    }

    return send(res, 404, { error: 'NOT_FOUND' });
  } catch (err) {
    if (err.message === 'BODY_TOO_LARGE') return send(res, 413, { error: 'BODY_TOO_LARGE' });
    if (err.message === 'BAD_JSON') return send(res, 400, { error: 'BAD_JSON' });
    console.error(err);
    return send(res, 500, { error: 'SERVER_ERROR' });
  }
}

/* -------------------------------- static files -------------------------------- */

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.writeHead(403, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Only browser navigation routes get the SPA shell. Missing assets
      // must remain real 404s instead of returning HTML with status 200.
      const ext = path.extname(filePath).toLowerCase();
      const acceptsHtml = String(req.headers.accept || '').includes('text/html');
      const isNavigation = !ext && acceptsHtml;
      if (isNavigation) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexData) => {
          if (err2) { res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })); return res.end('Not found'); }
          res.writeHead(200, securityHeaders({ 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }));
          res.end(indexData);
        });
        return;
      }
      res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const cacheControl = (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-store, no-cache, must-revalidate' : 'public, max-age=86400';
    res.writeHead(200, securityHeaders({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cacheControl }));
    res.end(data);
  });
}

/* ---------------------------------- server ---------------------------------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
  } else {
    serveStatic(req, res, url.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`\n  🎉 KIKI is running at http://localhost:${PORT}\n`);
  console.log(`  Share your local network address with friends on the same Wi-Fi,`);
  console.log(`  or deploy this project to play over the internet.\n`);
});
