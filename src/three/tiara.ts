import * as THREE from 'three';

/**
 * Nukvah's crown as a faceted tiara (modelled after the reference render): a tall diamond-section
 * central spike with a curled cross-guard and a lower spike, a segmented circlet band, crescent
 * hooks beside the centre, angular wings at the band's ends and long fangs curving down.
 * Painted with a vertical cream → ochre-gold gradient in vertex colours (stylised, flat-shaded),
 * in the spirit of the reference texture. Built from scratch — no game assets.
 * Band radius ≈ 1; the front of the crown faces +Z.
 */

const CREAM = new THREE.Color(0xfbf3df);
const GOLD = new THREE.Color(0xe6cd98);
const OCHRE = new THREE.Color(0xb8945c);

function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/** Diamond-section spike along +Y from y0 to y1, widest at `bulge` (0..1). */
function spike(y0: number, y1: number, width: number, bulge = 0.2): THREE.BufferGeometry {
  const h = y1 - y0;
  const pts = [
    new THREE.Vector2(0.0001, 0),
    new THREE.Vector2(width * 0.55, h * 0.04),
    new THREE.Vector2(width, h * bulge),
    new THREE.Vector2(width * 0.62, h * 0.62),
    new THREE.Vector2(width * 0.25, h * 0.9),
    new THREE.Vector2(0.0001, h),
  ];
  const g = new THREE.LatheGeometry(pts, 4);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, 0.55); // flatter front-to-back, like a blade
  g.translate(0, y0, 0);
  return faceted(g);
}

/** A flat extruded blade from a 2D outline, with a narrow bevel for crisp facets. */
function plate(points: [number, number][], depth = 0.06): THREE.BufferGeometry {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.45, bevelSize: depth * 0.35, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return faceted(g);
}

/** Curved sickle/fang outline: starts at the root (0,0), arcs through `ctrl` to the tip. */
function sickle(len: number, bend: number, width: number): [number, number][] {
  const out: [number, number][] = [];
  const n = 9;
  // outer edge root → tip
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * len;
    const y = Math.sin(t * Math.PI * 0.9) * bend + t * t * bend * 0.6;
    const w = width * (1 - t) ** 1.2;
    out.push([x, y + w * 0.5]);
  }
  // inner edge tip → root
  for (let i = n - 1; i >= 0; i--) {
    const t = i / n;
    const x = t * len * 0.96;
    const y = Math.sin(t * Math.PI * 0.9) * bend + t * t * bend * 0.6;
    const w = width * (1 - t) ** 1.2;
    out.push([x, y - w * 0.5]);
  }
  return out;
}

function paintByHeight(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const tmp = new THREE.Vector3();
  const c = new THREE.Color();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const h = (tmp.y - box.min.y) / Math.max(0.001, box.max.y - box.min.y);
      // lower parts ochre, middle gold, tips cream — like the painted reference
      if (h < 0.45) c.copy(OCHRE).lerp(GOLD, h / 0.45);
      else c.copy(GOLD).lerp(CREAM, Math.min(1, (h - 0.45) / 0.4));
      // a touch of per-face variation so facets read
      const f = 0.92 + ((Math.floor(i / 3) * 7919) % 13) / 100;
      colors.set([c.r * f, c.g * f, c.b * f], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  });
}

