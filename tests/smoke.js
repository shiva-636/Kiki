import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { store, secureShuffle } from '../server/store.js';
import { canStart, startGame, performAction, privateGameView, publicGameView } from '../server/games.js';

// Core range rules
for (let n = 3; n <= 10; n++) assert.equal(canStart('imposter', n), true);
assert.equal(canStart('threeSet', 3), true);
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

// Players can leave individually during active games; the room continues for everyone else.
const { room: leaveTest } = store.createRoom({ name:'L1', maxPlayers:3 });
const leavePlayers=[leaveTest.players[0], store.joinRoom(leaveTest,'L2').player, store.joinRoom(leaveTest,'L3').player];
startGame(leaveTest,'imposter');
assert.equal(store.leaveRoom(leaveTest, leavePlayers[1]), undefined);
assert.equal(store.activePlayers(leaveTest).length, 2);
store.closeRoom(leaveTest);

// Three Set: only the first valid SET checks the player's hand and starts the reflex race.
// Give player 1 a triple inside a 4-card hand to test SET validation.
ts.game.hands[tsPlayers[0].id].push({ id: 'extra', name: 'Tiger' });
ts.game.hands[tsPlayers[0].id][0] = { id: 'a', name: 'Lion' };
ts.game.hands[tsPlayers[0].id][1] = { id: 'b', name: 'Lion' };
ts.game.hands[tsPlayers[0].id][2] = { id: 'c', name: 'Lion' };
// Player 2 deliberately has NO SET. Their popup reaction must still work.
ts.game.hands[tsPlayers[1].id] = [
  { id: 'p2a', name: 'Tiger' },
  { id: 'p2b', name: 'Lion' },
  { id: 'p2c', name: 'Bear' },
];
const call = performAction(ts, tsPlayers[0], 'call-set', {});
assert.equal(call.ok, true);
assert.equal(call.points, 100);
assert.equal(call.position, 1);
assert.equal(tsPlayers[0].score, 100);
assert.equal(ts.game.raceStarted, true);
assert.equal(publicGameView(ts).finishOrder[0], tsPlayers[0].id);
assert.equal(publicGameView(ts).setAlertVersion, 1);
assert.equal(publicGameView(ts).lastSetClaimerId, tsPlayers[0].id);
assert.match(ts.chat.at(-1).text, /called SET/);

// The original SET claimant cannot react again, and a second SET call cannot restart the race.
assert.equal(performAction(ts, tsPlayers[0], 'react-set', {}).error, 'ALREADY_DONE');
assert.equal(performAction(ts, tsPlayers[1], 'call-set', {}).error, 'RACE_ALREADY_STARTED');

// Popup reactions are pure reflex: no SET validation is performed.
const reaction2 = performAction(ts, tsPlayers[1], 'react-set', {});
assert.equal(reaction2.ok, true);
assert.equal(reaction2.position, 2);
assert.equal(reaction2.points, 90);
assert.equal(tsPlayers[1].score, 90);

// Player 3 can react even without a valid SET and gets #3 / 80.
ts.game.hands[tsPlayers[2].id] = [
  { id: 'p3a', name: 'Tiger' },
  { id: 'p3b', name: 'Lion' },
  { id: 'p3c', name: 'Bear' },
];
const reaction3 = performAction(ts, tsPlayers[2], 'react-set', {});
assert.equal(reaction3.ok, true);
assert.equal(reaction3.position, 3);
assert.equal(reaction3.points, 80);

// Last remaining player gets 0, and no one can claim twice.
const reaction4 = performAction(ts, tsPlayers[3], 'react-set', {});
assert.equal(reaction4.ok, true);
assert.equal(reaction4.position, 4);
assert.equal(reaction4.points, 70);
const reaction5 = performAction(ts, tsPlayers[4], 'react-set', {});
assert.equal(reaction5.ok, true);
assert.equal(reaction5.position, 5);
assert.equal(reaction5.points, 0);
assert.equal(ts.game.finishOrder.length, tsPlayers.length);
assert.equal(ts.game.phase, 'round-complete');
assert.equal(performAction(ts, tsPlayers[4], 'react-set', {}).error, 'NOT_PLAYING');

