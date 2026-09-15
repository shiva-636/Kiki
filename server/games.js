import { store, randInt, secureShuffle, pickRandom, PET_TYPES, PET_DEFAULT_NAMES, AVATARS, AVATAR_DEFAULT } from './store.js';
import { WORD_PAIRS, SET_NAMES } from './data.js';

const MIN_PLAYERS = { imposter: 3, truthOrDare: 3, guessWho: 3, threeSet: 3 };

export function canStart(game, activeCount) {
  return activeCount >= (MIN_PLAYERS[game] || 3) && activeCount <= 10;
}

/* ---------------------------------- start ---------------------------------- */

export function startGame(room, game) {
  room.currentGame = game;
  room.gameProposal = null;
  room.worldSetup = { game, phase: 'arriving', startedAt: Date.now() };
  room.round = 1;
  store.resetRoundChat(room);
  const active = store.activePlayers(room);
  if (game === 'imposter') {
    room.game = { resultsRecorded: false };
    assignImposterRound(room, active);
  } else if (game === 'truthOrDare') {
    room.game = { lastSelected: null, wheelOrder: [], spinToken: null, choiceToken: null, chosenType: null };
  } else if (game === 'guessWho') {
    room.game = { thinkerId: null, wheelOrder: [], spinToken: null, resultsRecorded: false, thinkerConfirmed: false };
  } else if (game === 'threeSet') {
    room.game = { startingSeatCursor: 0 };
    setupThreeSetRound(room, active);
  }
  const coordinator = store.findPlayer(room, room.coordinatorId);
  if (coordinator) {
    const startX = Number.isFinite(coordinator.x) ? coordinator.x : 70;
    const startY = Number.isFinite(coordinator.y) ? coordinator.y : 55;
    const toyX = 16; const toyY = 42;
    const tableX = 74; const tableY = 55;
    coordinator.targetX = toyX; coordinator.targetY = toyY; coordinator.action = 'walk'; coordinator.actionUntil = Date.now() + 1800;
    if (room.worldSetup) { room.worldSetup.phase = 'going-to-toy-corner'; room.worldSetup.startedAt = Date.now(); }
    store.touch(room);
    setTimeout(() => {
      if (!room.currentGame || !coordinator.active) return;
      coordinator.x = toyX; coordinator.y = toyY; coordinator.targetX = toyX; coordinator.targetY = toyY; coordinator.action = 'carry'; coordinator.actionUntil = Date.now() + 1900;
      if (room.worldSetup) room.worldSetup.phase = 'bringing-setup';
      store.touch(room);
    }, 1800).unref?.();
    setTimeout(() => {
      if (!room.currentGame || !coordinator.active) return;
      coordinator.x = tableX; coordinator.y = tableY; coordinator.targetX = tableX; coordinator.targetY = tableY; coordinator.action = 'walk'; coordinator.actionUntil = Date.now() + 1600;
      if (room.worldSetup) room.worldSetup.phase = 'gathering';
      store.touch(room);
    }, 3700).unref?.();
    setTimeout(() => {
      if (!room.currentGame || !coordinator.active) return;
      coordinator.x = tableX; coordinator.y = tableY; coordinator.targetX = tableX; coordinator.targetY = tableY; coordinator.action = 'idle'; coordinator.actionUntil = Date.now() + 1200;
      if (room.worldSetup) room.worldSetup.phase = 'ready';
      store.touch(room);
    }, 5300).unref?.();
  }
  store.addLog(room, `Coordinator started ${gameLabel(game)}.`);
  store.touch(room);
}

function gameLabel(game) {
  return { imposter: 'Imposter', truthOrDare: 'Truth or Dare', guessWho: 'Guess Who?', threeSet: 'Three Set' }[game] || game;
}

/* --------------------------------- imposter --------------------------------- */

function assignImposterRound(room, active) {
  const imposter = pickRandom(active);
  const [normal, imp] = pickRandom(WORD_PAIRS);
  const assignments = {};
  for (const p of active) assignments[p.id] = p.id === imposter.id ? imp : normal;
  room.game = {
    ...room.game,
    imposterId: imposter.id,
    assignments,
    votes: {},
    resultsRecorded: false,
  };
}

function addScore(room, playerId, points) {
  const target = store.findPlayer(room, playerId);
  if (!target) return;
  target.score = (target.score || 0) + points;
  target.roundScores = target.roundScores || {};
  const key = String(room.round || 1);
  target.roundScores[key] = (target.roundScores[key] || 0) + points;
}

function imposterAction(room, player, action, payload) {
  const g = room.game;
  if (action === 'lock-vote') {
    if (g.resultsRecorded) return { error: 'ALREADY_RECORDED' };
    if (g.votes?.[player.id]) return { error: 'VOTE_ALREADY_LOCKED' };
    const active = store.activePlayers(room);
    const activeIds = new Set(active.map((p) => p.id));
    const targetId = String(payload?.targetPlayerId || '');
    if (!activeIds.has(targetId)) return { error: 'INVALID_TARGET' };
    if (targetId === player.id) return { error: 'CANNOT_VOTE_SELF' };

    g.votes[player.id] = targetId;
    const lockedCount = Object.keys(g.votes).length;
    const allLocked = lockedCount === active.length;
    if (allLocked) {
      let correctCount = 0;
      for (const p of active) {
        if (p.id !== g.imposterId && g.votes[p.id] === g.imposterId) {
          addScore(room, p.id, 10);
          correctCount += 1;
        }
      }
      g.resultsRecorded = true;
      store.addLog(room, `Round ${room.round} complete — ${correctCount} player(s) caught the imposter.`);
    } else {
      store.addLog(room, `${player.name} locked their vote (${lockedCount}/${active.length}).`);
    }
    store.touch(room);
    return { ok: true, lockedCount, totalPlayers: active.length, resultsRecorded: g.resultsRecorded };
  }
  if (action === 'next-round') {
    if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
    if (!g.resultsRecorded) return { error: 'WAIT_FOR_ALL_VOTES' };
    room.round += 1;
    store.resetRoundChat(room);
    assignImposterRound(room, store.activePlayers(room));
    store.addLog(room, `Round ${room.round} — new imposter assigned.`);
    store.touch(room);
    return { ok: true };
  }
  return { error: 'UNKNOWN_ACTION' };
}

