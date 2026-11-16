// Grenades: a thrown sphere with gravity, one bounce off the floor, and a
// timed explosion. The blast is resolved by main.js through onExplode, which
// damages every character in radius with falloff.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FUSE = 1.6;
const RADIUS = 6;
const MAX_DAMAGE = 95;

export function createGrenades(scene) {
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(PALETTE.foe), emissiveIntensity: 0.35 });
  const geometry = new THREE.SphereGeometry(0.09, 12, 8);
  const active = [];
  const pos = new THREE.Vector3();

  function throwGrenade(from, dir) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from);
    scene.add(mesh);
    active.push({
      mesh,
      vel: new THREE.Vector3(dir.x * 13 + (Math.random() - 0.5), dir.y * 13 + 3.5, dir.z * 13 + (Math.random() - 0.5)),
      fuse: FUSE,
      bounced: false,
    });
  }

  function step(dt, onExplode) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const g = active[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        if (!g.bounced) {
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.6;
          g.vel.z *= 0.6;
          g.bounced = true;
        } else {
          g.vel.y = 0;
          g.vel.x *= 0.9;
          g.vel.z *= 0.9;
        }
      }
      if (g.fuse <= 0) {
        pos.copy(g.mesh.position);
        scene.remove(g.mesh);
        active.splice(i, 1);
        onExplode(pos, RADIUS, MAX_DAMAGE);
      }
    }
  }

  return { throwGrenade, step, count: () => active.length };
}
