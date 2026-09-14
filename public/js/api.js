const BASE = '/api/rooms';

export const ERROR_MESSAGES = {
  NAME_REQUIRED: "Don't forget to add your name.",
  INVALID_PLAYER_COUNT: 'Pick a player count between 3 and 10.',
  ROOM_NOT_FOUND: "Hmm… that room code doesn't look right.",
  ROOM_FULL: 'THE SQUAD IS COMPLETE 🔥 — this room is full.',
  NAME_TAKEN: 'Someone already has that name — try another.',
  UNAUTHORIZED: 'Your session expired. Please rejoin the room.',
  NOT_COORDINATOR: "Only the coordinator can do that.",
  NOT_ENOUGH_PLAYERS: 'Not enough players for that game yet.',
  INVALID_GAME: "That game doesn't exist.",
  NOT_YOUR_TURN: "It's not your turn yet.",
  NOT_A_SET: "Those don't match yet — keep swapping.",
  ALREADY_DONE: "You've already called SET this round.",
  NOT_PLAYING: 'Cards need to be shuffled first.',
  EMPTY_CHAT: 'Type something before sending.',
  NOT_SELECTED_PLAYER: 'That option is only for the selected player.',
  CHOICE_ALREADY_MADE: 'The choice is already locked.',
  INVALID_CHOICE: 'Pick Truth or Dare.',
  ALREADY_CONFIRMED: 'You already confirmed you imagined someone.',
  THINKER_NOT_CONFIRMED: 'Confirm that you imagined someone first.',
  INVALID_ANSWER: 'Choose Yes or No.',
  ALREADY_DEALT: 'Cards have already been dealt this round.',
  NO_ACTIVE_GAME: 'No game is running right now.',
  ALREADY_RECORDED: 'This round has already been scored.',
  GAME_IN_PROGRESS: 'The game is in progress. The coordinator must close the game before anyone leaves.',
  SERVER_ERROR: 'Something went sideways. Give it another try.',
  NETWORK_ERROR: "Can't reach KIKI right now. Check your connection.",
};

function friendly(code) {
  return ERROR_MESSAGES[code] || "Something didn't work — give it another try.";
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    const err = new Error(friendly('NETWORK_ERROR'));
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(friendly(data.error));
    err.code = data.error;
    throw err;
  }
  return data;
}

export function createRoom(name, maxPlayers) {
  return request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, maxPlayers }),
  });
}

export function joinRoom(code, name) {
  return request(`${BASE}/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function leaveRoom(code, playerId, token) {
  return request(`${BASE}/${encodeURIComponent(code)}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, token }),
  });
}

export function closeGame(code, playerId, token) {
  return request(`${BASE}/${encodeURIComponent(code)}/close-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, token }),
  });
}

export function fetchState(code, playerId, token) {
  const qs = new URLSearchParams({ playerId: playerId || '', token: token || '' });
  return request(`${BASE}/${encodeURIComponent(code)}/state?${qs}`);
}

export function selectGame(code, playerId, token, game) {
  return request(`${BASE}/${encodeURIComponent(code)}/select-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, token, game }),
  });
}

export function sendAction(code, playerId, token, action, payload) {
  return request(`${BASE}/${encodeURIComponent(code)}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, token, action, payload }),
  });
}