function imposterPublic(room) {
  const active = store.activePlayers(room);
  const voteStatus = {};
  for (const p of active) voteStatus[p.id] = Boolean(room.game.votes?.[p.id]);
  return {
    resultsRecorded: room.game.resultsRecorded,
    voteStatus,
    lockedCount: Object.keys(room.game.votes || {}).length,
    totalPlayers: active.length,
    imposterId: room.game.resultsRecorded ? room.game.imposterId : null,
  };
}

function imposterPrivate(room, playerId) {
  return {
    word: room.game.assignments[playerId] || null,
    vote: room.game.votes?.[playerId] || null,
    voteLocked: Boolean(room.game.votes?.[playerId]),
  };
}

/* ------------------------------- truth or dare ------------------------------- */

function wheelAction(room, player, action, payload, key) {
  if (action !== 'spin') return { error: 'UNKNOWN_ACTION' };
  if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
  const active = store.activePlayers(room);
  const order = secureShuffle(active).map((p) => p.id); // shuffled purely for visual variety
  const selected = order[randInt(order.length)];
  // Truth or Dare spins are selections within the current round. Guess Who
  // treats each new selection as a new round, but the first spin is round 1.
  if (key === 'thinkerId' && room.game.thinkerId !== null) {
    if (!room.game.resultsRecorded) return { error: 'WAIT_FOR_RESULTS' };
    room.round += 1;
    store.resetRoundChat(room);
  }
  if (key === 'lastSelected' && room.game.spinToken) {
    store.resetRoundChat(room);
  }
  room.game[key] = selected;
  room.game.wheelOrder = order;
  room.game.spinToken = `${Date.now()}_${randInt(100000)}`;
  if (key === 'thinkerId') { room.game.resultsRecorded = false; room.game.thinkerConfirmed = false; }
  if (key === 'lastSelected') { room.game.choiceToken = room.game.spinToken; room.game.chosenType = null; }
  const label = key === 'thinkerId' ? 'is the Thinker' : "is up";
  const name = store.findPlayer(room, selected)?.name || '?';
  store.addLog(room, `${name} ${label}! 🎯`);
  store.touch(room);
  return { ok: true };
}

function truthOrDareAction(room, player, action, payload) {
  if (action === 'choose-truth-dare') {
    const g = room.game;
    if (!g.lastSelected || g.lastSelected !== player.id) return { error: 'NOT_SELECTED_PLAYER' };
    if (g.chosenType) return { error: 'CHOICE_ALREADY_MADE' };
    const choice = String(payload?.choice || '').toLowerCase();
    if (!['truth', 'dare'].includes(choice)) return { error: 'INVALID_CHOICE' };
    g.chosenType = choice;
    store.addChat(room, `${player.name} chose ${choice.toUpperCase()} ${choice === 'truth' ? '💬' : '🔥'}. Let the game begin!`, true);
    store.touch(room);
    return { ok: true, choice };
  }
  return wheelAction(room, player, action, payload, 'lastSelected');
}
function truthOrDarePublic(room) {
  return { lastSelected: room.game.lastSelected, wheelOrder: room.game.wheelOrder, spinToken: room.game.spinToken, choiceToken: room.game.choiceToken, chosenType: room.game.chosenType };
}

/* --------------------------------- guess who --------------------------------- */

function guessWhoAction(room, player, action, payload) {
  if (action === 'confirm-thinker') {
    if (room.game.thinkerId !== player.id) return { error: 'NOT_SELECTED_PLAYER' };
    if (room.game.thinkerConfirmed) return { error: 'ALREADY_CONFIRMED' };
    room.game.thinkerConfirmed = true;
    store.addChat(room, `🧠 ${player.name} has imagined someone. Ask yes/no questions!`, true);
    store.touch(room);
    return { ok: true };
  }
  if (action === 'answer-question') {
    if (room.game.thinkerId !== player.id) return { error: 'NOT_SELECTED_PLAYER' };
    if (!room.game.thinkerConfirmed) return { error: 'THINKER_NOT_CONFIRMED' };
    const answer = String(payload?.answer || '').toLowerCase();
    if (!['yes', 'no'].includes(answer)) return { error: 'INVALID_ANSWER' };
    store.addChat(room, `🧠 ${player.name}: ${answer.toUpperCase()} ${answer === 'yes' ? '✅' : '❌'}`, true);
    store.touch(room);
    return { ok: true, answer };
  }
  if (action === 'record-correct') {
    if (room.game.thinkerId !== player.id) return { error: 'NOT_SELECTED_PLAYER' };
    if (!room.game.thinkerConfirmed) return { error: 'THINKER_NOT_CONFIRMED' };
    if (room.game.resultsRecorded) return { error: 'ALREADY_RECORDED' };
    const activeIds = new Set(store.activePlayers(room).map((p) => p.id));
    const correct = [...new Set((Array.isArray(payload?.correctPlayerIds) ? payload.correctPlayerIds : [])
      .map(String)
      .filter((id) => activeIds.has(id) && id !== room.game.thinkerId))];
    for (const id of correct) addScore(room, id, 10);
    room.game.resultsRecorded = true;
    store.addLog(room, `${correct.length} player(s) guessed correctly.`);
    store.addChat(room, `🧠 ${player.name} locked the Guess Who results — ${correct.length} correct guess${correct.length === 1 ? '' : 'es'} · +10 each.`, true);
    store.touch(room);
    return { ok: true, correctCount: correct.length, pointsPerCorrect: 10 };
  }
  return wheelAction(room, player, action, payload, 'thinkerId');
}
function guessWhoPublic(room) {
  return {
    thinkerId: room.game.thinkerId,
    wheelOrder: room.game.wheelOrder,
    spinToken: room.game.spinToken,
    resultsRecorded: room.game.resultsRecorded,
    thinkerConfirmed: room.game.thinkerConfirmed,
  };
}