export function buildTiara(): { group: THREE.Group; animate: (t: number, pointer: THREE.Vector2, sway?: number) => void } {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.28, roughness: 0.5, emissive: 0x2a1c08, emissiveIntensity: 0.35 });
  const group = new THREE.Group();
  const crown = new THREE.Group();
  group.add(crown);
  const add = (geo: THREE.BufferGeometry, setup?: (m: THREE.Mesh) => void, parent: THREE.Object3D = crown) => {
    const m = new THREE.Mesh(geo, mat);
    setup?.(m);
    parent.add(m);
    return m;
  };

  const R = 1;
  const bandY = (a: number) => -0.18 * (1 - Math.cos(a)) + 0.06 * Math.sin(a * 3) ** 2;
  const onBand = (a: number) => new THREE.Vector3(Math.sin(a) * R, bandY(a), Math.cos(a) * R);

  // Circlet band: faceted tube along the front ~200°, plus a raised ridge.
  const span = THREE.MathUtils.degToRad(100);
  const curvePts = Array.from({ length: 41 }, (_, i) => onBand(-span + (i / 40) * span * 2));
  const curve = new THREE.CatmullRomCurve3(curvePts);
  const band = new THREE.TubeGeometry(curve, 120, 0.085, 4, false);
  add(faceted(band), (m) => m.scale.set(1, 1.6, 1));
  add(faceted(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts.map((p) => p.clone().multiplyScalar(1.02).add(new THREE.Vector3(0, 0.1, 0)))), 120, 0.03, 4, false)));
  // Segment plates along the band.
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const a = (i / 5.6) * span;
    add(plate([[-0.09, -0.12], [0.09, -0.12], [0.06, 0.12], [0, 0.17], [-0.06, 0.12]], 0.05), (m) => {
      m.position.copy(onBand(a)).multiplyScalar(1.04);
      m.position.y = bandY(a) + 0.02;
      m.rotation.y = a;
    });
  }

  // Central spire at the front.
  const front = new THREE.Group();
  front.position.copy(onBand(0)).multiplyScalar(1.07);
  front.position.y = bandY(0);
  crown.add(front);
  add(spike(0.25, 2.25, 0.16, 0.12), undefined, front); // upper blade
  add(spike(0, 0.95, 0.1, 0.2), (m) => (m.rotation.z = Math.PI), front); // lower spike (flipped)
  add(spike(-0.05, 0.42, 0.13, 0.5), undefined, front); // grip
  // Cross-guard: arms with upward curls, and a central gem plate.
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.scale.x = side;
    front.add(arm);
    add(plate([[0.02, 0.36], [0.34, 0.42], [0.42, 0.52], [0.3, 0.5], [0.06, 0.48]]), undefined, arm);
    add(plate(sickle(0.32, 0.16, 0.08).map(([x, y]) => [x + 0.3, y + 0.46]), 0.045), undefined, arm);
    add(plate([[0.05, 0.62], [0.2, 0.74], [0.12, 0.98], [0.04, 0.8]], 0.045), undefined, arm); // upper leaf
  }
  add(plate([[0, 0.3], [0.1, 0.48], [0, 0.66], [-0.1, 0.48]], 0.08), (m) => (m.position.z = 0.03), front);

  for (const side of [1, -1]) {
    const half = new THREE.Group();
    half.scale.x = side;
    crown.add(half);

    // Crescent hook rising beside the centre, curling outward.
    const hookA = THREE.MathUtils.degToRad(26);
    const hook = new THREE.Group();
    hook.position.copy(onBand(hookA)).multiplyScalar(1.05);
    hook.rotation.y = hookA * 0.35;
    half.add(hook);
    add(plate(sickle(0.85, 0.42, 0.22).map(([x, y]) => [y * 0.6 + 0.02, x]), 0.07), (m) => (m.rotation.z = -0.15), hook);

    // End wings: angular feather blades sweeping out and up.
    const endA = THREE.MathUtils.degToRad(84);
    const end = new THREE.Group();
    end.position.copy(onBand(endA)).multiplyScalar(1.06);
    end.rotation.y = endA * 0.35;
    half.add(end);
    add(plate([[0, -0.08], [0.55, 0.12], [1.15, 0.62], [0.62, 0.32], [0.48, 0.42], [0.36, 0.22], [0, 0.12]], 0.07), undefined, end);
    add(plate([[0.1, 0.0], [0.42, -0.02], [0.62, 0.18], [0.36, 0.1]], 0.06), (m) => (m.position.y = -0.18), end);
    // Fang curving down and inward from below the wing.
    add(plate(sickle(0.9, 0.3, 0.16).map(([x, y]) => [-y * 0.9, -x]), 0.07), (m) => {
      m.position.set(0.12, -0.08, 0);
      m.rotation.z = -0.25;
    }, end);

    // Mid fang hanging from the band between hook and wing.
    const midA = THREE.MathUtils.degToRad(52);
    const mid = new THREE.Group();
    mid.position.copy(onBand(midA)).multiplyScalar(1.05);
    mid.rotation.y = midA * 0.35;
    half.add(mid);
    add(plate(sickle(0.95, 0.38, 0.2).map(([x, y]) => [y * 0.9 + x * 0.15, -x]), 0.07), undefined, mid);
    add(plate([[-0.12, 0.02], [0.18, 0.08], [0.32, 0.3], [0.05, 0.16]], 0.06), undefined, mid);
  }

  crown.position.y = -0.4;
  paintByHeight(crown);

  // Small dark-blue four-point star jewel behind the centre, as on the reference sheet.
  const jewel = new THREE.Mesh(
    faceted(plate([[0, 0.22], [0.05, 0.05], [0.22, 0], [0.05, -0.05], [0, -0.22], [-0.05, -0.05], [-0.22, 0], [-0.05, 0.05]], 0.04)),
    new THREE.MeshStandardMaterial({ color: 0x2d3d8f, emissive: 0x1b2a7a, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3, flatShading: true }),
  );
  jewel.position.copy(front.position).add(new THREE.Vector3(0, 0.48, 0.07));
  crown.add(jewel);

  /** `sway` 0 keeps the crown facing straight ahead (+Z); 1 lets it turn gently to show its depth. */
  const animate = (t: number, pointer: THREE.Vector2, sway = 1) => {
    crown.rotation.y = (Math.sin(t * 0.3) * 0.6 + pointer.x * 0.25) * sway;
    crown.rotation.x = 0.12 - pointer.y * 0.1 * sway;
    crown.position.y = -0.4 + Math.sin(t * 0.9) * 0.035;
  };

  return { group, animate };
}
