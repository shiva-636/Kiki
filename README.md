# KIKI V10

KIKI is a 3–10 player browser party-game sleepover world. V10 is a landscape-first final presentation build: the world is the game environment, with physical game setups, interactive toys, avatars, pets, chat, voice, private consent requests, and lightweight corner controls.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## V10 highlights

- KIKI World is one continuous world; there is no separate Game Arena.
- First room entry shows a Welcome to KIKI World neighborhood walk with the selected avatar and pet, ending at the room-name house.
- Landscape-first layout with portrait rotate prompt and optional browser fullscreen.
- Corner chat and optional scoreboard overlays.
- Coordinator asks the room which game to play, collects opinions, then chooses and physically gets the game setup from the toy corner.
- In-world Truth or Dare bottle/table, Imposter covered cards, Three Set cards, and Guess Who setup.
- Interactive toy corner with carryable toys.
- Natural-language avatar and pet command inputs.
- Expanded social motions and pet actions with server-authoritative private permission requests.
- 3–10 player rooms and live voice signaling.
- No chat-wallpaper collection and no Guess Who image-card asset system.

## Test

```bash
npm test
```


## KIKI V12 Master Build
- Fixed 10-player server-authoritative room capacity; 3-player minimum to start games.
- Removed room-capacity selection from Create Room.
- Replaced world emoji characters/props with vector SVG game art and full-body animated avatar/pet assets.
- Added interaction-seat reservation and simple world collision snapping.
- Added Actions panel with Avatar, Social, Pet and Room actions.
- Preserved the existing multiplayer games, room state, chat, voice and polling architecture.