/* --------------------------------- three set --------------------------------- */

function setupThreeSetRound(room, active) {
  const n = active.length;
  const names = SET_NAMES.slice(0, n);
  let deck = [];
  names.forEach((name, si) => {
    for (let k = 0; k < 3; k++) deck.push({ id: `c_${si}_${k}`, name });
  });
  deck = secureShuffle(deck);

  const startCursor = room.game.startingSeatCursor || 0;
  const seatOrder = active.slice().sort((a, b) => a.seat - b.seat);
  const startingPlayer = seatOrder[startCursor % seatOrder.length];

  room.game = {
    startingSeatCursor: room.game.startingSeatCursor || 0,
    phase: 'waiting-shuffle',
    dealerId: startingPlayer.id,
    turnPlayerId: null,
    turnOrder: seatOrder.map((p) => p.id),
    hands: {},
    finishOrder: [],
    deck,
    lastPass: null,
    setAlertVersion: 0,
    lastSetClaimerId: null,
    setRacePosition: 0,
    raceStarted: false,
  };
}

function dealHands(room, active) {
  const seatOrder = active.slice().sort((a, b) => a.seat - b.seat);
  const startIdx = seatOrder.findIndex((p) => p.id === room.game.dealerId);
  const ordered = seatOrder.slice(startIdx).concat(seatOrder.slice(0, startIdx));
  const hands = {};
  ordered.forEach((p) => (hands[p.id] = []));
  const deck = room.game.deck.slice();
  for (let round = 0; round < 3; round++) {
    for (const p of ordered) hands[p.id].push(deck.shift());
  }
  room.game.hands = hands;
}

function isMatchingHand(hand) {
  if (!Array.isArray(hand) || hand.length < 3) return false;
  const counts = new Map();
  for (const card of hand) {
    const count = (counts.get(card.name) || 0) + 1;
    if (count >= 3) return true;
    counts.set(card.name, count);
  }
  return false;
}

function nextInRotation(room, fromId) {
  const order = room.game.turnOrder.filter((id) => !room.game.finishOrder.includes(id));
  if (order.length === 0) return null;
  const idx = order.indexOf(fromId);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
}

