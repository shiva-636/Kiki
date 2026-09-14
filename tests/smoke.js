import assert from 'node:assert/strict';
import { store, secureShuffle } from '../server/store.js';
import { canStart, startGame, performAction, privateGameView, publicGameView } from '../server/games.js';

// Core range rules
for (let n = 3; n <= 10; n++) assert.equal(canStart('imposter', n), true);
assert.equal(canStart('threeSet', 3), false);
assert.equal(canStart('threeSet', 4), true);

// Build a 5-player room.
const { room, player: creator } = store.createRoom({ name: 'P1', roomName: 'Friday Chaos', maxPlayers: 5 });
const players = [creator];
for (let i = 2; i <= 5; i++) players.push(store.joinRoom(room, `P${i}`).player);

// Imposter: private data differs only by session and no public assignments.
startGame(room, 'imposter');
assert.equal(room.roomName, 'Friday Chaos');
assert.ok(privateGameView(room, players[0].id).word);
assert.equal(Object.hasOwn(publicGameView(room), 'assignments'), false);
assert.equal(publicGameView(room).lockedCount, 0);

// Every player locks their own private vote. Once all votes are locked,
// correct non-imposters automatically receive +10 and the imposter gets 0.
const imposterId = room.game.imposterId;
for (const p of players) {
  const target = p.id === imposterId ? players.find((x) => x.id !== p.id).id : imposterId;
  const result = performAction(room, p, 'lock-vote', { targetPlayerId: target });
  assert.equal(result.ok, true);
}
assert.equal(room.game.resultsRecorded, true);
for (const p of players) {
  assert.equal(p.score || 0, p.id === imposterId ? 0 : 10);
  assert.equal(privateGameView(room, p.id).voteLocked, true);
}
assert.equal(publicGameView(room).imposterId, imposterId);
assert.equal(performAction(room, creator, 'next-round', {}).ok, true);

// Close/reset by making a fresh room for Three Set.
store.closeRoom(room);
const { room: ts } = store.createRoom({ name: 'P1', maxPlayers: 5 });
const tsPlayers = [ts.players[0]];
for (let i = 2; i <= 5; i++) tsPlayers.push(store.joinRoom(ts, `P${i}`).player);
startGame(ts, 'threeSet');
const dealer = store.findPlayer(ts, ts.game.dealerId);
assert.equal(performAction(ts, dealer, 'shuffle', {}).ok, true);

// Private hands are only returned for the requested player and public state has no card identities.
const mine = privateGameView(ts, tsPlayers[0].id);
assert.equal(mine.hand.length, 3);
assert.equal(JSON.stringify(publicGameView(ts)).includes('Lion'), false);
assert.equal(JSON.stringify(publicGameView(ts)).includes('Tiger'), false);

// Leave is blocked during active games.
assert.deepEqual(store.leaveRoom(ts, tsPlayers[1]), { error: 'GAME_IN_PROGRESS' });

// Verify SET scoring formula: last finisher gets 0.
// Give player 1 a triple inside a 4-card hand to test the previous bug.
ts.game.hands[tsPlayers[0].id].push({ id: 'extra', name: 'Tiger' });
ts.game.hands[tsPlayers[0].id][0] = { id: 'a', name: 'Lion' };
ts.game.hands[tsPlayers[0].id][1] = { id: 'b', name: 'Lion' };
ts.game.hands[tsPlayers[0].id][2] = { id: 'c', name: 'Lion' };
// Make player 2 deterministic: no accidental SET from the randomized deal.
ts.game.hands[tsPlayers[1].id] = [
  { id: 'p2a', name: 'Tiger' },
  { id: 'p2b', name: 'Lion' },
  { id: 'p2c', name: 'Bear' },
];
const call = performAction(ts, tsPlayers[0], 'call-set', {});
assert.equal(call.ok, true);
assert.equal(call.points, 100);
assert.equal(tsPlayers[0].score, 100);
assert.equal(publicGameView(ts).finishOrder[0], tsPlayers[0].id);
assert.equal(publicGameView(ts).setAlertVersion, 1);
assert.equal(publicGameView(ts).lastSetClaimerId, tsPlayers[0].id);
assert.match(ts.chat.at(-1).text, /called SET/);

