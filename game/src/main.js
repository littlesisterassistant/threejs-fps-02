// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. EMBERLINE: Vanguard (you + 2 bots) attack, Rustjackals
// (3 bots) defend two bomb sites. First to 5 rounds takes the yard.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPON_DEFS } from './weapon.js';
import { createBots } from './bots.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { createGrenades } from './grenades.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '', 10) || (shot ? 1 : (Date.now() % 2147483647));

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Dusk sky: a vertical gradient texture used as the background, so the yard
// reads as an open-air foundry at sunset instead of a black box.
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 4;
skyCanvas.height = 512;
const skyCtx = skyCanvas.getContext('2d');
const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
skyGrad.addColorStop(0, '#241a33');
skyGrad.addColorStop(0.45, '#6e3a2c');
skyGrad.addColorStop(0.75, '#c65a24');
skyGrad.addColorStop(1, '#e8862e');
skyCtx.fillStyle = skyGrad;
skyCtx.fillRect(0, 0, 4, 512);
const skyTexture = new THREE.CanvasTexture(skyCanvas);
skyTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTexture;
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const game = createGame();
const audio = createAudio();
const grenades = createGrenades(scene);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

// The player's hitboxes for bot fire: invisible meshes the raycaster still
// hits. The player's own shots never test them (separate target list).
const playerHitGroup = new THREE.Group();
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.85, 0.3), new THREE.MeshBasicMaterial());
playerTorso.position.y = 0.98;
playerTorso.userData = { player: true, part: 'torso' };
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8), new THREE.MeshBasicMaterial());
playerHead.position.y = 1.53;
playerHead.userData = { player: true, part: 'head' };
playerTorso.visible = false;
playerHead.visible = false;
playerHitGroup.add(playerTorso, playerHead);
scene.add(playerHitGroup);

// Tracer: one reusable line, shown briefly after every shot.
const tracerGeometry = new THREE.BufferGeometry();
tracerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(
  tracerGeometry,
  new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
);
tracer.frustumCulled = false;
scene.add(tracer);
let tracerLeft = 0;

// The bomb: hidden while carried, a blinking box at the site once planted.
const bombMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.25, 0.28),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), emissive: new THREE.Color(PALETTE.foe), emissiveIntensity: 0.7 }),
);
bombMesh.visible = false;
scene.add(bombMesh);
const bombLight = new THREE.PointLight(new THREE.Color(PALETTE.foe), 0, 6);
scene.add(bombLight);

const playerShootables = world.shootables.concat(bots.hitMeshes);
const botShootables = world.shootables.concat([playerTorso, playerHead], bots.hitMeshes);

// Shot log for headless debugging: what each player shot hit first.
const shotLog = [];
// Debug handle for headless probing (positions, raycasts). Harmless in play.
window.__ember = { scene, camera, bots, body: player.state, game, weapon, raycaster, shotLog, get playerHp() { return playerHp; }, get score() { return score; } };

const body = player.state;
let playerHp = 100;
let playerAlive = true;
let grenadesLeft = 1;
let buyOpen = false;
let shake = 0;
let elapsed = 0;
let score = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let plantProgress = 0;
let bombCarrierBot = null;
let beepTimer = 0;

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showTracer(from, to) {
  const attr = tracerGeometry.getAttribute('position');
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  tracer.material.opacity = 0.85;
  tracerLeft = 0.07;
}