function threeSetAction(room, player, action, payload) {
  const g = room.game;
  const active = store.activePlayers(room);

  if (action === 'shuffle') {
    if (g.phase !== 'waiting-shuffle') return { error: 'ALREADY_DEALT' };
    if (player.id !== g.dealerId) return { error: 'NOT_YOUR_TURN' };
    dealHands(room, active);
    g.phase = 'playing';
    g.turnPlayerId = g.dealerId;
    store.addLog(room, `Cards shuffled and dealt. ${player.name} goes first.`);
    store.touch(room);
    return { ok: true };
  }

  if (action === 'pass-card') {
    if (g.phase !== 'playing') return { error: 'NOT_PLAYING' };
    if (player.id !== g.turnPlayerId) return { error: 'NOT_YOUR_TURN' };
    const hand = g.hands[player.id] || [];
    const cardIdx = hand.findIndex((c) => c.id === payload?.cardId);
    if (cardIdx === -1) return { error: 'CARD_NOT_FOUND' };
    const nextId = nextInRotation(room, player.id);
    if (!nextId || nextId === player.id) return { error: 'NO_RECIPIENT' };
    const [card] = hand.splice(cardIdx, 1);
    g.hands[nextId] = g.hands[nextId] || [];
    g.hands[nextId].push(card);
    g.turnPlayerId = nextId;
    // Never expose the card identity in public room state.
    g.lastPass = { from: player.id, to: nextId };
    store.touch(room);
    return { ok: true };
  }

  if (action === 'call-set') {
    if (g.phase !== 'playing') return { error: 'NOT_PLAYING' };
    if (g.raceStarted) return { error: 'RACE_ALREADY_STARTED' };
    if (g.finishOrder.includes(player.id)) return { error: 'ALREADY_DONE' };
    const hand = g.hands[player.id] || [];
    if (!isMatchingHand(hand)) return { error: 'NOT_A_SET' };

    const totalActive = active.length;
    const position = 1;
    const points = 100;
    g.finishOrder.push(player.id);
    g.raceStarted = true;
    g.setAlertVersion += 1;
    g.lastSetClaimerId = player.id;
    g.setRacePosition = position;
    addScore(room, player.id, points);
    store.addLog(room, `${player.name} called SET! +${points} pts`);
    store.addChat(room, `🃏 ${player.name} called SET! — #${position} · +${points} points`, true);

    if (g.turnPlayerId === player.id) {
      const nxt = nextInRotation(room, player.id);
      g.turnPlayerId = nxt;
    }
    if (g.finishOrder.length === totalActive) {
      g.phase = 'round-complete';
      store.addLog(room, `Round ${room.round} complete!`);
    }
    store.touch(room);
    return { ok: true, points, position };
  }

  if (action === 'react-set') {
    if (g.phase !== 'playing') return { error: 'NOT_PLAYING' };
    if (!g.raceStarted) return { error: 'RACE_NOT_STARTED' };
    if (g.finishOrder.includes(player.id)) return { error: 'ALREADY_DONE' };

    const totalActive = active.length;
    const position = g.finishOrder.length + 1;
    const points = position === totalActive ? 0 : Math.max(0, 100 - 10 * (position - 1));
    g.finishOrder.push(player.id);
    g.setRacePosition = position;
    addScore(room, player.id, points);
    store.addLog(room, `${player.name} reacted to SET! #${position} · +${points} pts`);
    store.addChat(room, `⚡ ${player.name} reacted to SET! — #${position} · +${points} points`, true);

    if (g.finishOrder.length === totalActive) {
      g.phase = 'round-complete';
      store.addLog(room, `Round ${room.round} complete!`);
    }
    store.touch(room);
    return { ok: true, points, position };
  }

  if (action === 'next-round') {
    if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
    room.round += 1;
    store.resetRoundChat(room);
    room.game.startingSeatCursor = (room.game.startingSeatCursor || 0) + 1;
    setupThreeSetRound(room, active);
    store.addLog(room, `Round ${room.round} — cards reshuffled.`);
    store.touch(room);
    return { ok: true };
  }

  return { error: 'UNKNOWN_ACTION' };
}

function threeSetPublic(room) {
  const g = room.game;
  const handCounts = {};
  for (const [pid, hand] of Object.entries(g.hands || {})) handCounts[pid] = hand.length;
  return {
    phase: g.phase,
    dealerId: g.dealerId,
    turnPlayerId: g.turnPlayerId,
    finishOrder: g.finishOrder,
    handCounts,
    lastPass: g.lastPass,
    setAlertVersion: g.setAlertVersion || 0,
    lastSetClaimerId: g.lastSetClaimerId || null,
    setRacePosition: g.setRacePosition || g.finishOrder.length || 0,
    raceStarted: Boolean(g.raceStarted),
  };
}

function threeSetPrivate(room, playerId) {
  const hand = room.game.hands?.[playerId] || [];
  return {
    hand,
    isMyTurn: room.game.turnPlayerId === playerId,
    canCallSet: isMatchingHand(hand) && !room.game.finishOrder.includes(playerId),
  };
}

function chatAction(room, player, action, payload) {
  if (action !== 'send-chat') return null;
  const text = String(payload?.text || '').trim().slice(0, 300);
  if (!text) return { error: 'EMPTY_CHAT' };

  const clientMessageId = String(payload?.clientMessageId || '').trim().slice(0, 80);
  if (clientMessageId && !/^[A-Za-z0-9_-]{8,80}$/.test(clientMessageId)) {
    return { error: 'INVALID_CHAT_MESSAGE_ID' };
  }

  const before = room.chat.length;
  const message = store.addChat(room, text, false, player, clientMessageId || null);
  if (room.chat.length !== before) store.touch(room);
  return { ok: true, messageId: message?.id || null, duplicate: room.chatClientIds?.get(`${player.id}:${clientMessageId}`) === message?.id };
}



/* ------------------------- KIKI WORLD interactions ------------------------- */
/* ------------------------------- in-world game vote ------------------------------- */
const GAME_IDS = ['imposter','truthOrDare','guessWho','threeSet'];
export function gameProposalAction(room, player, action, payload={}) {
  if (action === 'ask-game') {
    if (!player.isCoordinator) return { error:'NOT_COORDINATOR' };
    if (room.currentGame) return { error:'GAME_IN_PROGRESS' };
    room.gameProposal = { askedBy: player.id, askedAt: Date.now(), votes: {} };
    store.addChat(room, `${player.name} asked everyone what game they want to play 🎮`, true);
    store.touch(room);
    return { ok:true };
  }
  if (action === 'vote-game') {
    if (room.currentGame) return { error:'GAME_IN_PROGRESS' };
    if (!room.gameProposal) return { error:'NO_GAME_PROPOSAL' };
    const game=String(payload?.game||'');
    if (!GAME_IDS.includes(game)) return { error:'INVALID_GAME' };
    if (!canStart(game, store.activePlayers(room).length)) return { error:'NOT_ENOUGH_PLAYERS' };
    room.gameProposal.votes[player.id]=game;
    store.touch(room);
    return { ok:true, game };
  }
  if (action === 'choose-game') {
    if (!player.isCoordinator) return { error:'NOT_COORDINATOR' };
    if (room.currentGame) return { error:'GAME_IN_PROGRESS' };
    const game=String(payload?.game||'');
    if (!GAME_IDS.includes(game)) return { error:'INVALID_GAME' };
    if (!canStart(game, store.activePlayers(room).length)) return { error:'NOT_ENOUGH_PLAYERS' };
    startGame(room,game);
    return { ok:true, state:serializeProposal(room) };
  }
  return null;
}
export function serializeProposal(room) {
  if (!room.gameProposal) return null;
  const counts={};
  for (const g of GAME_IDS) counts[g]=0;
  for (const g of Object.values(room.gameProposal.votes||{})) if (counts[g]!==undefined) counts[g]++;
  return { askedAt:room.gameProposal.askedAt, askedBy:room.gameProposal.askedBy, votes:counts, myVote:null };
}