// Coordinator-only progression clears chat and resets the SET race for the new round.
store.addChat(ts, 'old round chat', false, tsPlayers[0], 'old_round_chat_1');
assert.ok(ts.chat.length > 0);
assert.equal(performAction(ts, tsPlayers[1], 'next-round', {}).error, 'NOT_COORDINATOR');
assert.equal(performAction(ts, tsPlayers[0], 'next-round', {}).ok, true);
assert.equal(ts.game.phase, 'waiting-shuffle');
assert.equal(ts.game.raceStarted, false);
assert.deepEqual(ts.game.finishOrder, []);
assert.equal(ts.chat.length, 0);

// V9.5: avatar state and confidential interaction requests.
const { room: social } = store.createRoom({ name:'Shiva', maxPlayers:3, avatar:'boy1' });
const shiva=social.players[0];
const sudha=store.joinRoom(social,'Sudha','cat','Milo','girl1').player;
const ravi=store.joinRoom(social,'Ravi','dog','Buddy','boy2').player;
assert.equal(shiva.avatar,'boy1'); assert.equal(sudha.avatar,'girl1');
// Interaction requests require proximity, so place the pair together.
shiva.x=sudha.x=50; shiva.y=sudha.y=60;
let req=performAction(social,shiva,'avatar-command',{text:'ask Sudha if I can hug her',targetPlayerId:sudha.id});
assert.equal(req.status,'pending');
const sudhaView=publicGameView(social); assert.equal(sudhaView,null);
const serializedForSudha = social.pendingInteractions.filter(r=>r.to===sudha.id);
const serializedForRavi = social.pendingInteractions.filter(r=>r.to===ravi.id || r.from===ravi.id);
assert.equal(serializedForSudha.length,1); assert.equal(serializedForRavi.length,0);
assert.equal(performAction(social,ravi,'interaction-response',{requestId:req.requestId,accept:true}).error,'INTERACTION_NOT_FOUND');
assert.equal(performAction(social,sudha,'interaction-response',{requestId:req.requestId,accept:true}).accepted,true);
assert.equal(shiva.interactionWith,sudha.id); assert.equal(sudha.interactionWith,shiva.id);
assert.equal(performAction(social,shiva,'avatar-command',{text:'walk to the window and wink'}).action,'wink');
assert.equal(performAction(social,shiva,'avatar-command',{text:'walk to the couch and sit'}).action,'sit');
const socialPetReq=performAction(social,shiva,'pet-command',{command:'play',targetPlayerId:sudha.id});
assert.equal(socialPetReq.status,'pending');
assert.equal(performAction(social,sudha,'interaction-response',{requestId:socialPetReq.requestId,accept:true}).accepted,true);
assert.equal(sudha.pet.action,'play');

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
const correctGuesser = nonThinker;
const gwResult = performAction(gw, thinker, 'record-correct', { correctPlayerIds: [correctGuesser.id] });
assert.equal(gwResult.ok, true);
assert.equal(correctGuesser.score, 10);
assert.equal(performAction(gw, nonThinker, 'record-correct', { correctPlayerIds: [] }).error, 'NOT_SELECTED_PLAYER');
assert.equal(performAction(gw, gwPlayers[0], 'spin', {}).ok, true);
assert.equal(gw.round, 2);
assert.equal(gw.chat.length, 0);

// Truth or Dare: every new spin clears the previous spin's chat.
const { room: tod2 } = store.createRoom({ name: 'A2', maxPlayers: 3 });
const tod2Players = [tod2.players[0]];
for (const name of ['B2', 'C2']) tod2Players.push(store.joinRoom(tod2, name).player);
startGame(tod2, 'truthOrDare');
assert.equal(performAction(tod2, tod2Players[0], 'spin', {}).ok, true);
const firstTodChatRound = tod2.round;
store.addChat(tod2, 'spin-specific message', false, tod2Players[0], 'tod_test_123');
assert.ok(tod2.chat.length > 0);
assert.equal(performAction(tod2, tod2Players[0], 'spin', {}).ok, true);
assert.equal(tod2.round, firstTodChatRound);
assert.equal(tod2.chat.length, 0);

