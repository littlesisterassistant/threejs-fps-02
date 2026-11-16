// Bots: two friendly Vanguard and three Rustjackal defenders. Each bot is a
// small state machine — patrol the waypoint graph, investigate a gunshot it
// hears, engage an enemy it can see (reaction delay, burst fire, aim error
// that grows with distance and target speed), and, when the bomb is planted,
// move to the site to defuse it (foes) or defend it (allies). Movement reuses
// the player's axis-separated mover, so a bot never walks through a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './player.js';

const HEALTH = 100;
const PATROL_SPEED = 3.2;
const INVESTIGATE_SPEED = 4.1;
const STRAFE_SPEED = 1.6;
const EYE_HEIGHT = 1.5;
const BOT_DAMAGE = 13;
const BOT_HEAD_DAMAGE = 39;
const SIGHT_RANGE = 42;
const HEAR_RANGE = 26;

const NAMES = {
  ally: ['Vex', 'Mira'],
  foe: ['Rook', 'Fang', 'Hale'],
};

function makeBody(team, scene) {
  const teamColor = team === 'foe' ? PALETTE.foe : PALETTE.ally;
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4 });

  const group = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), dark);
  legL.position.set(-0.11, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), cloth);
  torso.position.y = 1.0;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), skin);
  head.position.y = 1.53;
  head.userData.part = 'head';
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), visor);
  visorMesh.position.set(0, 1.55, 0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.22, 1.05, -0.2);
  group.add(legL, legR, torso, head, visorMesh, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head };
}

