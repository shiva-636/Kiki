import { App, setError } from '../state.js?v=12.0';
import { sendAction } from '../api.js?v=12.0';
import { on, escapeHtml } from '../dom.js?v=12.0';
import { PET_MAP } from '../pets.js?v=12.0';
import { avatarAsset, petAsset, furnitureAsset } from '../kikiAssets.js?v=12.0';

const AVATAR_NAMES={girl1:'Maya',girl2:'Nina',girl3:'Zara',girl4:'Ivy',girl5:'Luna',boy1:'Leo',boy2:'Noah',boy3:'Kai',boy4:'Eli',boy5:'Arun'};
const WORLD_OBJECTS={
  couch:['couch','Walk to the couch and sit'], chair:['chair','Walk to the chair and sit'], window:['window','Look outside'],
  sleepingbag:['sleepingbag','Walk to a sleeping bag and sleep'], tv:['tv','Watch TV'], snacks:['snacks','Eat and drink'],
  game:['game','Play together'], bed:['bed','Lie down and sleep']
};
function avatarMarkup(p,youId,room){
  const isYou=p.id===youId,a=p.avatar||'girl1',action=p.action||'idle';
  const latest=(room.chat||[]).filter(m=>m.playerId===p.id).at(-1); const bubble=latest&&Date.now()-latest.ts<6500?latest.text:'';
  return `<button class="kiki-avatar avatar-action-${escapeHtml(action)} ${isYou?'is-you':''}" data-avatar-player="${p.id}" type="button" style="left:${p.x??50}%;top:${p.y??50}%;z-index:${Math.round((p.y??50)*10)+20}" aria-label="${escapeHtml(p.name)} avatar"><span class="avatar-shadow"></span>${bubble?`<span class="avatar-speech">${escapeHtml(bubble)}</span>`:''}<span class="avatar-body">${avatarAsset(a,action)}</span><span class="avatar-nameplate"><b>${escapeHtml(p.name)}</b>${isYou?'<small>YOU</small>':''}${p.isCoordinator?'<i class="host-dot">HOST</i>':''}</span></button>`;
}
function petMarkup(p,youId){
  const pet=p.pet||{},type=pet.type||'dog',action=pet.action||'idle',isYou=p.id===youId,meta=PET_MAP[type]||PET_MAP.dog;
  return `<button class="kiki-pet pet-action-${escapeHtml(action)} ${isYou?'is-you':''}" data-pet-player="${p.id}" data-player-id="${p.id}" type="button" style="left:${pet.x??50}%;top:${pet.y??50}%;z-index:${Math.round((pet.y??50)*10)+15}" aria-label="${escapeHtml(pet.name)}'s ${escapeHtml(meta.name||type)}"><span class="pet-shadow"></span><span class="pet-body">${petAsset(type,action)}</span><span class="pet-nameplate"><b>${escapeHtml(pet.name||meta.name)}</b><small>${escapeHtml(p.name)}</small></span></button>`;
}
function worldObjectMarkup(){
  return `<button class="world-prop prop-tv" data-world-object="tv">${furnitureAsset('tv')}<b>MOVIE NIGHT</b><small>Watch TV</small></button>
  <button class="world-prop prop-couch" data-world-object="couch">${furnitureAsset('couch')}<b>SECTIONAL</b><small>3 seats + lie</small></button>
  <button class="world-prop prop-chair" data-world-object="chair">${furnitureAsset('chair')}<b>LOUNGE CHAIR</b><small>Sit · relax</small></button>
  <button class="world-prop prop-sleep" data-world-object="sleepingbag">${furnitureAsset('sleeping-bag')}<b>SLEEP ZONE</b><small>5 sleeping spots</small></button>
  <button class="world-prop prop-bed" data-world-object="bed">${furnitureAsset('bed')}<b>DAYBED</b><small>Lie · sleep</small></button>
  <button class="world-prop prop-game" data-world-object="game">${furnitureAsset('table')}<span class="game-table-console">${furnitureAsset('console')}</span><b>GAME TABLE</b><small>Play together</small></button>
  <button class="world-prop prop-snacks" data-world-object="snacks">${furnitureAsset('table')}<span class="snack-art"><img src="/assets/world/food/pizza.svg" alt=""/><img src="/assets/world/food/drink.svg" alt=""/></span><b>SNACK TABLE</b><small>Pizza · drinks</small></button>
  <button class="world-prop prop-window" data-world-object="window"><span class="window-frame-art"></span><b>NIGHT WINDOW</b><small>Look outside</small></button>
  <div class="toy-shelf-v12" aria-label="TOY & GAME CORNER"><span>TOY & GAME CORNER</span><button data-toy="ball" type="button">Ball</button><button data-toy="teddy" type="button">Teddy</button><button data-toy="car" type="button">Toy car</button></div><div class="world-props-static"><img src="/assets/world/props/plant.svg" alt=""/><img src="/assets/world/props/books.svg" alt=""/><img src="/assets/world/props/lamp.svg" alt=""/><img src="/assets/world/props/guitar.svg" alt=""/></div>`;
}
function actionPanel(){return `<div class="action-panel" data-action-panel-view hidden>
  <div class="action-group"><b>AVATAR</b>${['wave','greet','sit','stand','lie','sleep','wake','dance','laugh','cry','clap','cheer','eat','drink','phone','play','stretch'].map(x=>`<button data-quick="${x}">${x.replace('-', ' ')}</button>`).join('')}</div>
  <div class="action-group"><b>SOCIAL</b>${[['high five','High Five'],['fist bump','Fist Bump'],['handshake','Handshake'],['hug','Hug'],['dance together','Dance Together'],['sit together','Sit Together']].map(([v,l])=>`<button data-quick="${v}">${l}</button>`).join('')}</div>
  <div class="action-group"><b>PET</b>${['follow','come','stay','sit','sleep','play','eat','drink','happy','sad','fetch','hug','go bed'].map(x=>`<button data-pet-quick="${x}">${x}</button>`).join('')}</div>
  <div class="action-group"><b>WORLD</b>${[['watch TV','Watch TV'],['play','Play Console'],['eat','Eat'],['drink','Drink'],['look outside','Look Outside']].map(([v,l])=>`<button data-quick="${v}">${l}</button>`).join('')}</div>
</div>`}
export function renderPetWorld(room){
  const you=room.you?.id,me=room.players.find(p=>p.id===you),voice=room.players.filter(p=>p.pet?.voiceOn).length;
  return `<section class="kiki-world-shell" aria-label="KIKI World sleepover">
    <div class="world-hud"><div class="world-brand"><span class="kiki-mark">K</span><div><b>KIKI WORLD</b><small>${escapeHtml(room.roomName||'Sleepover')}</small></div></div><div class="world-status"><span>PLAYERS ${room.players.length}/10</span><span>${voice?'VOICE ON':'VOICE READY'}</span></div></div>
    <div class="world-viewport" data-world-viewport><div class="world-map" data-world-map>
      <img class="world-background-art" src="/assets/world/background/room.svg" alt="Cozy KIKI nighttime sleepover room" draggable="false"/>
      <div class="world-zone-label zone-lounge-label">LOUNGE <small>CHILL · TALK · REST</small></div><div class="world-zone-label zone-game-label">GAME CORNER <small>PLAY · PARTY</small></div><div class="world-zone-label zone-snack-label">LATE-NIGHT SNACKS <small>EAT TOGETHER</small></div>
      ${worldObjectMarkup()}
      ${room.players.map(p=>avatarMarkup(p,you,room)).join('')}${room.players.map(p=>petMarkup(p,you)).join('')}
    </div></div>
    <div class="world-action-bar"><button class="quick-action action-toggle" data-action-panel type="button">Actions</button>${actionPanel()}<button class="quick-action" data-quick="wave" type="button">Wave</button><button class="quick-action" data-quick="sit" type="button">Sit</button><button class="quick-action" data-quick="sleep" type="button">Sleep</button><button class="quick-action" data-quick="dance" type="button">Dance</button><button class="quick-action" data-pet-quick="follow" type="button">Pet Follow</button><button class="quick-action" data-pet-quick="sleep" type="button">Pet Sleep</button>
      <form data-avatar-command-form class="world-command-form"><input class="text-input" data-avatar-command-input placeholder="Avatar command, e.g. /dance" maxlength="240"><button class="command-send" type="submit">Send</button></form>
      <form data-pet-command-form class="world-command-form"><input class="text-input" data-pet-command-input placeholder="Pet command, e.g. /pet sleep" maxlength="240"><button class="command-send" type="submit">Send</button></form>
    </div>
    ${room.interactionRequests?.filter(r=>r.to===you).map(r=>`<div class="private-request"><div><b>Interaction request</b><p>${escapeHtml(r.fromName)} wants to ${escapeHtml(r.command.replaceAll('-',' '))}${r.kind==='pet'?' with your pet':''}.</p></div><div><button class="btn btn-primary" data-interaction-response="accept" data-request-id="${r.id}" type="button">Accept</button><button class="btn btn-secondary" data-interaction-response="decline" data-request-id="${r.id}" type="button">Decline</button></div></div>`).join('')||''}
    <div class="pet-panel" data-pet-panel-view hidden><div class="pet-panel-card"><div class="pet-panel-head"><div><b>${escapeHtml(me?.pet?.name||'Your pet')}</b><small>${escapeHtml(PET_MAP[me?.pet?.type||'dog']?.name||'Pet')}</small></div><button class="btn-icon" data-pet-panel-close type="button">×</button></div><div class="pet-type-grid">${Object.values(PET_MAP).map(p=>`<button type="button" class="pet-type-mini ${me?.pet?.type===p.id?'is-selected':''}" data-pet-type="${p.id}">${petAsset(p.id,'idle')}</button>`).join('')}</div><label class="pet-rename"><span>Pet name</span><input class="text-input" data-pet-name maxlength="16" value="${escapeHtml(me?.pet?.name||'')}"><button class="btn btn-primary" data-pet-save-name type="button">Save</button></label></div></div>
  </section>`;
}
export function renderPetCompanion(){return ''}
export function mountPetWorld(root,{room,session,refresh}){
  const map=root.querySelector('[data-world-map]'); if(!map)return;
  const move=async(x,y)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'avatar-command',{text:'/walk',x,y});}catch(e){setError(e)}};
  on(root,'[data-world-viewport]','click',async e=>{if(e.target.closest('[data-avatar-player],[data-pet-player],[data-world-object],[data-avatar-command-form],[data-pet-command-form],[data-quick],[data-pet-quick],[data-action-panel]'))return;const r=map.getBoundingClientRect();await move(Math.max(5,Math.min(95,(e.clientX-r.left)/r.width*100)),Math.max(15,Math.min(90,(e.clientY-r.top)/r.height*100))) });
  on(root,'[data-world-object]','click',async(e,t)=>{const s=t.dataset.worldObject;const text=WORLD_OBJECTS[s]?.[1]||'interact';try{await sendAction(session.roomCode,session.playerId,session.token,'avatar-command',{text})}catch(err){setError(err)}});
  on(root,'[data-action-panel]','click',()=>{const p=root.querySelector('[data-action-panel-view]');if(p)p.hidden=!p.hidden});
  on(root,'[data-quick]','click',async(e,t)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'avatar-command',{text:t.dataset.quick})}catch(err){setError(err)}});
  on(root,'[data-pet-quick]','click',async(e,t)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'pet-command',{command:t.dataset.petQuick})}catch(err){setError(err)}});
  on(root,'[data-avatar-command-form]','submit',async e=>{e.preventDefault();const i=root.querySelector('[data-avatar-command-input]');const text=i?.value.trim();if(!text)return;try{await sendAction(session.roomCode,session.playerId,session.token,'avatar-command',{text});i.value='';}catch(err){setError(err)}});
  on(root,'[data-pet-command-form]','submit',async e=>{e.preventDefault();const i=root.querySelector('[data-pet-command-input]');const text=i?.value.trim();if(!text)return;const l=text.toLowerCase().replace(/^\/pet\s*/,'').trim();const petCommandMap=[['go bed','go-bed'],['go-bed','go-bed'],['follow','follow'],['come','come'],['stay','stay'],['sit','sit'],['sleep','sleep'],['play','play'],['eat','eat'],['drink','drink'],['happy','happy'],['sad','sad'],['stop','stop'],['fetch','fetch'],['wait','wait'],['hug','hug']];const command=petCommandMap.find(([phrase])=>l===phrase||l.startsWith(`${phrase} `))?.[1]||'idle';try{await sendAction(session.roomCode,session.playerId,session.token,'pet-command',{command});i.value='';}catch(err){setError(err)}});
  on(root,'[data-interaction-response]','click',async(e,t)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'interaction-response',{requestId:t.dataset.requestId,accept:t.dataset.interactionResponse==='accept'});refresh()}catch(err){setError(err)}});
  on(root,'[data-toy]','click',async(e,t)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'toy',{toy:t.dataset.toy})}catch(err){setError(err)}});
  on(root,'[data-pet-player]','click',(e,t)=>{e.stopPropagation();if(t.dataset.playerId===session.playerId){App.ui.petPanelOpen=true;refresh()}});
  on(root,'[data-pet-panel-close]','click',()=>{App.ui.petPanelOpen=false;refresh()});
  on(root,'[data-pet-type]','click',async(e,t)=>{try{await sendAction(session.roomCode,session.playerId,session.token,'set-pet',{type:t.dataset.petType});refresh()}catch(err){setError(err)}});
  on(root,'[data-pet-save-name]','click',async()=>{const i=root.querySelector('[data-pet-name]');try{await sendAction(session.roomCode,session.playerId,session.token,'set-pet-name',{name:i?.value||''});refresh()}catch(err){setError(err)}});
  if(App.ui.petPanelOpen)root.querySelector('[data-pet-panel-view]')?.removeAttribute('hidden');
}