// Only the coordinator can advance a scored game.
const gwNonCoordinator = gwPlayers.find((p) => !p.isCoordinator);
assert.equal(performAction(gw, gwNonCoordinator, 'spin', {}).error, 'NOT_COORDINATOR');

// Switching games keeps the same room and players.
const roomCode = gw.code;
const gwCoordinator = gwPlayers.find((p) => p.isCoordinator);
assert.equal(performAction(gw, gwCoordinator, 'switch-game', { game: 'imposter' }).ok, true);
assert.equal(gw.code, roomCode);
assert.equal(gw.currentGame, 'imposter');
assert.equal(gw.players.length, 3);
for (const p of gw.players) {
  assert.equal(p.score, 0);
  assert.deepEqual(p.roundScores, {});
}

console.log('KIKI chat tests passed.');

// V10 release checks: obsolete wallpaper/game-arena systems are gone.
const publicDir = path.resolve('public');
assert.equal(fs.existsSync(path.join(publicDir, 'assets', 'chat-wallpapers')), false);
assert.equal(fs.existsSync(path.join(publicDir, 'assets', 'guess-who')), false);
const chatSource = fs.readFileSync(path.join(publicDir, 'js', 'games', 'chat.js'), 'utf8');
assert.doesNotMatch(chatSource, /WALLPAPER_COUNT|chat-wallpapers|wallpaperUrl/);
const roomSource = fs.readFileSync(path.join(publicDir, 'js', 'screens', 'room.js'), 'utf8');
assert.match(roomSource, /ask-game/);
assert.match(roomSource, /vote-game/);
assert.match(roomSource, /choose-game/);
assert.match(roomSource, /WELCOME TO KIKI WORLD/);
assert.match(roomSource, /data-fullscreen/);
assert.doesNotMatch(roomSource, /Game Arena|toggle-world/);
const petWorldSource = fs.readFileSync(path.join(publicDir, 'js', 'games', 'petWorld.js'), 'utf8');
assert.match(petWorldSource, /data-toy/);
assert.match(petWorldSource, /Toy car/);
assert.match(petWorldSource, /Teddy/);
assert.match(petWorldSource, /TOY & GAME CORNER/);
const scoreboardSource = fs.readFileSync(path.join(publicDir, 'js', 'games', 'scoreboard.js'), 'utf8');
assert.match(scoreboardSource, /scoreOpen/);
const indexSource = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
assert.match(indexSource, /v=12\.0/);
assert.doesNotMatch(indexSource, /v=9\.5/);
assert.match(fs.readFileSync(path.join(publicDir, 'css', 'styles.css'), 'utf8'), /orientation-prompt/);
assert.match(fs.readFileSync(path.join(publicDir, 'js', 'pets.js'), 'utf8'), /hamster/);
assert.match(fs.readFileSync(path.join(publicDir, 'js', 'screens', 'create.js'), 'utf8'), /Select Avatar/);
assert.match(fs.readFileSync(path.join(publicDir, 'js', 'screens', 'join.js'), 'utf8'), /Select Avatar/);

// V10 game-vote flow: coordinator asks, players vote privately, coordinator chooses.
const { room: proposalRoom } = store.createRoom({ name:'Coordinator', maxPlayers:3 });
const proposalPlayers = [proposalRoom.players[0]];
for (const name of ['Player2','Player3']) proposalPlayers.push(store.joinRoom(proposalRoom,name).player);
const coordinator=proposalPlayers[0];
assert.equal(performAction(proposalRoom, proposalPlayers[1], 'vote-game', {game:'imposter'}).error, 'NO_GAME_PROPOSAL');
assert.equal(performAction(proposalRoom, coordinator, 'ask-game', {}).ok, true);
assert.equal(performAction(proposalRoom, proposalPlayers[1], 'vote-game', {game:'imposter'}).ok, true);
assert.equal(performAction(proposalRoom, proposalPlayers[2], 'vote-game', {game:'truthOrDare'}).ok, true);
assert.equal(proposalRoom.gameProposal.votes[proposalPlayers[1].id], 'imposter');
assert.equal(performAction(proposalRoom, proposalPlayers[1], 'choose-game', {game:'truthOrDare'}).error, 'NOT_COORDINATOR');
assert.equal(performAction(proposalRoom, coordinator, 'choose-game', {game:'imposter'}).ok, true);
assert.equal(proposalRoom.currentGame, 'imposter');
assert.equal(proposalRoom.gameProposal, null);
assert.equal(proposalRoom.worldSetup.game, 'imposter');