// A player without a SET cannot steal a finishing position.
assert.equal(performAction(ts, tsPlayers[1], 'call-set', {}).error, 'NOT_A_SET');

// Valid SET reactions must be awarded atomically in click/arrival order.
for (const p of tsPlayers.slice(1)) {
  ts.game.hands[p.id] = [
    { id: `${p.id}_a`, name: 'Tiger' },
    { id: `${p.id}_b`, name: 'Tiger' },
    { id: `${p.id}_c`, name: 'Tiger' },
  ];
}
for (let i = 1; i < tsPlayers.length; i++) {
  const result = performAction(ts, tsPlayers[i], 'call-set', {});
  assert.equal(result.ok, true);
  assert.equal(result.position, i + 1);
}
assert.equal(ts.game.finishOrder.length, tsPlayers.length);
assert.equal(ts.game.phase, 'round-complete');

console.log('KIKI smoke tests passed.');

// Group chat is server-authoritative and shared by every player.
const chatResult = performAction(ts, tsPlayers[1], 'send-chat', { text: 'Hello squad 👋', clientMessageId: 'client_msg_123' });
assert.equal(chatResult.ok, true);
assert.equal(ts.chat.at(-1).text, 'Hello squad 👋');
assert.equal(ts.chat.at(-1).playerId, tsPlayers[1].id);
const chatCountAfterFirstSend = ts.chat.length;
const duplicateChatResult = performAction(ts, tsPlayers[1], 'send-chat', { text: 'Hello squad 👋', clientMessageId: 'client_msg_123' });
assert.equal(duplicateChatResult.ok, true);
assert.equal(duplicateChatResult.duplicate, true);
assert.equal(ts.chat.length, chatCountAfterFirstSend);

// Truth or Dare: only the selected player can choose, and the choice becomes a chat message.
store.closeRoom(ts);
const { room: tod } = store.createRoom({ name: 'A', maxPlayers: 3 });
const todPlayers = [tod.players[0]];
for (const name of ['B', 'C']) todPlayers.push(store.joinRoom(tod, name).player);
startGame(tod, 'truthOrDare');
assert.equal(performAction(tod, todPlayers[0], 'spin', {}).ok, true);
const selectedTod = store.findPlayer(tod, tod.game.lastSelected);
const wrongTod = todPlayers.find((p) => p.id !== selectedTod.id);
assert.equal(performAction(tod, wrongTod, 'choose-truth-dare', { choice: 'truth' }).error, 'NOT_SELECTED_PLAYER');
assert.equal(performAction(tod, selectedTod, 'choose-truth-dare', { choice: 'dare' }).ok, true);
assert.equal(tod.game.chosenType, 'dare');
assert.match(tod.chat.at(-1).text, /chose DARE/);

// Guess Who: only the thinker can confirm they imagined someone, creating the opening chat message.
store.closeRoom(tod);
const { room: gw } = store.createRoom({ name: 'A', maxPlayers: 3 });
const gwPlayers = [gw.players[0]];
for (const name of ['B', 'C']) gwPlayers.push(store.joinRoom(gw, name).player);
startGame(gw, 'guessWho');
assert.equal(performAction(gw, gwPlayers[0], 'spin', {}).ok, true);
const thinker = store.findPlayer(gw, gw.game.thinkerId);
const nonThinker = gwPlayers.find((p) => p.id !== thinker.id);
assert.equal(performAction(gw, nonThinker, 'confirm-thinker', {}).error, 'NOT_SELECTED_PLAYER');
assert.equal(performAction(gw, thinker, 'confirm-thinker', {}).ok, true);
assert.equal(gw.game.thinkerConfirmed, true);
assert.match(gw.chat.at(-1).text, /has imagined someone/);
assert.equal(performAction(gw, thinker, 'answer-question', { answer: 'yes' }).ok, true);
assert.match(gw.chat.at(-1).text, /YES/);
const oldGwChat = gw.chat.length;
assert.equal(performAction(gw, gwPlayers[0], 'spin', {}).ok, true);
assert.equal(gw.round, 2);
assert.equal(gw.chat.length, 0);

console.log('KIKI chat tests passed.');
