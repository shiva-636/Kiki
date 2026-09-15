KIKI V7

## KIKI V5.1

V5 includes the large in-game chat, 101 per-user chat wallpapers, named rooms, dynamic scoreboard template, and improved SET/CLAIM and chat delivery reliability.

## KIKI v5

V5 release: 101 user-selectable chat wallpapers (chat area only), a KIKI scoreboard visual template, and cache-busted assets. Cache-fix: HTML, JavaScript, and CSS assets are not browser-cached, preventing stale game UI after deployments. WhatsApp remains only for room sharing; gameplay uses KIKI room chat.

# KIKI — More games. More chaos.

KIKI is a lightweight social party-game web app for friends playing together in the same room. KIKI handles rooms, private game information, player selection, cards, turns, and game mechanics; WhatsApp can be used for the actual conversation and discussion.

## Production deployment

KIKI is a Node.js application with no third-party npm dependencies.

Requirements:
- Node.js 18+
- A Node-capable host such as Render, Railway, Fly.io, or a VPS
- HTTPS recommended for public deployment

Start command:

```bash
npm start
```

The server listens on `process.env.PORT` when provided, otherwise port `3000`.

> GitHub Pages cannot run the KIKI backend because it only serves static files. Keep the repository on GitHub if you want, but deploy the Node server to a Node-capable host.

## Architecture

- **Backend:** native Node `http` server in `server.js`.
- **State:** temporary in-memory rooms in `server/store.js`.
- **Realtime sync:** clients poll room state every 0.7 seconds for fast shared-game reactions.
- **Frontend:** vanilla JavaScript ES modules; no build step.
- **Authentication:** each player receives an unguessable token stored locally in their browser. Server-side authorization is required for player actions.
- **Privacy:** private game data is filtered server-side. A player is not sent another player's secret word or cards.
- **Room lifetime:** rooms are temporary. Closing a game deletes its room/game/player data; inactive rooms are also swept after the configured inactivity TTL.

## Games

- **Imposter:** 3–10 players. Each player receives only their own secret word.
- **Truth or Dare:** 3–10 players. A player-selection wheel chooses the participant.
- **Guess Who?:** 3–10 players. A player-selection wheel chooses the Thinker.
- **Three Set:** 4–10 players. Each player receives a private hand and passes cards around the seating order. When a player has a SET, the SET button is available; after each successful call, the next race is opened for the remaining players. Server-side reaction order awards 100, 90, 80… points, with the final finisher receiving 0.

KIKI now includes a live in-room scoreboard. Imposter scores are awarded automatically after everyone locks their vote, and Three Set scores are awarded automatically when each player successfully calls SET. Rankings update from the accumulated room scores.

## Room templates

`public/assets/rooms/room-3.jpg` through `room-10.jpg` are the supplied room templates. Seat-name positions are configured in `public/js/seatLayouts.js`.

## Local testing

```bash
npm test
npm start
```

Open `http://localhost:3000`.

For friends on the same Wi-Fi, use the host computer's local IP address.

## Production notes

The current in-memory architecture is intentionally simple for small private game sessions. A server restart clears active rooms. A horizontally scaled deployment would require shared state such as Redis or a database.

For a public deployment, place the app behind the hosting provider's HTTPS/reverse proxy. Consider adding IP-based rate limiting and centralized logging if KIKI becomes publicly accessible at scale.


V7 includes 50 Guess Who image assets and those same V7 images are also available as chat wallpapers 52–101. The original Guess Who assets are retained so the Guess Who game remains intact.


## KIKI V7 Enhanced

### Truth or Dare dual-role wheel update
- Truth or Dare now selects two different players per spin: a red receiver needle for the player who answers/does the dare and a blue asker/giver needle for the player who asks/gives it.
- The two needles sit inside the wheel like clock hands and may point to adjacent or distant players; they can never select the same player.
- The server is authoritative for both selections so every player sees the same result.

This build preserves the recovered V7 foundation and adds:
- Three Set words are collected once in Round 1 and reused for later rounds.
- Duplicate player word suggestions are rejected case-insensitively.
- Three Set cards use a plain white card design with the submitted word.
- Chat wallpapers display the selected source image without a tint overlay.
- Room-level continuous voice chat uses WebRTC peer-to-peer audio with room-scoped signaling.
- Switching games resets the scoreboard to zero for the newly selected game.