// V10 motions + toys.
const { room: motionRoom } = store.createRoom({ name:'Mover', maxPlayers:3 });
const motionA=motionRoom.players[0];
const motionB=store.joinRoom(motionRoom,'Friend').player;
store.joinRoom(motionRoom,'Friend2');
assert.equal(performAction(motionRoom,motionA,'avatar-command',{text:'lay on the floor'}).action,'lay-floor');
assert.equal(performAction(motionRoom,motionA,'avatar-command',{text:'lay on the couch'}).action,'lay-couch');
assert.equal(performAction(motionRoom,motionA,'avatar-command',{text:'lay in the sleeping bag'}).action,'lay-sleepingbag');
const layReq=performAction(motionRoom,motionA,'avatar-command',{text:'lay next to Friend',targetPlayerId:motionB.id});
assert.equal(layReq.status,'pending');
assert.equal(performAction(motionRoom,motionB,'interaction-response',{requestId:layReq.requestId,accept:true}).accepted,true);
assert.equal(performAction(motionRoom,motionA,'toy',{toy:'teddy'}).carrying,'teddy');
assert.equal(motionA.carrying,'teddy');
assert.equal(performAction(motionRoom,motionA,'toy',{toy:'teddy',drop:true}).carrying,null);

// V10 expanded pet actions are server-validated.
assert.equal(performAction(motionRoom,motionA,'pet-command',{command:'feed'}).ok,true);
assert.equal(performAction(motionRoom,motionA,'pet-command',{command:'brush'}).ok,true);
assert.equal(performAction(motionRoom,motionA,'pet-command',{command:'bathe'}).ok,true);

const v9room = motionRoom;
assert.equal(v9room.viewMode,'world');
assert.equal(v9room.players.length,3);
const voiceSource = fs.readFileSync(path.join(publicDir, 'js', 'voice.js'), 'utf8');
assert.match(voiceSource, /RTCPeerConnection/);
assert.match(voiceSource, /getUserMedia/);
assert.equal(fs.readdirSync(path.join(publicDir, 'assets', 'pet-sounds')).filter(n=>n.endsWith('.wav')).length,10);

console.log('KIKI V10 release checks passed.');

// V12 regression: room capacity is always server-owned and fixed at 10.
const { room: capacityRoom } = store.createRoom({ name:'CapacityHost', roomName:'Ten Friends', maxPlayers:2, avatar:'boy3', petType:'fox', petName:'Rocket' });
assert.equal(capacityRoom.maxPlayers, 10);
const capacityPlayers=[capacityRoom.players[0]];
for(let i=2;i<=10;i++){ const r=store.joinRoom(capacityRoom,`Cap${i}`,'cat','',i%2?'girl2':'boy2'); assert.equal(r.error,undefined); capacityPlayers.push(r.player); }
assert.equal(store.activePlayers(capacityRoom).length,10);
assert.equal(store.joinRoom(capacityRoom,'Eleven').error,'ROOM_FULL');
assert.equal(canStart('imposter',2),false); assert.equal(canStart('imposter',3),true); assert.equal(canStart('threeSet',3),true);
assert.equal(capacityPlayers[0].isCoordinator,true); assert.equal(capacityPlayers[1].isCoordinator,false);