function damagePlayer(amount, part, fromName) {
  if (!playerAlive) return;
  playerHp -= amount;
  hud.setHealth(playerHp);
  hud.damage();
  audio.hurt();
  shake = Math.min(1, shake + 0.35);
  if (playerHp <= 0) {
    playerHp = 0;
    playerAlive = false;
    hud.setHealth(0);
    hud.killfeed(`${fromName} ▸ You`);
    hud.banner('You are down — your team fights on', 2600);
    if (game.state.bomb.carriedBy === 'player') {
      game.state.bomb.carriedBy = 'dropped';
      game.state.bomb.x = body.position.x;
      game.state.bomb.z = body.position.z;
      bombMesh.visible = true;
      bombMesh.position.set(body.position.x, 0.15, body.position.z);
      hud.killfeed('Bomb dropped — a teammate can pick it up');
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function damageBot(bot, amount, part, byPlayer) {
  const killed = bots.damage(bot, amount);
  if (killed) {
    hud.killfeed(`${byPlayer ? 'You' : bot.lastHitter || 'Vex'} ▸ ${bot.name}`);
    if (byPlayer) {
      score += 1;
      game.state.money += 300;
      hud.setScore(score);
      hud.setMoney(game.state.money);
      audio.kill();
    }
  }
  return killed;
}

function shootPlayer() {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  // The camera is normally synced in step(), but a shot fired right after
  // aimAt (shot mode) would otherwise use the previous frame's orientation.
  syncCamera();
  const def = weapon.def();
  camera.getWorldDirection(direction);
  const spread = weapon.spread(player.groundSpeed());
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hits = raycaster.intersectObjects(playerShootables, false);
  const hit = hits[0];
  shotLog.push(hit ? (hit.object.userData.bot ? `${hit.object.userData.bot.name}/${hit.object.userData.part}` : `world@${hit.distance.toFixed(1)}m`) : 'none');
  const end = hit ? hit.point : tmpVec.copy(camera.position).addScaledVector(direction, 70);
  showTracer(camera.position, end);
  audio.shot(def.key);
  bots.hear(body.position, elapsed);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    if (bot.team === 'foe' && bot.alive) {
      const part = hit.object.userData.part;
      const killed = damageBot(bot, part === 'head' ? def.headDamage : def.damage, part, true);
      hud.hitMarker(killed, shot ? 4000 : 90);
      if (!killed) audio.hit();
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function botFire(bot, target, dist) {
  const from = tmpVec.set(bot.mover.state.position.x, bot.mover.state.position.y + 1.5, bot.mover.state.position.z);
  const isHead = random() < 0.15;
  const aimY = target.pos.y + (isHead ? 1.53 : 1.1);
  aimPoint.set(target.pos.x, aimY, target.pos.z);
  const speed = target.kind === 'player' ? player.groundSpeed() : 3;
  const err = bots.aimError(dist, speed);
  aimPoint.x += (random() * 2 - 1) * err * dist;
  aimPoint.y += (random() * 2 - 1) * err * dist;
  aimPoint.z += (random() * 2 - 1) * err * dist;
  direction.copy(aimPoint).sub(from).normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(from, direction);
  const hits = raycaster.intersectObjects(botShootables, false);
  const hit = hits.find((h) => h.object.userData.bot !== bot);
  const end = hit ? hit.point : tmpVec2.copy(from).addScaledVector(direction, 60);
  showTracer(from, end);
  audio.shot('rifle');
  if (!hit) return;
  const nums = bots.damageNumbers();
  if (hit.object.userData.player) {
    damagePlayer(hit.object.userData.part === 'head' ? nums.head : nums.body, hit.object.userData.part, bot.name);
  } else if (hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    if (victim.team !== bot.team && victim.alive) {
      victim.lastHitter = bot.name;
      const killed = damageBot(victim, hit.object.userData.part === 'head' ? nums.head : nums.body, hit.object.userData.part, false);
      if (killed) hud.killfeed(`${bot.name} ▸ ${victim.name}`);
    }
  }
}

function explodeAt(pos, radius, maxDamage) {
  audio.explode();
  shake = 1;
  bombLight.position.copy(pos);
  bombLight.intensity = 60;
  setTimeout(() => { bombLight.intensity = 0; }, 120);
  const dmg = (at, hp) => {
    const d = Math.hypot(at.x - pos.x, at.z - pos.z);
    if (d > radius) return 0;
    return Math.max(10, Math.round(maxDamage * (1 - d / radius)));
  };
  if (playerAlive) {
    const amount = dmg(body.position);
    if (amount > 0) damagePlayer(amount, 'torso', 'Blast');
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const amount = dmg(bot.mover.state.position);
    if (amount > 0) {
      bot.lastHitter = 'Blast';
      const killed = damageBot(bot, amount, 'torso', false);
      if (killed) hud.killfeed(`Blast ▸ ${bot.name}`);
    }
  }
}

function siteAt(x, z) {
  for (const [letter, site] of Object.entries(world.sites)) {
    if (Math.hypot(x - site.x, z - site.z) <= site.radius) return letter;
  }
  return null;
}

function plantBomb(site) {
  const bomb = game.state.bomb;
  bomb.planted = true;
  bomb.site = site;
  bomb.fuse = 45;
  bomb.plantProgress = 0;
  game.state.money += 300;
  hud.setMoney(game.state.money);
  bombMesh.position.set(world.sites[site].x, 0.15, world.sites[site].z);
  bombMesh.visible = true;
  audio.plant();
  hud.banner(`Bomb planted at ${site} — defend it`, 3000);
  hud.killfeed(`Bomb planted at ${site}`);
}

function resetRound() {
  bots.reset();
  playerAlive = true;
  playerHp = 100;
  grenadesLeft = 1;
  buyOpen = false;
  plantProgress = 0;
  bombCarrierBot = null;
  bombMesh.visible = false;
  body.position.set(0, 0, 15.2);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  weapon.refill();
  hud.setHealth(100);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setGrenades(1);
  hud.setWeapon(weapon.def().name);
  hud.showBuy(false);
  hud.setBomb('');
}

function resetMatch() {
  game.state.round = 1;
  game.state.score.ally = 0;
  game.state.score.foe = 0;
  game.state.money = 800;
  game.state.matchWinner = null;
  score = 0;
  hud.setScore(0);
  hud.setMoney(800);
  weapon.resetToRifle();
  game.startRound();
  resetRound();
}

function aliveCounts() {
  return {
    ally: bots.aliveCount('ally') + (playerAlive ? 1 : 0),
    foe: bots.aliveCount('foe'),
  };
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.state.matchWinner) {
    resetMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (game.state.phase === 'end') {
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (!playerAlive) {
    hud.showOverlay('down', score);
  } else if (!game.state.matchWinner && game.state.phase !== 'end') {
    hud.showOverlay(started ? 'paused' : 'start', score);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0.01) {
    camera.rotation.x += (random() - 0.5) * shake * 0.03;
    camera.rotation.y += (random() - 0.5) * shake * 0.03;
  }
  playerHitGroup.position.copy(body.position);
}

function buyItem(key) {
  if (game.state.phase !== 'buy') return;
  if (key === '4') {
    if (grenadesLeft >= 2 || game.state.money < 300) return;
    game.state.money -= 300;
    grenadesLeft += 1;
    hud.setGrenades(grenadesLeft);
    hud.setMoney(game.state.money);
    audio.buy();
    return;
  }
  const map = { 1: 'rifle', 2: 'smg', 3: 'sniper' };
  const weaponKey = map[key];
  if (!weaponKey) return;
  if (weapon.owned.has(weaponKey)) {
    weapon.switchTo(weaponKey);
    hud.setWeapon(weapon.def().name);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    return;
  }
  const price = WEAPON_DEFS[weaponKey].price;
  if (game.state.money < price) return;
  weapon.buy(weaponKey);
  game.state.money -= price;
  weapon.switchTo(weaponKey);
  hud.setMoney(game.state.money);
  hud.setWeapon(weapon.def().name);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  audio.buy();
}

function step(dt) {
  elapsed += dt;
  const keys = input.state.keys;
  const pressed = input.takePressed();
  const phase = game.state.phase;

  // Buy menu: digits act on the menu state as it was when the step began,
  // and B toggles afterwards — so a digit and B landing in the same slow
  // step can never flip the digit into the weapon-switch branch.
  const menuWasOpen = buyOpen;
  if (menuWasOpen) {
    for (const digit of ['1', '2', '3', '4']) {
      if (pressed.has(`Digit${digit}`)) buyItem(digit);
    }
  } else {
    for (const [digit, key] of [['1', 'rifle'], ['2', 'smg'], ['3', 'sniper'], ['4', 'pistol']]) {
      if (pressed.has(`Digit${digit}`) && weapon.switchTo(key)) {
        hud.setWeapon(weapon.def().name);
        hud.setAmmo(weapon.state.mag, weapon.state.reserve);
      }
    }
  }
  if (pressed.has('KeyB') && phase === 'buy') {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen);
  }

  const prevPhase = phase;
  if (playerAlive && phase !== 'end') {
    player.step(dt, keys);
    const firing = input.state.firing;
    const def = weapon.def();
    if (firing && weapon.ready() && (def.auto || !prevFiring)) shootPlayer();
    prevFiring = firing;
    if (keys.has('KeyR')) {
      const before = weapon.state.reloadLeft;
      weapon.reload();
      if (before === 0 && weapon.state.reloadLeft > 0) audio.reload();
    }
    if (pressed.has('KeyG') && grenadesLeft > 0) {
      grenadesLeft -= 1;
      hud.setGrenades(grenadesLeft);
      camera.getWorldDirection(direction);
      tmpVec.copy(camera.position).addScaledVector(direction, 0.5);
      grenades.throwGrenade(tmpVec, direction);
    }
  }
  weapon.step(dt);

  // Bomb: plant (player holds E in a site), pickup (ally bot over a drop),
  // carrier plants, fuse beeps.
  const bomb = game.state.bomb;
  if (phase === 'live' && !bomb.planted) {
    const site = siteAt(body.position.x, body.position.z);
    if (playerAlive && bomb.carriedBy === 'player' && site && keys.has('KeyE')) {
      plantProgress += dt;
      hud.setBomb(`Planting… ${Math.round((plantProgress / game.plantSeconds) * 100)}%`);
      if (plantProgress >= game.plantSeconds) plantBomb(site);
    } else {
      plantProgress = 0;
      if (!bomb.planted) hud.setBomb(bomb.carriedBy === 'dropped' ? 'Bomb dropped — find it' : '');
    }
    if (bomb.carriedBy === 'dropped') {
      for (const bot of bots.bots) {
        if (bot.team !== 'ally' || !bot.alive) continue;
        if (Math.hypot(bot.mover.state.position.x - bomb.x, bot.mover.state.position.z - bomb.z) < 1.5) {
          bomb.carriedBy = `bot:${bot.id}`;
          bombCarrierBot = bot;
          hud.killfeed(`${bot.name} picked up the bomb`);
          break;
        }
      }
    }
    if (bombCarrierBot && bombCarrierBot.alive) {
      const siteHere = siteAt(bombCarrierBot.mover.state.position.x, bombCarrierBot.mover.state.position.z);
      if (siteHere) {
        plantProgress += dt;
        if (plantProgress >= game.plantSeconds) {
          const carrier = bombCarrierBot;
          bombCarrierBot = null;
          plantBomb(siteHere);
          hud.killfeed(`${carrier.name} planted the bomb`);
        }
      } else {
        plantProgress = 0;
      }
    } else if (bombCarrierBot && !bombCarrierBot.alive) {
      bomb.carriedBy = 'dropped';
      bomb.x = bombCarrierBot.mover.state.position.x;
      bomb.z = bombCarrierBot.mover.state.position.z;
      bombMesh.visible = true;
      bombMesh.position.set(bomb.x, 0.15, bomb.z);
      bombCarrierBot = null;
    }
  }
  if (bomb.planted) {
    beepTimer -= dt;
    if (beepTimer <= 0) {
      beepTimer = 1;
      audio.beep();
      bombLight.intensity = bombLight.intensity > 0 ? 0 : 14;
      bombLight.position.set(world.sites[bomb.site].x, 0.6, world.sites[bomb.site].z);
    }
  }

  bots.step(dt, {
    time: elapsed,
    combat: phase === 'live',
    player: { pos: body.position, alive: playerAlive },
    bombPlanted: bomb.planted,
    bombSite: bomb.planted ? world.sites[bomb.site] : null,
    bombCarrier: bombCarrierBot ? bombCarrierBot.id : null,
    fire: botFire,
    onDefuse: (bot, progress) => {
      hud.setBomb(`Defusing… ${Math.round((progress / game.defuseSeconds) * 100)}%`);
      if (progress >= game.defuseSeconds) {
        bomb.planted = false;
        bombMesh.visible = false;
        hud.setBomb('');
        game.endRound('foe', 'Bomb defused');
      }
    },
  });

  grenades.step(dt, explodeAt);

  game.tick(dt, aliveCounts());
  if (prevPhase !== game.state.phase) {
    if (game.state.phase === 'live') {
      hud.banner(`Round ${game.state.round} — plant the charge`, 2200);
      hud.showBuy(false);
      buyOpen = false;
    } else if (game.state.phase === 'end') {
      const won = game.state.winner === 'ally';
      hud.banner(won ? `Vanguard takes round ${game.state.round}` : `Rustjackals take round ${game.state.round}`, 3000);
      hud.setMoney(game.state.money);
      hud.setRounds(`Vanguard ${game.state.score.ally} — ${game.state.score.foe} Rustjackals`);
      if (won) audio.roundWin();
      else audio.roundLose();
      if (game.state.matchWinner) {
        const mw = game.state.matchWinner === 'ally' ? 'Vanguard' : 'Rustjackals';
        hud.showOverlay('match', `${mw} win the match ${game.state.score.ally} — ${game.state.score.foe}.`);
        if (document.pointerLockElement) document.exitPointerLock();
      }
    } else if (game.state.phase === 'buy') {
      resetRound();
      hud.banner(`Round ${game.state.round} — buy phase`, 1800);
      hud.setRounds(`Vanguard ${game.state.score.ally} — ${game.state.score.foe} Rustjackals`);
    }
  }

  // HUD sync.
  hud.setHealth(playerHp);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  if (bomb.planted) hud.setTimer(`BOMB ${fmtTime(bomb.fuse)}`);
  else hud.setTimer(fmtTime(game.state.timer));
  hud.setRounds(`Vanguard ${game.state.score.ally} — ${game.state.score.foe} Rustjackals`);
  hud.setMoney(game.state.money);
  hud.setWeapon(weapon.def().name);
  hud.setGrenades(grenadesLeft);
  hud.setSpread(4 + weapon.spread(player.groundSpeed()) * 320);
  if (tracerLeft > 0) {
    tracerLeft -= dt;
    if (tracerLeft <= 0) tracer.material.opacity = 0;
  }
  shake = Math.max(0, shake - dt * 2.2);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0.6, 0, 15.2);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  } else if (name === 'play') {
    game.state.phase = 'live';
    game.state.timer = 95;
    bots.reset();
    // Stage the fight down the open gap beside the centre pillar (x ~1.65),
    // so the pillar and the mid walls never block the line of fire. Rook
    // starts at the left edge of the gap: he strafes while engaging, and
    // from here either strafe direction keeps him inside the lane.
    bots.teleport(bots.bots[2], 1.0, -4, Math.PI);
    bots.teleport(bots.bots[3], 1.3, -9, Math.PI);
    bots.teleport(bots.bots[0], 3, 8, 0);
    body.position.set(1.65, 0, 6);
    settle(30);
    const foe = bots.bots[2];
    for (let round = 0; round < 3; round += 1) {
      // Re-aim every shot: the bot strafes while engaging, so a stale aim
      // would walk off the target.
      aimAt(new THREE.Vector3(foe.mover.state.position.x, 1.0, foe.mover.state.position.z));
      shootPlayer();
      settle(3);
    }
    settle(20);
    aimAt(new THREE.Vector3(bots.bots[3].mover.state.position.x, 1.2, bots.bots[3].mover.state.position.z));
    shootPlayer();
    settle(6);
  } else if (name === 'buy') {
    game.state.phase = 'buy';
    game.state.timer = 9;
    game.state.money = 2700;
    hud.setMoney(2700);
    body.position.set(0, 0, 14);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showBuy(true);
  } else if (name === 'end') {
    game.state.phase = 'end';
    game.state.timer = 4;
    game.state.score.ally = 1;
    game.state.score.foe = 0;
    game.state.winner = 'ally';
    game.state.reason = 'Enemy team eliminated';
    bots.reset();
    bots.teleport(bots.bots[2], -3, -6, Math.PI);
    body.position.set(0, 0, 4);
    settle(30);
    aimAt(new THREE.Vector3(bots.bots[2].mover.state.position.x, 1.0, bots.bots[2].mover.state.position.z));
    hud.banner('Vanguard takes round 1', 4000);
    hud.showOverlay('end', 'Vanguard takes round 1 — enemy team eliminated.');
  }
  hud.setScore(score);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(playerHp);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setHealth(100);
hud.setMoney(800);
hud.setWeapon(weapon.def().name);
hud.setGrenades(1);
hud.setRounds('Vanguard 0 — 0 Rustjackals');
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