const AVATAR_ACTIONS = new Set(['idle','walk','run','carry','sit','sleep','wave','wink','laugh','cry','clap','cheer','talk','kneel','dance','cuddle','rest-lap','rest-shoulder','rest-forehead','hold-hands','hug','sit-lap','sit-together','play','lay-floor','lay-next','lay-couch','lay-sleepingbag','stretch','yawn','high-five','fist-bump','handshake','comfort','celebrate','pose','drink','eat-together','watch-sky','phone','greet','stand','wake','think','surprised','angry']);
const WORLD_SPOTS = {
  couch:[63,62], chair:[82,57], window:[88,28], popcorn:[46,68], sleepingbag:[25,72], bed:[58,77], lounge:[61,62], snacks:[46,68], game:[84,58], garden:[18,30], floor:[52,76], toy:[22,42]
};
const WORLD_BLOCKS = [
  [34,48,58,67], [58,43,76,61], [74,50,90,66], [9,60,30,78], [38,68,57,84], [45,73,62,88]
];
const INTERACTION_SEATS = {
  couch:[[58,62],[64,62],[70,62],[61,68]], chair:[[82,59]], sleepingbag:[[24,75],[31,75],[38,75],[45,75],[52,75]], bed:[[58,78]], tv:[[25,44],[29,44],[33,44],[37,44]], game:[[78,61],[84,61],[90,61],[84,67]]
};
function nearestWalkable(x,y){
  let px=Math.max(5,Math.min(95,Number(x))), py=Math.max(15,Math.min(90,Number(y)));
  for(const [x1,y1,x2,y2] of WORLD_BLOCKS){ if(px>=x1&&px<=x2&&py>=y1&&py<=y2){ const dx=Math.min(Math.abs(px-x1),Math.abs(px-x2)), dy=Math.min(Math.abs(py-y1),Math.abs(py-y2)); if(dx<dy) px=px<x1?x1-2:x2+2; else py=py<y1?y1-2:y2+2; } }
  return [Math.max(5,Math.min(95,px)),Math.max(15,Math.min(90,py))];
}
function reserveSeat(room,player,spot){
  room.interactionReservations=room.interactionReservations||{}; const list=INTERACTION_SEATS[spot]||[]; if(!list.length)return null;
  const used=new Set(Object.entries(room.interactionReservations).filter(([id])=>room.players.some(p=>p.id===id&&p.active)).map(([,v])=>v.key));
  const seat=list.map((xy,i)=>({key:`${spot}:${i}`,x:xy[0],y:xy[1]})).find(v=>!used.has(v.key));
  if(!seat)return {error:'INTERACTION_OCCUPIED'}; room.interactionReservations[player.id]=seat; return seat;
}
function releaseSeat(room,player){ if(room.interactionReservations) delete room.interactionReservations[player.id]; }

function cleanAvatarText(text){ return String(text||'').trim().slice(0,240); }
function interactionNeedsPermission(command, targetId, playerId){
  if (!targetId || targetId===playerId) return false;
  return ['hug','cuddle','kiss','sit-lap','rest-lap','rest-shoulder','rest-forehead','hold-hands','dance-together','dance','play','sit-together','lay-next','high-five','fist-bump','handshake','comfort'].includes(command);
}
function findTarget(room, payload){ const id=String(payload?.targetPlayerId||''); if(!id) return null; const t=store.findPlayer(room,id); return t?.active ? t : null; }
function startAvatarMotion(room, player, command, payload={}){
  let action=String(command||'idle');
  if(action==='kiss') action='kiss';
  if(!AVATAR_ACTIONS.has(action) && action!=='kiss' && action!=='dance-together') return {error:'INVALID_AVATAR_ACTION'};
  if(['walk','run','idle','stand','wake'].includes(action)) releaseSeat(room,player);
  const spotName=payload.spot ? String(payload.spot).toLowerCase() : null;
  const spot=spotName ? WORLD_SPOTS[spotName] : null;
  if(spot){ releaseSeat(room,player); const seat=reserveSeat(room,player,spotName); if(seat?.error)return {error:seat.error}; const xy=seat||{x:spot[0],y:spot[1]}; player.targetX=xy.x; player.targetY=xy.y; player.x=xy.x; player.y=xy.y; }
  if(payload.x!=null && payload.y!=null){ const x=Number(payload.x), y=Number(payload.y); if(Number.isFinite(x)&&Number.isFinite(y)){const [wx,wy]=nearestWalkable(x,y); player.x=wx;player.y=wy;player.targetX=wx;player.targetY=wy;} }
  player.action=action; player.actionUntil=Date.now()+7000;
  store.touch(room); return {ok:true, action};
}
function distance(a,b){ const dx=(Number(a?.x)||0)-(Number(b?.x)||0); const dy=(Number(a?.y)||0)-(Number(b?.y)||0); return Math.hypot(dx,dy); }
function interactionInRange(from,to,max=28){ return distance(from,to) <= max; }

