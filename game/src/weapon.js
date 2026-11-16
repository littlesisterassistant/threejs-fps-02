// Weapons: four hitscan guns plus the numbers that make them play
// differently. A weapon owns its view model, magazine, reload and spread;
// main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_DEFS = {
  rifle: {
    key: 'rifle', name: 'VK-47 Longshot', price: 2700, mag: 25, reserve: 75,
    gap: 0.11, reload: 1.9, damage: 34, headDamage: 100,
    spreadStill: 0.0022, spreadMoving: 0.028, auto: true, barrel: 0.4, kick: 0.055,
  },
  smg: {
    key: 'smg', name: 'Hornet-9', price: 1500, mag: 32, reserve: 96,
    gap: 0.065, reload: 1.6, damage: 22, headDamage: 66,
    spreadStill: 0.006, spreadMoving: 0.034, auto: true, barrel: 0.22, kick: 0.035,
  },
  sniper: {
    key: 'sniper', name: 'Longbow .50', price: 4750, mag: 5, reserve: 15,
    gap: 1.1, reload: 2.6, damage: 90, headDamage: 200,
    spreadStill: 0.0008, spreadMoving: 0.09, auto: false, barrel: 0.62, kick: 0.14,
  },
  pistol: {
    key: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36,
    gap: 0.24, reload: 1.3, damage: 28, headDamage: 84,
    spreadStill: 0.004, spreadMoving: 0.03, auto: false, barrel: 0.16, kick: 0.04,
  },
};

const MOVE_REFERENCE = 5.2;
const MUZZLE_TIME = 0.06;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  const model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let def = WEAPON_DEFS.rifle;
  const state = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, key: 'rifle' };
  const owned = new Set(['rifle', 'pistol']);

  function buildModel() {
    while (model.children.length > 0) model.remove(model.children[0]);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -0.17 - def.barrel / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, 0.26);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.075, -0.05);
    model.add(receiver, barrel, stock, sight);
    flash.position.z = -0.55 - def.barrel;
  }
  buildModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def() { return def; },
    owned,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = MUZZLE_TIME;
      state.kick = def.kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
    },
    switchTo(key) {
      if (!owned.has(key) || key === state.key) return false;
      def = WEAPON_DEFS[key];
      state.key = key;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.flash = 0;
      buildModel();
      return true;
    },
    buy(key) {
      const next = WEAPON_DEFS[key];
      if (!next || owned.has(key)) return -1;
      owned.add(key);
      return next.price;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    resetToRifle() {
      owned.clear();
      owned.add('rifle');
      owned.add('pistol');
      def = WEAPON_DEFS.rifle;
      state.key = 'rifle';
      buildModel();
      this.refill();
    },
  };
}