export function createBots(scene, world, random) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const wish = new THREE.Vector3();

  function spawnBot(team, index, x, z) {
    const body = makeBody(team, scene);
    const mover = createMover(world.colliders, x, z, 1.72);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index],
      team,
      mover,
      group: body.group,
      torso: body.torso,
      head: body.head,
      health: HEALTH,
      alive: true,
      state: 'patrol',
      waypoint: 0,
      holdUntil: 0,
      yaw: 0,
      reactionUntil: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      lastSeen: null,
      lastSeenAt: -99,
      heardAt: -99,
      heardPos: new THREE.Vector3(),
      defuse: 0,
      fall: 0,
      stuckTimer: 0,
      lastX: x,
      lastZ: z,
    };
    body.torso.userData.bot = bot;
    body.head.userData.bot = bot;
    hitMeshes.push(body.torso, body.head);
    bots.push(bot);
    return bot;
  }

  function resetPositions() {
    let ai = 0;
    let fi = 0;
    for (const bot of bots) {
      const spawn = bot.team === 'ally' ? world.attackerSpawns[ai++] : world.defenderSpawns[fi++];
      bot.mover.state.position.set(spawn[0], 0, spawn[1]);
      bot.mover.state.velocity.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'patrol';
      bot.waypoint = bot.team === 'ally' ? 0 : 14;
      bot.holdUntil = 0;
      bot.reactionUntil = 0;
      bot.burstLeft = 0;
      bot.burstTimer = 0;
      bot.pauseTimer = 0;
      bot.lastSeen = null;
      bot.lastSeenAt = -99;
      bot.heardAt = -99;
      bot.defuse = 0;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.copy(bot.mover.state.position);
      bot.group.visible = true;
    }
  }

  for (let i = 0; i < 2; i += 1) spawnBot('ally', i, world.attackerSpawns[i][0], world.attackerSpawns[i][1]);
  for (let i = 0; i < 3; i += 1) spawnBot('foe', i, world.defenderSpawns[i][0], world.defenderSpawns[i][1]);
  resetPositions();

  function eyeOf(bot) {
    eyePos.set(bot.mover.state.position.x, bot.mover.state.position.y + EYE_HEIGHT, bot.mover.state.position.z);
    return eyePos;
  }

  function canSee(bot, pos, range) {
    const from = eyeOf(bot);
    dir.copy(pos).sub(from);
    const dist = dir.length();
    if (dist > range) return false;
    dir.normalize();
    raycaster.set(from, dir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance >= dist - 0.6;
  }

  function nearestEnemy(bot, player, others) {
    let best = null;
    let bestDist = Infinity;
    const candidates = [];
    if (bot.team === 'foe' && player.alive) candidates.push({ kind: 'player', pos: player.pos, ref: player });
    for (const other of others) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      candidates.push({ kind: 'bot', pos: other.mover.state.position, ref: other });
    }
    for (const candidate of candidates) {
      targetPos.set(candidate.pos.x, candidate.pos.y + 1.2, candidate.pos.z);
      if (!canSee(bot, targetPos, SIGHT_RANGE)) continue;
      const dist = eyeOf(bot).distanceTo(targetPos);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    return best ? { target: best, dist: bestDist } : null;
  }

  function pickWaypoint(bot) {
    const node = world.waypoints[bot.waypoint];
    const next = node.links[Math.floor(random() * node.links.length)];
    bot.waypoint = next;
  }

  function faceToward(bot, x, z) {
    const dx = x - bot.mover.state.position.x;
    const dz = z - bot.mover.state.position.z;
    if (dx === 0 && dz === 0) return;
    bot.yaw = Math.atan2(-dx, -dz);
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.08;
      return;
    }
    const pos = bot.mover.state.position;
    const now = ctx.time;

    // Bomb orders override patrol when the bomb is planted.
    let orderTarget = null;
    if (ctx.bombPlanted && ctx.bombSite) {
      if (bot.team === 'foe') {
        bot.state = 'defuse';
        orderTarget = ctx.bombSite;
      } else if (bot.state !== 'engage') {
        bot.state = 'defend';
        orderTarget = ctx.bombSite;
      }
    } else if (bot.state === 'defuse' || bot.state === 'defend') {
      bot.state = 'patrol';
    }

    const seen = ctx.combat ? nearestEnemy(bot, ctx.player, bots) : null;
    if (seen) {
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactionUntil = now + 0.45 + random() * 0.5;
        bot.burstLeft = 0;
        bot.pauseTimer = 0;
      }
      bot.lastSeen = seen.target;
      bot.lastSeenAt = now;
    } else if (bot.state === 'engage' && now - bot.lastSeenAt > 2) {
      bot.state = 'patrol';
    }

    if (bot.state === 'engage' && seen) {
      const target = seen.target;
      const tx = target.pos.x;
      const tz = target.pos.z;
      faceToward(bot, tx, tz);
      // Strafe slowly while shooting; stop when far so shots stay honest.
      const strafeDir = Math.sin(now * 0.9 + bot.id.length) > 0 ? 1 : -1;
      const sin = Math.sin(bot.yaw);
      const cos = Math.cos(bot.yaw);
      wish.set(cos * strafeDir, 0, -sin * strafeDir);
      bot.mover.step(dt, wish.x, wish.z, STRAFE_SPEED, false);
      if (now >= bot.reactionUntil) {
        bot.burstTimer -= dt;
        if (bot.burstLeft <= 0) {
          bot.pauseTimer -= dt;
          if (bot.pauseTimer <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.pauseTimer = 0.7 + random() * 0.4;
          }
        } else if (bot.burstTimer <= 0) {
          bot.burstTimer = 0.13;
          bot.burstLeft -= 1;
          ctx.fire(bot, target, seen.dist);
        }
      }
    } else if (ctx.bombCarrier === bot.id && !ctx.bombPlanted) {
      // Carrying the bomb: walk to the nearest site and stand in it;
      // main.js accumulates the plant once the carrier is inside.
      let site = world.sites.A;
      const distA = Math.hypot(world.sites.A.x - pos.x, world.sites.A.z - pos.z);
      const distB = Math.hypot(world.sites.B.x - pos.x, world.sites.B.z - pos.z);
      if (distB < distA) site = world.sites.B;
      const dx = site.x - pos.x;
      const dz = site.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.5) {
        faceToward(bot, site.x, site.z);
        wish.set(dx / dist, 0, dz / dist);
        bot.mover.step(dt, wish.x, wish.z, PATROL_SPEED, false);
      }
    } else if (bot.state === 'defuse' && orderTarget) {
      const dx = orderTarget.x - pos.x;
      const dz = orderTarget.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.6) {
        faceToward(bot, orderTarget.x, orderTarget.z);
        wish.set(dx / dist, 0, dz / dist);
        bot.mover.step(dt, wish.x, wish.z, PATROL_SPEED, false);
        bot.defuse = 0;
      } else if (!seen) {
        bot.defuse += dt;
        ctx.onDefuse(bot, bot.defuse);
      }
    } else if (orderTarget) {
      // Defend: walk to the site, then hold and watch.
      const dx = orderTarget.x - pos.x;
      const dz = orderTarget.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.5) {
        faceToward(bot, orderTarget.x, orderTarget.z);
        wish.set(dx / dist, 0, dz / dist);
        bot.mover.step(dt, wish.x, wish.z, PATROL_SPEED, false);
      } else {
        bot.yaw += dt * 0.4;
      }
    } else {
      // Patrol / investigate.
      let dest = null;
      if (now - bot.heardAt < 4 && bot.state !== 'engage') {
        dest = bot.heardPos;
      } else {
        const node = world.waypoints[bot.waypoint];
        dest = { x: node.x, z: node.z };
      }
      const dx = dest.x - pos.x;
      const dz = dest.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.8) {
        if (now - bot.heardAt < 4) {
          bot.heardAt = -99;
        } else if (now >= bot.holdUntil) {
          pickWaypoint(bot);
          bot.holdUntil = now + (random() < 0.4 ? 1 + random() * 2 : 0);
        }
      } else {
        faceToward(bot, dest.x, dest.z);
        const speed = now - bot.heardAt < 4 ? INVESTIGATE_SPEED : PATROL_SPEED;
        wish.set(dx / dist, 0, dz / dist);
        bot.mover.step(dt, wish.x, wish.z, speed, false);
      }
      // Stuck: pick another waypoint.
      const moved = Math.hypot(pos.x - bot.lastX, pos.z - bot.lastZ);
      if (moved < 0.05) bot.stuckTimer += dt;
      else bot.stuckTimer = 0;
      bot.lastX = pos.x;
      bot.lastZ = pos.z;
      if (bot.stuckTimer > 2.5) {
        bot.stuckTimer = 0;
        pickWaypoint(bot);
      }
    }

    bot.group.position.copy(pos);
    bot.group.rotation.y = bot.yaw;
    // Walk bob.
    const speed = Math.hypot(bot.mover.state.velocity.x, bot.mover.state.velocity.z);
    bot.group.position.y = pos.y + (speed > 0.5 ? Math.abs(Math.sin(now * 9)) * 0.03 : 0);
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    return true;
  }

  return {
    bots,
    hitMeshes,
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
    damage,
    reset: resetPositions,
    hear(pos, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const dist = Math.hypot(bot.mover.state.position.x - pos.x, bot.mover.state.position.z - pos.z);
        if (dist < HEAR_RANGE) {
          bot.heardAt = time;
          bot.heardPos.set(pos.x, 0, pos.z);
        }
      }
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
    teleport(bot, x, z, yaw) {
      bot.mover.state.position.set(x, 0, z);
      bot.mover.state.velocity.set(0, 0, 0);
      bot.yaw = yaw;
      bot.group.position.set(x, 0, z);
      bot.group.rotation.y = yaw;
    },
    aimError(dist, targetSpeed) {
      return 0.028 + dist * 0.0009 + targetSpeed * 0.004;
    },
    damageNumbers() {
      return { body: BOT_DAMAGE, head: BOT_HEAD_DAMAGE };
    },
  };
}
