import * as THREE from 'three';
import { GOLD, PALE_GOLD } from './stage';

/**
 * The celestial machinery of Celestia: concentric armillary rings turning on different axes — a
 * floating colonnade of white-gold columns, a band of glowing engraved runes, a graduated meridian,
 * an ecliptic with orbiting spheres and a crossed gyroscope core — inside a field of stars.
 */

function runeTexture(): THREE.CanvasTexture {
  const w = 2048;
  const h = 96;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#120d07';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f2cf86';
  g.fillStyle = '#f2cf86';
  g.lineWidth = 3;
  g.globalAlpha = 0.9;
  g.fillRect(0, 6, w, 3);
  g.fillRect(0, h - 9, w, 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 30; x < w - 20; x += 46) {
    const cx = x;
    const cy = h / 2;
    const kind = Math.floor(rnd() * 7);
    g.beginPath();
    switch (kind) {
      case 0:
        g.arc(cx, cy, 13, 0, Math.PI * 2);
        g.moveTo(cx, cy - 20);
        g.lineTo(cx, cy + 20);
        break;
      case 1:
        g.moveTo(cx - 14, cy + 14);
        g.lineTo(cx, cy - 16);
        g.lineTo(cx + 14, cy + 14);
        g.closePath();
        g.moveTo(cx - 8, cy + 4);
        g.lineTo(cx + 8, cy + 4);
        break;
      case 2:
        g.moveTo(cx, cy - 18);
        g.lineTo(cx + 12, cy);
        g.lineTo(cx, cy + 18);
        g.lineTo(cx - 12, cy);
        g.closePath();
        g.moveTo(cx - 18, cy);
        g.lineTo(cx + 18, cy);
        break;
      case 3:
        g.arc(cx, cy, 15, Math.PI * 0.15, Math.PI * 1.85);
        g.moveTo(cx + 4, cy);
        g.arc(cx, cy, 4, 0, Math.PI * 2);
        break;
      case 4:
        g.moveTo(cx - 14, cy - 14);
        g.lineTo(cx + 14, cy + 14);
        g.moveTo(cx + 14, cy - 14);
        g.lineTo(cx - 14, cy + 14);
        g.moveTo(cx - 16, cy);
        g.lineTo(cx + 16, cy);
        break;
      case 5:
        g.moveTo(cx - 12, cy - 16);
        g.lineTo(cx - 12, cy + 16);
        g.moveTo(cx - 12, cy - 6);
        g.lineTo(cx + 12, cy - 16);
        g.moveTo(cx - 12, cy + 6);
        g.lineTo(cx + 12, cy + 16);
        break;
      default:
        g.arc(cx, cy, 6, 0, Math.PI * 2);
        g.moveTo(cx + 16, cy);
        g.arc(cx, cy, 16, 0, Math.PI * 2);
    }
    g.stroke();
    if (rnd() > 0.55) {
      g.fillRect(x + 22, cy - 2, 3, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = 8;
  return tex;
}

function ticks(radius: number, count: number, material: THREE.Material): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.035, 0.32, 0.06);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const major = i % 10 === 0;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
    s.set(1, major ? 1.8 : 1, 1);
    m.compose(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0), q, s);
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

export function buildArmillary(): { group: THREE.Group; animate: (t: number) => void } {
  const gold = GOLD();
  const pale = PALE_GOLD();
  const marble = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, metalness: 0.25, roughness: 0.42, emissive: 0x1a1206, emissiveIntensity: 0.4 });
  const group = new THREE.Group();

  // 1. Colonnade halo — a floating ring of columns between two gold bands.
  const colonnade = new THREE.Group();
  const R = 10.5;
  const columns = 72;
  const colGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.5, 10);
  const colMesh = new THREE.InstancedMesh(colGeo, marble, columns);
  const m = new THREE.Matrix4();
  for (let i = 0; i < columns; i++) {
    const a = (i / columns) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * R, 0, Math.sin(a) * R);
    colMesh.setMatrixAt(i, m);
  }
  colonnade.add(colMesh);
  for (const y of [-0.82, 0.82]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 8, 220), gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    colonnade.add(band);
  }
  const capital = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 6, 220), pale);
  capital.rotation.x = Math.PI / 2;
  capital.position.y = 1.0;
  colonnade.add(capital);
  colonnade.rotation.x = 0.32;
  group.add(colonnade);

  // 2. Rune band — an engraved band whose glyphs glow.
  const runes = runeTexture();
  const runeMat = new THREE.MeshStandardMaterial({
    map: runes,
    emissiveMap: runes,
    emissive: 0xffd889,
    emissiveIntensity: 0.9,
    metalness: 0.7,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  const runeBand = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.7, 200, 1, true), runeMat);
  const runeHolder = new THREE.Group();
  runeHolder.add(runeBand);
  for (const y of [-0.38, 0.38]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.045, 8, 200), gold);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = y;
    runeHolder.add(edge);
  }
  runeHolder.rotation.set(1.15, 0, 0.35);
  group.add(runeHolder);

  // 3. Meridian — graduated ring.
  const meridian = new THREE.Group();
  meridian.add(new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.07, 12, 200), gold));
  meridian.add(ticks(5.6, 120, pale));
  meridian.rotation.set(0.15, 0.9, 0);
  group.add(meridian);

  // 4. Ecliptic with orbiting spheres.
  const ecliptic = new THREE.Group();
  ecliptic.add(new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.04, 10, 180), pale));
  const orbs: THREE.Mesh[] = [];
  const orbMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x58d8ff, emissiveIntensity: 2.2, roughness: 0.2 });
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13 + i * 0.03, 20, 16), i === 1 ? gold : orbMat);
    ecliptic.add(orb);
    orbs.push(orb);
  }
  ecliptic.rotation.set(1.35, 0.4, 0.2);
  group.add(ecliptic);

  // 5. Gyroscope core.
  const core = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4 - i * 0.35, 0.035, 10, 140), i === 1 ? pale : gold);
    ring.rotation.set((i * Math.PI) / 3, (i * Math.PI) / 4, 0);
    core.add(ring);
  }
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffc966, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.3, flatShading: true }));
  core.add(heart);
  const heartLight = new THREE.PointLight(0xffd28a, 9, 12, 2);
  core.add(heartLight);
  group.add(core);

  // Distant stars.
  const starGeo = new THREE.BufferGeometry();
  const N = 1800;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 40 + Math.random() * 50;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe8ecff, size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }));
  group.add(stars);

  const animate = (t: number) => {
    colonnade.rotation.y = t * 0.02;
    runeBand.rotation.y = -t * 0.05;
    meridian.rotation.z = t * 0.07;
    ecliptic.rotation.z = -t * 0.04;
    orbs.forEach((orb, i) => {
      const a = t * (0.35 - i * 0.08) + (i * Math.PI * 2) / 3;
      orb.position.set(Math.cos(a) * 4.3, Math.sin(a) * 4.3, 0);
    });
    core.rotation.y = t * 0.22;
    core.rotation.x = t * 0.13;
    core.children.forEach((c, i) => {
      if (i < 3) c.rotation.z = t * (0.3 + i * 0.15) * (i % 2 ? -1 : 1);
    });
    heart.rotation.y = -t * 0.5;
    heartLight.intensity = 8 + Math.sin(t * 1.6) * 2;
    stars.rotation.y = t * 0.004;
  };

  return { group, animate };
}
