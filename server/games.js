import { store, randInt, secureShuffle, pickRandom } from './store.js';
import { WORD_PAIRS, SET_NAMES } from './data.js';

const MIN_PLAYERS = { imposter: 3, truthOrDare: 3, guessWho: 3, threeSet: 4 };

export function canStart(game, activeCount) {
  return activeCount >= (MIN_PLAYERS[game] || 3) && activeCount <= 10;
}

/* ---------------------------------- start ---------------------------------- */

export function startGame(room, game) {
  room.currentGame = game;
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
    room.round += 1;
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
    if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
    if (room.game.resultsRecorded) return { error: 'ALREADY_RECORDED' };
    const activeIds = new Set(store.activePlayers(room).map((p) => p.id));
    const correct = new Set((Array.isArray(payload?.correctPlayerIds) ? payload.correctPlayerIds : [])
      .filter((id) => activeIds.has(id) && id !== room.game.thinkerId));
    room.game.resultsRecorded = true;
    store.addLog(room, `${correct.size} player(s) guessed correctly.`);
    store.touch(room);
    return { ok: true };
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
    if (g.finishOrder.includes(player.id)) return { error: 'ALREADY_DONE' };
    const hand = g.hands[player.id] || [];
    if (!isMatchingHand(hand)) return { error: 'NOT_A_SET' };

    g.finishOrder.push(player.id);
    const totalActive = active.length;
    const position = g.finishOrder.length;
    const points = position === totalActive ? 0 : Math.max(0, 100 - 10 * (position - 1));
    addScore(room, player.id, points);
    g.setAlertVersion += 1;
    g.lastSetClaimerId = player.id;
    g.setRacePosition = position;
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

/* ---------------------------------- dispatch ---------------------------------- */

export function performAction(room, player, action, payload) {
  const generic = chatAction(room, player, action, payload);
  if (generic) return generic;
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