function queueInteraction(room, from, to, command, text, kind='avatar'){
  room.pendingInteractions=room.pendingInteractions||[];
  room.interactionSeq=(room.interactionSeq||0)+1;
  if(!interactionInRange(from,to)) return {error:'INTERACTION_TOO_FAR'};
  const request={id:`ir_${room.interactionSeq}_${Date.now()}`,kind,from:from.id,to:to.id,fromName:from.name,toName:to.name,command,text:cleanAvatarText(text),createdAt:Date.now(),expiresAt:Date.now()+20000};
  room.pendingInteractions.push(request); while(room.pendingInteractions.length>100) room.pendingInteractions.shift(); store.touch(room); return request;
}
function avatarCommand(room, player, action, payload){
  if(action==='avatar-command'){
    const text=cleanAvatarText(payload?.text); if(!text) return {error:'EMPTY_AVATAR_COMMAND'};
    const lower=text.toLowerCase();
    let command='idle', targetId=payload?.targetPlayerId?String(payload.targetPlayerId):null, spot=null;
    const targetName=String(payload?.targetName||'').trim();
    if(!targetId && targetName){ const t=room.players.find(p=>p.active&&p.id!==player.id&&p.name.toLowerCase()===targetName.toLowerCase()); targetId=t?.id||null; }
    const hit=(words)=>words.some(w=>lower.includes(w));
    if(hit(['kiss'])) command='kiss'; else if(hit(['greet'])) command='greet'; else if(hit(['stand'])) command='stand'; else if(hit(['wake'])) command='wake'; else if(hit(['think'])) command='think'; else if(hit(['surprised'])) command='surprised'; else if(hit(['angry'])) command='angry'; else if(hit(['phone'])) command='phone'; else if(hit(['cry'])) command='cry'; else if(hit(['clap'])) command='clap'; else if(hit(['cheer'])) command='cheer'; else if(hit(['lay next','lie next','lying next'])) command='lay-next'; else if(hit(['lay on couch','lay on the couch','lie on couch','lie on the couch','lying on couch','lying on the couch'])) command='lay-couch'; else if(hit(['lay in sleeping bag','lay in the sleeping bag','lie in sleeping bag','lie in the sleeping bag','lay on sleeping bag','lay on the sleeping bag','lie on sleeping bag','lie on the sleeping bag'])) command='lay-sleepingbag'; else if(hit(['lay on floor','lay on the floor','lie on floor','lie on the floor','lying on floor','lying on the floor'])) command='lay-floor'; else if(hit(['stretch'])) command='stretch'; else if(hit(['yawn'])) command='yawn'; else if(hit(['high five','high-five'])) command='high-five'; else if(hit(['fist bump','fist-bump'])) command='fist-bump'; else if(hit(['handshake','shake hands'])) command='handshake'; else if(hit(['comfort'])) command='comfort'; else if(hit(['celebrate','cheer'])) command='celebrate'; else if(hit(['pose'])) command='pose'; else if(hit(['drink'])) command='drink'; else if(hit(['watch the night sky','watch sky','night sky'])) command='watch-sky'; else if(hit(['kiss'])) command='kiss'; else if(hit(['hug'])) command='hug'; else if(hit(['cuddle'])) command='cuddle'; else if(hit(['rest my head on','head on'])&&hit(['shoulder'])) command='rest-shoulder'; else if(hit(['rest my head on','head on'])&&hit(['lap'])) command='rest-lap'; else if(hit(['forehead'])) command='rest-forehead'; else if(hit(['sit on'])&&hit(['lap'])) command='sit-lap'; else if(hit(['hold hands','holding hands'])) command='hold-hands'; else if(hit(['dance together','dance with'])) command='dance-together'; else if(hit(['sit together','sit beside','sit with'])) command='sit-together'; else if(hit(['dance'])) command='dance'; else if(hit(['wave'])) command='wave'; else if(hit(['wink'])) command='wink'; else if(hit(['laugh'])) command='laugh'; else if(hit(['eat','popcorn'])) command='eat'; else if(hit(['sleep'])) command='sleep'; else if(hit(['lie','lay'])) command='lay-floor'; else if(hit(['kneel'])) command='kneel'; else if(hit(['play'])) command='play'; else if(hit(['sit'])) command='sit'; else if(hit(['walk'])) command='walk'; else if(hit(['run'])) command='run';
    for(const [key,xy] of Object.entries(WORLD_SPOTS)) if(lower.includes(key)) { spot=key; break; }
    if(!spot && command==='sit') spot='couch';
    if(!spot && ['sleep','lay-sleepingbag'].includes(command)) spot='sleepingbag';
    if(!spot && command==='watch-sky') spot='window';
    if(!spot && ['eat','drink'].includes(command)) spot='snacks';
    if(!spot && command==='play') spot='game';
    const target=findTarget(room,{targetPlayerId:targetId});
    if(target && interactionNeedsPermission(command,target.id,player.id)){
      const request=queueInteraction(room,player,target,command,text); if(request?.error)return request; return {ok:true,private:true,requestId:request.id,status:'pending'};
    }
    return startAvatarMotion(room,player,command,{spot,targetPlayerId:target?.id});
  }
  if(action==='interaction-response'){
    const requestId=String(payload?.requestId||''); const accept=Boolean(payload?.accept); room.pendingInteractions=room.pendingInteractions||[];
    const idx=room.pendingInteractions.findIndex(r=>r.id===requestId && r.to===player.id && r.expiresAt>Date.now()); if(idx<0) return {error:'INTERACTION_NOT_FOUND'};
    const req=room.pendingInteractions[idx]; room.pendingInteractions.splice(idx,1);
    const from=store.findPlayer(room,req.from); if(!from||!from.active) return {error:'PLAYER_NOT_AVAILABLE'};
    if(accept && !interactionInRange(from,player)) return {error:'INTERACTION_TOO_FAR'};
    if(!accept){ store.touch(room); return {ok:true,accepted:false,requestId}; }
    const action=req.command;
    if(req.kind==='pet') {
      const fp=from.pet || {}; const tp=player.pet || {}; const compatible=action==='follow'?'follow':action;
      fp.targetX=tp.x||50; fp.targetY=tp.y||50; fp.x=fp.targetX; fp.y=fp.targetY; tp.targetX=fp.x; tp.targetY=fp.y; tp.x=fp.x; tp.y=fp.y;
      fp.action=compatible; tp.action=compatible; fp.actionUntil=tp.actionUntil=Date.now()+8000; fp.interactionWith=player.id; tp.interactionWith=from.id; store.touch(room);
      return {ok:true,accepted:true,requestId,command:action,kind:'pet'};
    }
    // Synchronized actions for both participants. Kiss is represented as a non-explicit affectionate motion.
    const pairAction = action==='dance-together'?'dance':action;
    const mx=((Number(from.x)||50) + (Number(player.x)||50))/2;
    const my=((Number(from.y)||60) + (Number(player.y)||60))/2;
    // Keep the pair close and side-by-side for synchronized interactions.
    const ax=Math.max(6,Math.min(94,mx-3)), bx=Math.max(6,Math.min(94,mx+3));
    const ay=Math.max(16,Math.min(88,my)), by=Math.max(16,Math.min(88,my));
    startAvatarMotion(room,from,pairAction,{x:ax,y:ay});
    startAvatarMotion(room,player,pairAction,{x:bx,y:by});
    from.interactionWith=player.id; player.interactionWith=from.id;
    from.interactionId=player.interactionId=`ix_${requestId}`;
    from.actionUntil=player.actionUntil=Date.now()+8000;
    store.touch(room); return {ok:true,accepted:true,requestId,command:action};
  }
  return null;
}

