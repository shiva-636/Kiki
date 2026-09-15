const BASE = '/api/rooms';

export const ERROR_MESSAGES = {
  NAME_REQUIRED: "Don't forget to add your name.",
  ROOM_NAME_REQUIRED: 'Give your room a name.',
  INVALID_CHAT_MESSAGE_ID: 'That chat message could not be sent. Try again.',
  ROOM_NOT_FOUND: "Hmm… that room code doesn't look right.",
  ROOM_FULL: 'THE SQUAD IS COMPLETE 🔥 — this room is full.',
  NAME_TAKEN: 'Someone already has that name — try another.',
  UNAUTHORIZED: 'Your session expired. Please rejoin the room.',
  NOT_COORDINATOR: "Only the coordinator can do that.",
  NOT_ENOUGH_PLAYERS: 'Not enough players for that game yet.',
  INVALID_GAME: "That game doesn't exist.",
  NOT_YOUR_TURN: "It's not your turn yet.",
  NOT_A_SET: "Those don't match yet — keep swapping.",
  INVALID_PET: 'Pick one of the KIKI pets.',
  INVALID_PET_NAME: 'That pet name is not valid.',
  INVALID_PET_POSITION: 'Your pet cannot walk there.',
  INVALID_PET_COMMAND: 'That pet command is not available.',
  INVALID_VOICE_SIGNAL: 'That voice connection could not be completed.',
  VOICE_OFF: 'Turn your microphone on first.',
  VOICE_UNSUPPORTED: 'Live voice is not supported by this browser.',
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
  GAME_IN_PROGRESS: 'The game is in progress. The room stays active while you leave.',
  INVALID_AVATAR_ACTION: 'That avatar action could not be understood.',
  EMPTY_AVATAR_COMMAND: 'Tell KIKI what you want your avatar or pet to do.',
  INTERACTION_NOT_FOUND: 'That private interaction request has expired.',
  INTERACTION_TOO_FAR: 'Move closer before starting that interaction.',
  PLAYER_NOT_AVAILABLE: 'That player is no longer available.',
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

export function createRoom(name, roomName, petType = 'cat', petName = '', avatar = 'girl1') {
  return request(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, roomName, petType, petName, avatar }),
  });
}

export function joinRoom(code, name, petType = 'cat', petName = '', avatar = 'girl1') {
  return request(`${BASE}/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, petType, petName, avatar }),
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
