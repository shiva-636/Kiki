import { App, setScreen, setRoomState, clearSession, setError, setLoading, showToast, stopPolling } from '../state.js?v=12.0';
import { leaveRoom as apiLeaveRoom, sendAction } from '../api.js?v=12.0';
import { on, escapeHtml, initials, avatarColor } from '../dom.js?v=12.0';
import { renderImposter, mountImposter } from '../games/imposter.js?v=12.0';
import { renderWheelGame, mountWheelGame } from '../games/wheelGame.js?v=12.0';
import { renderThreeSet, mountThreeSet } from '../games/threeSet.js?v=12.0';
import { renderChat, mountChat } from '../games/chat.js?v=12.0';
import { renderPetWorld, mountPetWorld } from '../games/petWorld.js?v=12.0';
import { toggleVoice, syncVoice, isVoiceEnabled } from '../voice.js?v=12.0';

// WELCOME TO KIKI WORLD — V12 world entry is now integrated into the main room.
const GAMES=[{id:'imposter',name:'Imposter',code:'IM'},{id:'truthOrDare',name:'Truth or Dare',code:'TD'},{id:'guessWho',name:'Guess Who?',code:'GW'},{id:'threeSet',name:'Three Set',code:'3S'}];
const gameName=id=>GAMES.find(g=>g.id===id)?.name||id;
function gameBadge(id){return `<span class="game-badge" aria-hidden="true">${GAMES.find(g=>g.id===id)?.code||'KG'}</span>`}
function waitingCopy(n){if(n<=1)return 'Waiting for 2 more players';if(n===2)return 'Waiting for 1 more player';if(n>=10)return 'Room Full';return 'Ready to play'}
function renderGameProposal(room){
  const isC=room.you?.isCoordinator, proposal=room.gameProposal;
  if(room.status!=='waiting')return '';
  if(!proposal)return isC?`<div class="coordinator-card"><div class="coordinator-bubble"><b>Choose tonight's game</b><span>Ask the squad to vote, then choose the final game.</span></div><button class="btn btn-primary btn-lg" data-action="ask-game">Ask the squad</button></div>`:`<div class="waiting-card"><div class="coordinator-bubble small"><b>Waiting for the Coordinator</b><span>They'll ask the room to choose a game.</span></div></div>`;
  const votes=proposal.votes||{};
  return `<div class="coordinator-card proposal-active"><div class="coordinator-bubble"><b>What should we play?</b><span>Each player can vote once.</span></div><div class="game-vote-grid">${GAMES.map(g=>{const enabled=room.canStart[g.id],selected=proposal.myVote===g.id;return `<button class="game-vote ${selected?'is-selected':''}" data-vote-game="${g.id}" ${enabled?'':'disabled'}>${gameBadge(g.id)}<b>${g.name}</b><small>${votes[g.id]||0} vote${votes[g.id]===1?'':'s'}</small></button>`}).join('')}</div>${isC?`<div class="choice-summary"><b>Coordinator controls</b><span>Players: ${room.players.length}/10 · ${waitingCopy(room.players.length)}</span><div class="choose-row">${GAMES.map(g=>`<button class="btn btn-secondary" data-choose-game="${g.id}" ${room.canStart[g.id]?'':'disabled'}>${gameBadge(g.id)} Choose ${g.name}</button>`).join('')}</div></div>`:''}</div>`;
}
function renderGameOverlay(room){
  if(room.status!=='in-game'||!room.currentGame)return '';
  const renderer={imposter:renderImposter,truthOrDare:r=>renderWheelGame(r,'truthOrDare'),guessWho:r=>renderWheelGame(r,'guessWho'),threeSet:renderThreeSet}[room.currentGame]; if(!renderer)return '';
  const phase=room.worldSetup?.phase||'ready'; const setupCopy=phase==='going-to-toy-corner'?'Coordinator is bringing the game setup…':phase==='bringing-setup'?'Game setup is arriving…':phase==='gathering'?'Gather around the game table!':'Setup ready — game is live.';
  return `<div class="in-world-game-layer"><div class="game-setup-banner">${gameBadge(room.currentGame)} <b>${gameName(room.currentGame)}</b><span>${setupCopy}</span></div>${phase==='ready'?renderer(room):`<div class="game-prep-card"><div class="prep-icon">${gameBadge(room.currentGame)}</div><b>Setting up ${gameName(room.currentGame)}</b><p>${setupCopy}</p></div>`}</div>`;
}
function renderPlayers(room){return `<aside class="room-side-panel room-players-panel"><div class="side-panel-head"><div><b>Players</b><small>${room.players.length}/10 · ${waitingCopy(room.players.length)}</small></div><span class="capacity-pill">MAX 10</span></div><div class="player-list">${room.players.map(p=>`<div class="player-row"><span class="player-mini" style="background:${avatarColor(p.seat)}">${initials(p.name)}</span><div class="player-row-copy"><b>${escapeHtml(p.name)}</b><small>${p.isCoordinator?'Coordinator':'Player'}${p.id===room.you?.id?' · You':''}</small></div><span class="player-state ${p.pet?.voiceOn?'speaking':''}" title="${p.pet?.voiceOn?'Voice on':'Voice ready'}"></span></div>`).join('')}</div></aside>`}
export function renderRoom(){
  const room=App.room;if(!room)return `<div class="screen screen-room"><p class="loading-note">Loading room…</p></div>`;
  const canStart=room.players.length>=3;
  return `<div class="screen screen-room kiki-v10-room"><header class="room-topbar v10-topbar"><div class="room-topbar-room"><span class="room-topbar-brand"><b>K</b>IKI</span><div class="room-topbar-name">${escapeHtml(room.roomName)}</div></div><nav class="room-nav"><span>Room</span><span>Games</span><span>Pets</span><span>Friends</span></nav><div class="room-topbar-actions"><span class="room-code-pill" data-action="copy-code" title="Copy room code">${room.roomCode}</span><button class="btn-icon" data-voice-toggle type="button" aria-label="Toggle microphone">Mic</button><button class="btn-icon" data-fullscreen type="button" aria-label="Fullscreen">Full</button><button class="btn-icon" data-action="leave" type="button" aria-label="Leave room">Exit</button></div></header>
    <div class="room-layout"><div class="room-main-column">${renderPetWorld(room)}<main class="room-main">${room.status==='waiting'?renderGameProposal(room):renderGameOverlay(room)}${room.status==='in-game'?renderChat(room):''}</main></div>${renderPlayers(room)}</div>
    <div class="room-footer-controls"><span class="room-rule"><b>${room.players.length}/10</b> players</span><span class="room-rule ${canStart?'ready':''}">${canStart?'Ready to play':'Need 3 players to start'}</span>${room.you?.isCoordinator?`<span class="room-rule host">Coordinator</span>`:''}</div>
    <button class="floating-chat" data-chat-toggle type="button" aria-label="Open chat">Chat</button>${room.status==='in-game'&&room.you?.isCoordinator?`<div class="game-control-wrap"><button class="floating-game" data-game-menu type="button" aria-label="Change game">Games</button>${App.ui.gameMenuOpen?`<div class="game-menu"><b>Change game</b>${GAMES.map(g=>`<button data-switch-game="${g.id}">${gameBadge(g.id)} ${g.name}</button>`).join('')}</div>`:''}</div>`:''}${App.toast?`<div class="toast" role="status">${escapeHtml(App.toast.text)}</div>`:''}</div>`;
}
export function mountRoom(root){
 const room=App.room,session=App.session;if(!room||!session)return;const refresh=()=>setScreen('room',App.ui);syncVoice(room,session);mountPetWorld(root,{room,session,refresh});
 on(root,'[data-action="copy-code"]','click',async()=>{try{await navigator.clipboard.writeText(room.roomCode);showToast('Room code copied');}catch{showToast(`Room code: ${room.roomCode}`)}});
 on(root,'[data-fullscreen]','click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else await document.exitFullscreen?.()}catch{showToast('Fullscreen is not available here.')}});
 on(root,'[data-voice-toggle]','click',async()=>{await toggleVoice(!isVoiceEnabled(),App.room||room,session);refresh()});
 on(root,'[data-action="leave"]','click',async()=>{if(!confirm('Leave this room?'))return;setLoading(true);try{await apiLeaveRoom(session.roomCode,session.playerId,session.token);stopPolling();clearSession();setScreen('home')}catch(e){setError(e)}finally{setLoading(false)}});
 on(root,'[data-action="ask-game"]','click',async()=>{try{await sendAction(session.roomCode,session.playerId,session.token,'ask-game',{})}catch(e){setError(e)}});
 on(root,'[data-vote-game]','click',async(e,t)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'vote-game',{game:t.dataset.voteGame})}catch(err){setError(err)}});
 on(root,'[data-choose-game]','click',async(e,t)=>{if(!confirm(`Choose ${gameName(t.dataset.chooseGame)}?`))return;setLoading(true);try{await sendAction(session.roomCode,session.playerId,session.token,'choose-game',{game:t.dataset.chooseGame})}catch(err){setError(err)}finally{setLoading(false)}});
 on(root,'[data-game-menu]','click',()=>{App.ui.gameMenuOpen=!App.ui.gameMenuOpen;refresh()});
 on(root,'[data-switch-game]','click',async(e,t)=>{const game=t.dataset.switchGame;if(!GAMES.some(g=>g.id===game))return;if(!confirm(`Switch to ${gameName(game)}? Scores reset.`))return;try{await sendAction(session.roomCode,session.playerId,session.token,'switch-game',{game});App.ui.gameMenuOpen=false;refresh()}catch(err){setError(err)}});
 on(root,'[data-chat-toggle]','click',()=>{App.ui.chatOpen=true;refresh()});
 if(room.status==='in-game'){const ctx={room,session,refresh};if(room.currentGame==='imposter')mountImposter(root,ctx);else if(room.currentGame==='truthOrDare'||room.currentGame==='guessWho')mountWheelGame(root,ctx,room.currentGame);else if(room.currentGame==='threeSet')mountThreeSet(root,ctx);mountChat(root,ctx);syncVoice(App.room||room,session)}
}