// V12 regression: the selector screens use the four-argument delegated event helper.
const createSource=fs.readFileSync(path.join(publicDir,'js','screens','create.js'),'utf8');
const joinSource=fs.readFileSync(path.join(publicDir,'js','screens','join.js'),'utf8');
assert.match(createSource,/on\(root, '\[data-avatar-choice\]', 'click',/);
assert.match(joinSource,/on\(root, '\[data-avatar-choice\]', 'click',/);
assert.match(createSource,/\[data-pet-choice\].*'click'/s);
assert.match(joinSource,/\[data-pet-choice\].*'click'/s);

// V12 asset checks: ten full-body player sets and ten pet sets exist as real SVG files.
for (const id of ['girl1','girl2','girl3','girl4','girl5']) assert.ok(fs.existsSync(path.join(publicDir,'assets','characters','girls',`${id}_idle.svg`)));
for (const id of ['boy1','boy2','boy3','boy4','boy5']) assert.ok(fs.existsSync(path.join(publicDir,'assets','characters','boys',`${id}_idle.svg`)));
for (const id of ['dog','cat','rabbit','fox','panda','koala','frog','bear','penguin','hamster']) assert.ok(fs.existsSync(path.join(publicDir,'assets','pets',`${id}_idle.svg`)));
assert.ok(fs.existsSync(path.join(publicDir,'assets','world','background','room.svg')));
assert.ok(fs.existsSync(path.join(publicDir,'assets','world','furniture','couch.svg')));
assert.ok(fs.existsSync(path.join(publicDir,'assets','world','furniture','sleeping-bag.svg')));

const worldSource=fs.readFileSync(path.join(publicDir,'js','games','petWorld.js'),'utf8');
assert.doesNotMatch(worldSource,/🐶|🐱|🐰|🐼|🛋️|🛏️|📺|🎮|🍕/);
const styleSource=fs.readFileSync(path.join(publicDir,'css','styles.css'),'utf8');
assert.doesNotMatch(styleSource,/backdrop-filter\s*:/);
assert.doesNotMatch(styleSource,/filter\s*:\s*blur\(/);

console.log('KIKI V12 regression tests passed.');

// V12.1 regressions: fixed delegated event-handler signature and hard room limits.
for (const file of ['public/js/screens/create.js', 'public/js/screens/join.js']) {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  assert.match(source, /on\(root, '\[data-avatar-choice\]', 'click',/);
  assert.match(source, /on\(root, '\[data-pet-choice\]', 'click',/);
}
const { room: capacityRoomHardening } = store.createRoom({ name:'CapacityHost', roomName:'Capacity Test', maxPlayers: 999 });
assert.equal(capacityRoomHardening.maxPlayers, 10);
for (let i = 2; i <= 10; i++) assert.equal(store.joinRoom(capacityRoomHardening, `Capacity${i}`).error, undefined);
assert.equal(store.activePlayers(capacityRoomHardening).length, 10);
assert.equal(store.joinRoom(capacityRoomHardening, 'Capacity11').error, 'ROOM_FULL');
capacityRoomHardening.maxPlayers = 1; // Even a corrupted in-memory value must not weaken the server's hard maximum.
assert.equal(store.joinRoom(capacityRoomHardening, 'Capacity12').error, 'ROOM_FULL');
store.closeRoom(capacityRoomHardening);
console.log('KIKI V12.1 regression checks passed.');

// V12.2 regression: pet "go bed" command is accepted end-to-end by the server.
const { room: petBedRoom } = store.createRoom({ name:'PetBed', roomName:'Pet Bed QA', petType:'cat', petName:'Milo' });
const petBedPlayer = petBedRoom.players[0];
const petBedResult = performAction(petBedRoom, petBedPlayer, 'pet-command', { command:'go-bed' });
assert.equal(petBedResult.ok, true);
assert.equal(petBedPlayer.pet.action, 'sleep');
assert.equal(petBedPlayer.pet.x, 32);
assert.equal(petBedPlayer.pet.y, 78);
const petWorldCommandSource = fs.readFileSync(path.join(publicDir,'js','games','petWorld.js'),'utf8');
assert.match(petWorldCommandSource, /\['go bed','go-bed'\]/);
store.closeRoom(petBedRoom);
console.log('KIKI V12.2 pet command regression passed.');

