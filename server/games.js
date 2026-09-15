import { store, randInt, secureShuffle, pickRandom } from './store.js';
import { WORD_PAIRS } from './data.js';

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
  // Scores belong to the currently selected game. Switching games starts a
  // fresh scoreboard instead of carrying points over from the previous game.
  for (const p of active) {
    p.score = 0;
    p.roundScores = {};
  }
  if (game === 'imposter') {
    room.game = { resultsRecorded: false };
    assignImposterRound(room, active);
  } else if (game === 'truthOrDare') {
    room.game = { lastSelected: null, truthReceiverId: null, truthAskerId: null, wheelOrder: [], spinToken: null, choiceToken: null, chosenType: null };
  } else if (game === 'guessWho') {
    room.game = { thinkerId: null, wheelOrder: [], spinToken: null, resultsRecorded: false, thinkerConfirmed: false };
  } else if (game === 'threeSet') {
    room.game = { startingSeatCursor: 0 };
    startThreeSetSetup(room, active);
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
    if (!g.truthReceiverId || g.truthReceiverId !== player.id) return { error: 'NOT_SELECTED_PLAYER' };
    if (g.chosenType) return { error: 'CHOICE_ALREADY_MADE' };
    const choice = String(payload?.choice || '').toLowerCase();
    if (!['truth', 'dare'].includes(choice)) return { error: 'INVALID_CHOICE' };
    g.chosenType = choice;
    const asker = store.findPlayer(room, g.truthAskerId)?.name || '?';
    store.addChat(room, `${player.name} chose ${choice.toUpperCase()} ${choice === 'truth' ? '💬' : '🔥'}. ${asker} is up to ask/give it!`, true);
    store.touch(room);
    return { ok: true, choice };
  }
  if (action !== 'spin') return { error: 'UNKNOWN_ACTION' };
  if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
  const active = store.activePlayers(room);
  if (active.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' };
  const order = secureShuffle(active).map((p) => p.id);
  const receiverIndex = randInt(order.length);
  const askerIndex = (receiverIndex + 1 + randInt(order.length - 1)) % order.length;
  const receiverId = order[receiverIndex];
  const askerId = order[askerIndex];
  const g = room.game;
  if (g.spinToken) store.resetRoundChat(room);
  g.lastSelected = receiverId;
  g.truthReceiverId = receiverId;
  g.truthAskerId = askerId;
  g.wheelOrder = order;
  g.spinToken = `${Date.now()}_${randInt(100000)}`;
  g.choiceToken = g.spinToken;
  g.chosenType = null;
  const receiverName = store.findPlayer(room, receiverId)?.name || '?';
  const askerName = store.findPlayer(room, askerId)?.name || '?';
  store.addLog(room, `🔴 ${receiverName} faces the Truth/Dare · 🔵 ${askerName} asks/gives it!`);
  store.touch(room);
  return { ok: true, receiverId, askerId };
}
function truthOrDarePublic(room) {
  return { lastSelected: room.game.lastSelected, truthReceiverId: room.game.truthReceiverId, truthAskerId: room.game.truthAskerId, wheelOrder: room.game.wheelOrder, spinToken: room.game.spinToken, choiceToken: room.game.choiceToken, chosenType: room.game.chosenType };
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

function normalizeSetWord(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function setupThreeSetRound(room, active) {
  const words = room.game.setWords || [];
  let deck = [];
  words.forEach((name, si) => {
    for (let k = 0; k < 3; k++) deck.push({ id: `c_${si}_${k}`, name });
  });
  deck = secureShuffle(deck);

  const startCursor = room.game.startingSeatCursor || 0;
  const seatOrder = active.slice().sort((a, b) => a.seat - b.seat);
  const startingPlayer = seatOrder[startCursor % seatOrder.length];

  room.game = {
    startingSeatCursor: room.game.startingSeatCursor || 0,
    setWords: words,
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

function startThreeSetSetup(room, active) {
  const seatOrder = active.slice().sort((a, b) => a.seat - b.seat);
  const startingSeatCursor = room.game?.startingSeatCursor || 0;
  const startingPlayer = seatOrder[startingSeatCursor % seatOrder.length];
  room.game = {
    startingSeatCursor,
    phase: 'collecting-words',
    dealerId: startingPlayer.id,
    turnPlayerId: null,
    turnOrder: seatOrder.map((p) => p.id),
    wordSuggestions: {},
    setWords: [],
    hands: {},
    finishOrder: [],
    deck: [],
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

  if (action === 'submit-set-word') {
    if (g.phase !== 'collecting-words') return { error: 'WORD_ENTRY_CLOSED' };
    if (g.wordSuggestions?.[player.id]) return { error: 'WORD_ALREADY_SUBMITTED' };
    const word = normalizeSetWord(payload?.word);
    if (word.length < 2) return { error: 'WORD_TOO_SHORT' };
    const normalized = word.toLocaleLowerCase();
    const duplicate = Object.values(g.wordSuggestions || {}).some((entry) => entry.normalized === normalized);
    if (duplicate) return { error: 'WORD_ALREADY_TAKEN' };

    g.wordSuggestions[player.id] = { word, normalized, submittedAt: Date.now() };
    const count = Object.keys(g.wordSuggestions).length;
    if (count === active.length) {
      g.setWords = active.map((p) => g.wordSuggestions[p.id].word);
      g.phase = 'waiting-shuffle';
      store.addLog(room, `All players submitted Three Set words: ${g.setWords.join(', ')}.`);
      store.addChat(room, `🃏 Three Set words are locked: ${g.setWords.join(' · ')}`, true);
    } else {
      store.addLog(room, `${player.name} submitted a Three Set word (${count}/${active.length}).`);
    }
    store.touch(room);
    return { ok: true, word, submittedCount: count, totalPlayers: active.length, complete: count === active.length };
  }

  if (action === 'shuffle') {
    if (g.phase !== 'waiting-shuffle') return { error: 'ALREADY_DEALT' };
    if (player.id !== g.dealerId) return { error: 'NOT_YOUR_TURN' };
    setupThreeSetRound(room, active);
    dealHands(room, active);
    room.game.phase = 'playing';
    room.game.turnPlayerId = room.game.dealerId;
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
    g.lastPass = { from: player.id, to: nextId };
    store.touch(room);
    return { ok: true };
  }

  if (action === 'call-set') {
    if (g.phase !== 'playing') return { error: 'NOT_PLAYING' };
    if (g.finishOrder.includes(player.id)) return { error: 'ALREADY_DONE' };
    const hand = g.hands[player.id] || [];
    if (!isMatchingHand(hand)) return { error: 'NOT_A_SET' };
    return claimThreeSetPosition(room, player);
  }

  if (action === 'react-set') {
    if (g.phase !== 'playing') return { error: 'NOT_PLAYING' };
    if (g.finishOrder.includes(player.id)) return { error: 'ALREADY_DONE' };
    const version = Number(payload?.alertVersion || 0);
    if (version !== Number(g.setAlertVersion || 0)) return { error: 'SET_ALERT_EXPIRED' };
    return claimThreeSetPosition(room, player);
  }

  if (action === 'next-round') {
    if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
    if (g.phase !== 'round-complete') return { error: 'WAIT_FOR_ROUND_COMPLETE' };
    room.round += 1;
    store.resetRoundChat(room);
    room.game.startingSeatCursor = (room.game.startingSeatCursor || 0) + 1;
    // Keep the original Round 1 word set for the whole Three Set game.
    // Only the first round collects player suggestions; later rounds
    // immediately prepare a fresh shuffled deal using the same words.
    setupThreeSetRound(room, active);
    store.addLog(room, `Round ${room.round} — same word set, new shuffle.`);
    store.touch(room);
    return { ok: true };
  }

  return { error: 'UNKNOWN_ACTION' };
}

function claimThreeSetPosition(room, player) {
  const g = room.game;
  const active = store.activePlayers(room);
  const totalActive = active.length;
  const position = g.finishOrder.length + 1;
  const points = position === totalActive ? 0 : Math.max(0, 100 - 10 * (position - 1));
  g.finishOrder.push(player.id);
  addScore(room, player.id, points);
  g.setAlertVersion = (g.setAlertVersion || 0) + 1;
  g.lastSetClaimerId = player.id;
  g.setRacePosition = position;
  store.addLog(room, `${player.name} claimed SET position #${position}! +${points} pts`);
  store.addChat(room, `🃏 ${player.name} claimed SET position #${position} · +${points} points`, true);

  if (g.turnPlayerId === player.id) g.turnPlayerId = nextInRotation(room, player.id);
  if (g.finishOrder.length === totalActive) {
    g.phase = 'round-complete';
    g.turnPlayerId = null;
    store.addLog(room, `Round ${room.round} complete!`);
  }
  store.touch(room);
  return { ok: true, points, position };
}

function threeSetPublic(room) {
  const g = room.game;
  const handCounts = {};
  for (const [pid, hand] of Object.entries(g.hands || {})) handCounts[pid] = hand.length;
  const wordSuggestions = {};
  for (const p of store.activePlayers(room)) {
    const entry = g.wordSuggestions?.[p.id];
    wordSuggestions[p.id] = entry ? { word: entry.word, submitted: true } : { submitted: false };
  }
  return {
    phase: g.phase,
    dealerId: g.dealerId,
    turnPlayerId: g.turnPlayerId,
    turnOrder: g.turnOrder,
    finishOrder: g.finishOrder,
    handCounts,
    lastPass: g.lastPass,
    setAlertVersion: g.setAlertVersion || 0,
    lastSetClaimerId: g.lastSetClaimerId || null,
    setRacePosition: g.setRacePosition || g.finishOrder.length || 0,
    setWords: g.phase === 'collecting-words' ? [] : (g.setWords || []),
    wordSuggestions,
  };
}

function threeSetPrivate(room, playerId) {
  const hand = room.game.hands?.[playerId] || [];
  const ownSuggestion = room.game.wordSuggestions?.[playerId]?.word || null;
  return {
    hand,
    isMyTurn: room.game.turnPlayerId === playerId,
    canCallSet: isMatchingHand(hand) && !room.game.finishOrder.includes(playerId),
    ownSuggestion,
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


/* --------------------------------- voice chat --------------------------------- */

function voiceAction(room, player, action, payload) {
  if (!room.voice) room.voice = { states: {}, signals: [] };
  if (action === 'voice-state') {
    room.voice.states[player.id] = Boolean(payload?.enabled);
    if (!room.voice.states[player.id]) {
      room.voice.signals = room.voice.signals.filter((s) => s.from !== player.id && s.to !== player.id);
    }
    store.touch(room);
    return { ok: true, enabled: room.voice.states[player.id] };
  }

  if (action === 'voice-signal') {
    const to = String(payload?.to || '');
    const target = store.findPlayer(room, to);
    if (!target || !target.active || target.id === player.id) return { error: 'INVALID_VOICE_TARGET' };
    if (!room.voice.states[player.id] || !room.voice.states[target.id]) return { error: 'VOICE_NOT_ACTIVE' };
    const signal = payload?.signal;
    if (!signal || !['offer', 'answer', 'candidate'].includes(signal.type)) return { error: 'INVALID_VOICE_SIGNAL' };
    const encoded = JSON.stringify(signal);
    if (encoded.length > 16000) return { error: 'VOICE_SIGNAL_TOO_LARGE' };

    const now = Date.now();
    room.voice.signals = (room.voice.signals || []).filter((s) => now - s.ts < 60_000);
    room.voice.signals.push({
      id: `vs_${now}_${randInt(1_000_000)}`,
      ts: now,
      from: player.id,
      to: target.id,
      signal,
    });
    if (room.voice.signals.length > 200) room.voice.signals.splice(0, room.voice.signals.length - 200);
    store.touch(room);
    return { ok: true };
  }

  return { error: 'UNKNOWN_ACTION' };
}

/* ---------------------------------- dispatch ---------------------------------- */

export function performAction(room, player, action, payload) {
  if (action === 'voice-state' || action === 'voice-signal') {
    return voiceAction(room, player, action, payload);
  }
  const generic = chatAction(room, player, action, payload);
  if (generic) return generic;
  if (action === 'switch-game') {
    if (!player.isCoordinator) return { error: 'NOT_COORDINATOR' };
    const game = String(payload?.game || '');
    if (!['imposter', 'truthOrDare', 'guessWho', 'threeSet'].includes(game)) return { error: 'INVALID_GAME' };
    const activeCount = store.activePlayers(room).length;
    if (!canStart(game, activeCount)) return { error: 'NOT_ENOUGH_PLAYERS' };
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