/* ------------------------------- toys ------------------------------- */
const TOYS = new Set(['teddy','bear','car','blocks','ball','yo-yo','puzzle','toy']);
function toyAction(room,player,action,payload={}) {
  if(action!=='toy') return null;
  const toy=String(payload?.toy||'').toLowerCase();
  if(!TOYS.has(toy)) return {error:'INVALID_TOY'};
  if(payload?.drop){ player.carrying=null; store.touch(room); return {ok:true,carrying:null}; }
  player.carrying=toy;
  player.action='play'; player.actionUntil=Date.now()+5000;
  store.touch(room); return {ok:true,carrying:toy};
}

/* ------------------------------- pets + voice ------------------------------- */

const PET_ACTIONS = new Set(['idle','walk','run','carry','play','cuddle','sit','sleep','wave','dance','follow','come','stay','feed','eat','drink','brush','groom','bathe','fetch','chase','pose','rest','happy','sad','stop','wait','hug','go-bed']);
const VOICE_SIGNAL_TYPES = new Set(['offer','answer','candidate','leave']);

function normalizePetName(value, type) {
  const clean = String(value || '').trim().replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16);
  return clean || PET_DEFAULT_NAMES[type] || 'Pet';
}

function petAction(room, player, action, payload) {
  const pet = player.pet || (player.pet = { type:'dog', name:'Buddy', x:50, y:50, targetX:50, targetY:50, action:'idle', actionUntil:0, voiceOn:false });
  if (action === 'set-pet') {
    const type = String(payload?.type || '').toLowerCase();
    if (!PET_TYPES.includes(type)) return { error: 'INVALID_PET' };
    pet.type = type;
    pet.name = normalizePetName(pet.name, type);
    pet.action = 'idle';
    store.touch(room);
    return { ok:true, pet: { type:pet.type, name:pet.name } };
  }
  if (action === 'set-pet-name') {
    pet.name = normalizePetName(payload?.name, pet.type);
    store.touch(room);
    return { ok:true, petName:pet.name };
  }
  if (action === 'pet-move') {
    const x = Number(payload?.x), y = Number(payload?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 5 || x > 95 || y < 12 || y > 88) return { error:'INVALID_PET_POSITION' };
    pet.targetX = x; pet.targetY = y; pet.x = x; pet.y = y;
    pet.action = payload?.run ? 'run' : 'walk';
    pet.actionUntil = Date.now() + 5000;
    store.touch(room);
    return { ok:true };
  }
  if (action === 'pet-command') {
    const targetId = payload?.targetPlayerId ? String(payload.targetPlayerId) : null;
    const command = String(payload?.command || 'idle');
    if (!PET_ACTIONS.has(command)) return { error:'INVALID_PET_COMMAND' };
    if (targetId) {
      const target = store.findPlayer(room, targetId);
      if (!target || !target.active || target.id===player.id) return { error:'INVALID_TARGET' };
      if (['play','cuddle','dance','follow'].includes(command)) {
        const request=queueInteraction(room,player,target,command,`${command} with ${target.name}'s pet`,'pet');
        if(request?.error)return request; return {ok:true,private:true,requestId:request.id,status:'pending',kind:'pet'};
      }
      const targetPet = target.pet || {};
      pet.targetX = Number.isFinite(targetPet.x) ? targetPet.x : 50;
      pet.targetY = Number.isFinite(targetPet.y) ? targetPet.y : 50;
      pet.x = pet.targetX; pet.y = pet.targetY;
      if (['play','cuddle','dance'].includes(command)) {
        const tp=target.pet || {}; tp.targetX=pet.x; tp.targetY=pet.y; tp.x=pet.x; tp.y=pet.y; tp.action=command; tp.actionUntil=Date.now()+7000; tp.interactionWith=player.id; pet.interactionWith=target.id;
      }
    }
    if(command==='come') { pet.targetX=player.x; pet.targetY=player.y; pet.x=player.x; pet.y=player.y; pet.action='walk'; }
    else if(command==='follow') { pet.targetX=player.x; pet.targetY=player.y; pet.x=player.x; pet.y=player.y; pet.action='follow'; }
    else if(command==='stay'||command==='wait'||command==='stop') { pet.targetX=pet.x; pet.targetY=pet.y; pet.action=command==='stop'?'idle':'stay'; }
    else if(command==='hug') { pet.targetX=player.x; pet.targetY=player.y; pet.x=player.x; pet.y=player.y; pet.action='happy'; }
    else if(command==='eat') pet.action='eat';
    else if(command==='happy'||command==='sad') pet.action=command;
    else if(command==='go-bed') { pet.targetX=32; pet.targetY=78; pet.x=32; pet.y=78; pet.action='sleep'; }
    else pet.action=command;
    pet.actionUntil = Date.now() + 7000;
    store.touch(room);
    return { ok:true, command, targetPlayerId:targetId };
  }
  if (action === 'voice-toggle') {
    pet.voiceOn = Boolean(payload?.enabled);
    store.touch(room);
    return { ok:true, enabled:pet.voiceOn };
  }
  if (action === 'voice-signal') {
    const to = String(payload?.to || '');
    const type = String(payload?.type || '');
    if (!to || to === player.id || !VOICE_SIGNAL_TYPES.has(type)) return { error:'INVALID_VOICE_SIGNAL' };
    const target = store.findPlayer(room, to);
    if (!target || !target.active) return { error:'INVALID_TARGET' };
    if (type !== 'leave' && !player.pet?.voiceOn) return { error:'VOICE_OFF' };
    const signal = { from: player.id, type };
    if (type === 'offer' || type === 'answer') {
      const sdp = payload?.sdp;
      if (!sdp || typeof sdp !== 'object') return { error:'INVALID_VOICE_SIGNAL' };
      signal.sdp = sdp;
    } else if (type === 'candidate') {
      const candidate = payload?.candidate;
      if (!candidate || typeof candidate !== 'object') return { error:'INVALID_VOICE_SIGNAL' };
      signal.candidate = candidate;
    }
    const queue = room.voiceSignals.get(to) || [];
    queue.push(signal);
    if (queue.length > 40) queue.splice(0, queue.length - 40);
    room.voiceSignals.set(to, queue);
    store.touch(room);
    return { ok:true };
  }
  return null;
}

