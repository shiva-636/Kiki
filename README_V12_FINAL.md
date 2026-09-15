# KIKI V12 Final Master

KIKI is a server-authoritative multiplayer social sleepover game for 3–10 players.

## V12 highlights
- Fixed delegated avatar/pet selection handlers.
- Fixed room capacity at 10 players; server rejects the 11th player.
- Minimum room/game start threshold is 3 players.
- Preserved Imposter, Truth or Dare, Guess Who and Three Set.
- Replaced world emoji artwork with real SVG game assets.
- Added 10 full-body player character asset sets and 10 full-body pet asset sets with pose variants.
- Added illustrated nighttime KIKI room background, furniture, sleeping assets, food, toys and props.
- Added position-based depth ordering, furniture interaction points and server-side interaction reservations.
- Added proximity validation for player-to-player interactions.
- Added lightweight autonomous pet movement bounded to the room.
- Added mobile-friendly world/action UI and player panel.
- Removed all CSS blur/backdrop-filter declarations from the project.

## Run
```bash
npm install
npm start
```

## Test
```bash
npm test
node --check server.js
```

No `node_modules`, caches or temporary QA files are included in the final package.
