import * as THREE from 'three';
import { GOLD, PALE_GOLD } from './stage';

/**
 * Nukvah's crown as a procedural 3D model (ring radius = 1): gold halo ring, swept scimitar blades
 * (upper / side / lower pairs, extruded with bevels), a spear finial with diamond tip and crossbar,
 * and a cyan crystal core that emits light. Returns the group and a per-frame animator.
 */

function bladeShape(length: number, width: number, curve: number): THREE.Shape {
  // Root at the origin pointing +x; the tip curls by `curve` (positive = up).
  const s = new THREE.Shape();
  s.moveTo(0, -width * 0.55);
  s.bezierCurveTo(length * 0.35, -width * 0.7, length * 0.75, -width * 0.2 + curve * 0.4, length, curve);
  s.bezierCurveTo(length * 0.7, width * 0.15 + curve * 0.55, length * 0.3, width * 0.65, 0, width * 0.5);
  s.lineTo(0, -width * 0.55);
  return s;
}

function blade(length: number, width: number, curve: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(bladeShape(length, width, curve), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 28,
  });
  geo.translate(0, 0, -0.025);
  return new THREE.Mesh(geo, material);
}

function onRing(angleDeg: number, r = 1): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(angleDeg);
  return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
}

export function buildCrown(): { group: THREE.Group; animate: (t: number, pointer: THREE.Vector2) => void } {
  const gold = GOLD();
  const pale = PALE_GOLD();
  const group = new THREE.Group();
  const crown = new THREE.Group();
  group.add(crown);

  // Halo ring with an inner hairline.
  crown.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 28, 180), gold));
  crown.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.012, 8, 160), pale));

  // Blades: [ring angle, direction, length, width, curl]
  const BLADES: [number, number, number, number, number][] = [
    [72, 12, 1.45, 0.34, 0.42], // upper, sweeping out and up
    [12, -8, 1.7, 0.3, -0.12], // side, long and level
    [-42, -58, 1.05, 0.28, -0.32], // lower, raking down
  ];
  for (const side of [1, -1]) {
    for (const [ang, dir, len, w, curl] of BLADES) {
      const mount = new THREE.Group();
      mount.position.copy(onRing(ang, 0.98));
      mount.rotation.z = THREE.MathUtils.degToRad(dir);
      mount.add(blade(len, w, curl, gold));
      const holder = new THREE.Group();
      holder.add(mount);
      holder.scale.x = side;
      crown.add(holder);
    }
  }

  // Spear finial through the ring, diamond tip and crossbar leaves.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 2.15, 16), gold);
  shaft.position.y = 0.98;
  crown.add(shaft);
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), pale);
  tip.scale.set(0.11, 0.32, 0.11);
  tip.position.y = 2.2;
  crown.add(tip);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 10, 32), gold);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.86;
  crown.add(collar);
  for (const side of [1, -1]) {
    const leaf = blade(0.42, 0.12, 0.08, gold);
    leaf.position.set(0, 1.4, 0);
    leaf.rotation.z = THREE.MathUtils.degToRad(-18);
    const h = new THREE.Group();
    h.add(leaf);
    h.scale.x = side;
    crown.add(h);
  }

  // Crystal core.
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0x8ff6ff,
    emissive: 0x18c8ff,
    emissiveIntensity: 1.6,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.35,
    thickness: 0.6,
    ior: 1.7,
    clearcoat: 1,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystalMat);
  crystal.scale.set(0.2, 0.4, 0.2);
  crystal.position.y = -0.04;
  crown.add(crystal);
  const glow = new THREE.PointLight(0x5fe8ff, 3.5, 4, 1.6);
  glow.position.copy(crystal.position);
  crown.add(glow);

  // Soft additive halo sprite behind the crystal.
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(160,250,255,0.9)');
    grd.addColorStop(0.3, 'rgba(90,220,255,0.35)');
    grd.addColorStop(1, 'rgba(90,220,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.set(1.1, 1.1, 1);
  halo.position.copy(crystal.position);
  crown.add(halo);

  crown.position.y = -0.55; // centre the whole silhouette (finial included)

  const animate = (t: number, pointer: THREE.Vector2) => {
    crown.rotation.y = Math.sin(t * 0.32) * 0.75 + pointer.x * 0.25;
    crown.rotation.x = -pointer.y * 0.12 + Math.sin(t * 0.5) * 0.03;
    crown.position.y = -0.55 + Math.sin(t * 0.9) * 0.04;
    crystal.rotation.y = t * 0.8;
    const pulse = 1 + Math.sin(t * 2.2) * 0.08;
    halo.scale.set(1.1 * pulse, 1.1 * pulse, 1);
    glow.intensity = 3.2 + Math.sin(t * 2.2) * 0.6;
  };

  return { group, animate };
}
