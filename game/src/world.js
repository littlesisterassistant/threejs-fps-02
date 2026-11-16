// The map: "Foundry Yard", an original dusk industrial yard. Two bomb sites
// (A Foundry west, B Depot east), three lanes (A-long, mid, B-long) joined by
// two gaps, crates and walls for cover. Every box is a collider for players
// and bots and a surface a bullet stops on. Plain geometry only, no models
// and no textures; the site letters are drawn on a canvas at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITES = {
  A: { x: -16, z: -11, radius: 3.6, name: 'FOUNDRY' },
  B: { x: 16, z: -11, radius: 3.6, name: 'DEPOT' },
};

const ATTACKER_SPAWNS = [
  [0, 15.2],
  [-2.4, 15.6],
  [2.4, 15.6],
];
const DEFENDER_SPAWNS = [
  [-16, -15.2],
  [16, -15.2],
  [0, -15.6],
];

// Waypoint graph for bots: nodes along the lanes, sites and spawns.
const WAYPOINTS = [
  { x: 0, z: 15, links: [1, 6, 10] }, // 0 attacker spawn
  { x: 0, z: 8, links: [0, 2, 6, 10] }, // 1 mid south
  { x: 0, z: 0, links: [1, 3, 12, 13] }, // 2 mid
  { x: 0, z: -6, links: [2, 4, 5, 14, 15] }, // 3 mid north
  { x: -16, z: -11, links: [3, 8, 14] }, // 4 site A
  { x: 16, z: -11, links: [3, 9, 15] }, // 5 site B
  { x: -11, z: 8, links: [0, 1, 7, 12] }, // 6 A-long south
  { x: -16, z: 0, links: [6, 8] }, // 7 A-long
  { x: -16, z: -8, links: [7, 4] }, // 8 A-long north
  { x: 16, z: -8, links: [11, 5] }, // 9 B-long north
  { x: 11, z: 8, links: [0, 1, 11, 13] }, // 10 B-long south
  { x: 16, z: 0, links: [10, 9] }, // 11 B-long
  { x: -6, z: 4, links: [2, 6] }, // 12 cross west
  { x: 6, z: 4, links: [2, 10] }, // 13 cross east
  { x: -8, z: -14, links: [3, 4] }, // 14 defender west
  { x: 8, z: -14, links: [3, 5] }, // 15 defender east
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const siteMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.55,
    roughness: 0.6,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and outer walls: 44 x 36 m, 4.6 m high, open to the dusk sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 36.4, -22.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 36.4, 22.2, 2.3, 0, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, -18.2, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, 18.2, 'surface');

  // Lane walls: north-south dividers at x = -11 and x = +11, each with a
  // wide mid gap (z -6..2) and open at the south end.
  box(0.4, 3.2, 12, -11, 1.6, -12, 'hairline');
  box(0.4, 3.2, 6, -11, 1.6, 5, 'hairline');
  box(0.4, 3.2, 12, 11, 1.6, -12, 'hairline');
  box(0.4, 3.2, 6, 11, 1.6, 5, 'hairline');
  // Mid cross wall at z = -2 with a doorway in the middle.
  box(6.5, 3.2, 0.4, -5.75, 1.6, -2, 'hairline');
  box(6.5, 3.2, 0.4, 5.75, 1.6, -2, 'hairline');

  // Site A: the foundry furnace block.
  box(4, 3.4, 3, -16, 1.7, -13.5, 'surface');
  box(1.2, 1.6, 1.2, -18.6, 0.8, -10.4, 'hairline');
  // Site B: stacked depot containers.
  box(5, 2.4, 2.4, 16, 1.2, -13.5, 'surface');
  box(3, 1.2, 2.4, 16, 3.0, -13.5, 'hairline');
  box(1.2, 1.6, 1.2, 18.6, 0.8, -10.4, 'hairline');

  // Mid pillar and raised step.
  box(1.6, 3.4, 1.6, 0, 1.7, 0, 'hairline');
  box(6, 0.5, 2.4, 0, 0.25, -6, 'surface');

  // Crates: crouch cover along the lanes and the spawn courtyard.
  box(1.2, 1.1, 1.2, -16, 0.55, -4, 'hairline');
  box(1.2, 1.1, 1.2, -16, 0.55, 4, 'hairline');
  box(1.2, 1.1, 1.2, 16, 0.55, -4, 'hairline');
  box(1.2, 1.1, 1.2, 16, 0.55, 4, 'hairline');
  box(1.6, 0.7, 1.6, -4, 0.35, -8, 'hairline');
  box(1.6, 0.7, 1.6, 4, 0.35, -8, 'hairline');
  box(2.4, 0.9, 1.2, -7, 0.45, 10, 'hairline');
  box(2.4, 0.9, 1.2, 7, 0.45, 10, 'hairline');
  box(1.2, 1.1, 3.6, 0, 0.55, 12, 'hairline');
  box(1.6, 1.6, 1.6, -19, 0.8, -14, 'hairline');
  box(1.6, 1.6, 1.6, 19, 0.8, -14, 'hairline');

  // Site floor plates, glowing so a site reads at a glance.
  for (const site of Object.values(SITES)) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.06, 4.4), siteMaterial);
    plate.position.set(site.x, 0.03, site.z);
    plate.receiveShadow = true;
    group.add(plate);
  }

  // Site letters, drawn on a canvas at runtime (no asset files).
  for (const [letter, site] of Object.entries(SITES)) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#221d18';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#f0a830';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = '#f0a830';
    ctx.font = 'bold 150px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 136);
    const texture = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    sign.position.set(site.x, 3.4, -17.9);
    group.add(sign);
  }

  // Light: a low amber sun from the south-west, a cool fill from the north,
  // and a warm sky/ground gradient for the dusk hour.
  const sky = new THREE.HemisphereLight(new THREE.Color('#4a3826'), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  key.position.set(-10, 16, 14);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#6b7fa3'), 0.6);
  fill.position.set(8, 10, -14);
  scene.add(fill);

  return { colliders, shootables, group, sites: SITES, waypoints: WAYPOINTS, attackerSpawns: ATTACKER_SPAWNS, defenderSpawns: DEFENDER_SPAWNS };
}
