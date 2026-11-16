// Movement: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never
// swallows a body. The mover is shared by the player and the bots.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createMover(colliders, x, z, height) {
  const mover = {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    onGround: true,
    height,
  };
  const probe = new THREE.Box3();

  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + h - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function step(dt, wishX, wishZ, speed, jump) {
    const blend = Math.min(1, (mover.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    mover.velocity.x += (wishX * speed - mover.velocity.x) * blend;
    mover.velocity.z += (wishZ * speed - mover.velocity.z) * blend;
    if (mover.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      mover.velocity.x *= damp;
      mover.velocity.z *= damp;
    }
    if (jump && mover.onGround) {
      mover.velocity.y = JUMP_SPEED;
      mover.onGround = false;
    }
    mover.velocity.y -= GRAVITY * dt;

    const nextX = mover.position.x + mover.velocity.x * dt;
    if (!overlaps(nextX, mover.position.y, mover.position.z, mover.height, 0.04)) mover.position.x = nextX;
    else mover.velocity.x = 0;
    const nextZ = mover.position.z + mover.velocity.z * dt;
    if (!overlaps(mover.position.x, mover.position.y, nextZ, mover.height, 0.04)) mover.position.z = nextZ;
    else mover.velocity.z = 0;

    mover.position.y += mover.velocity.y * dt;
    mover.onGround = false;
    const hit = overlaps(mover.position.x, mover.position.y, mover.position.z, mover.height, 0);
    if (hit && mover.velocity.y <= 0) {
      mover.position.y = hit.max.y;
      mover.velocity.y = 0;
      mover.onGround = true;
    } else if (hit) {
      mover.position.y = hit.min.y - mover.height;
      mover.velocity.y = 0;
    }
    if (mover.position.y < 0) {
      mover.position.y = 0;
      mover.velocity.y = 0;
      mover.onGround = true;
    }
    mover.velocity.y = Math.max(-30, mover.velocity.y);
  }

  return { state: mover, step, overlaps };
}

export function createPlayer(colliders) {
  const mover = createMover(colliders, 0, 15.2, STAND_HEIGHT);
  const player = {
    position: mover.state.position,
    velocity: mover.state.velocity,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
      mover.state.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !mover.overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
      mover.state.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    mover.step(dt, wish.x, wish.z, speed, keys.has('Space'));
    player.onGround = mover.state.onGround;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
