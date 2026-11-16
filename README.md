# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/littlesisterassistant/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/littlesisterassistant/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBERLINE: a round-based tactical FPS in the browser on three.js. Vanguard
(you + 2 bots) attack, Rustjackals (3 bots) defend two bomb sites in Foundry
Yard, an original dusk industrial map. First to 5 rounds takes the yard.

Built for the [make.fun bounty](https://make.fun/bounty/threejs-fps-02)
"Make the best three.js tactical FPS" (slug `threejs-fps-02`).

## Play

```sh
node serve.ts
```

Then open http://localhost:8080. Click to play: WASD move, mouse look,
click fire, R reload, B buy menu (buy phase), G throw grenade, E hold to
plant the charge at A or B, Ctrl crouch, Space jump. 1/2/3/4 switch weapons.

## Layout

| File | What it is |
| --- | --- |
| `main.ts` | Hands the game in: copies game/ + screenshots/ to /output and writes dossier.json. |
| `serve.ts` | Tiny static server for local play. |
| `game/index.html` | The page: canvas, import map for three.js, full HUD (health, ammo, timer, score, money, buy menu, kill feed). |
| `game/src/main.js` | Boot + fixed-step loop: shooting, grenades, bomb, rounds, screenshots. |
| `game/src/world.js` | Foundry Yard: lanes, two bomb sites, cover, lights, waypoint graph. |
| `game/src/player.js` | Movement: acceleration, friction, gravity, crouch, jump, box collision (shared mover). |
| `game/src/bots.js` | Bot AI: patrol, investigate gunshots, engage with reaction delay and burst fire, defuse/plant the bomb. |
| `game/src/weapon.js` | Four guns (rifle, SMG, sniper, pistol): magazines, reload, recoil and spread that punish firing on the move. |
| `game/src/grenades.js` | Thrown grenades: gravity, bounce, timed blast with falloff. |
| `game/src/game.js` | Match state in one place: phases, timer, money, bomb, score. |
| `game/src/audio.js` | All sound synthesised with WebAudio — no audio files. |
| `game/src/hud.js` | The DOM HUD. |
| `game/src/input.js` | Keyboard, mouse and pointer lock. |
| `game/src/palette.js` | The look plan: eight colours, one per team. |

## Screenshots

`?shot=start|play|buy|end&seed=1` sets up a deterministic frame for a
capture (see `shots.json`).