/* ---------------------------------- dispatch ---------------------------------- */

export function performAction(room, player, action, payload) {
  const proposalResult = gameProposalAction(room, player, action, payload);
  if (proposalResult) return proposalResult;
  const toyResult = toyAction(room, player, action, payload);
  if (toyResult) return toyResult;
  const avatarResult = avatarCommand(room, player, action, payload);
  if (avatarResult) return avatarResult;
  const petResult = petAction(room, player, action, payload);
  if (petResult) return petResult;
  const generic = chatAction(room, player, action, payload);
  if (generic) return generic;
  if (action === 'switch-game') {
    if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
    const game = String(payload?.game || '');
    if (!['imposter', 'truthOrDare', 'guessWho', 'threeSet'].includes(game)) return { error: 'INVALID_GAME' };
    const activePlayers = store.activePlayers(room);
    const activeCount = activePlayers.length;
    if (!canStart(game, activeCount)) return { error: 'NOT_ENOUGH_PLAYERS' };
    for (const p of activePlayers) {
      p.score = 0;
      p.roundScores = {};
    }
    startGame(room, game);
    return { ok: true, switchedTo: game };
  }
  switch (room.currentGame) {
    case 'imposter':
      return imposterAction(room, player, action, payload);
    case 'truthOrDare':
      return truthOrDareAction(room, player, action, payload);
    case 'guessWho':
      return guessWhoAction(room, player, action, payload);
    case 'threeSet':
      return threeSetAction(room, player, action, payload);
    default:
      return { error: 'NO_ACTIVE_GAME' };
  }
}

export function publicGameView(room) {
  if (!room.currentGame || !room.game) return null;
  switch (room.currentGame) {
    case 'imposter':
      return imposterPublic(room);
    case 'truthOrDare':
      return truthOrDarePublic(room);
    case 'guessWho':
      return guessWhoPublic(room);
    case 'threeSet':
      return threeSetPublic(room);
    default:
      return null;
  }
}

export function privateGameView(room, playerId) {
  if (!room.currentGame || !room.game) return null;
  switch (room.currentGame) {
    case 'imposter':
      return imposterPrivate(room, playerId);
    case 'threeSet':
      return threeSetPrivate(room, playerId);
    default:
      return null; // truthOrDare & guessWho have no private data
  }
}
