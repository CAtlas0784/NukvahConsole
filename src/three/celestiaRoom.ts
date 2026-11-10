import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTiara } from './tiara';

/**
 * The Celestia computing room ("Divine Throne"), fully in 3D:
 *  - a domed cylindrical hall whose walls are tiers of arched alcoves, each holding a lantern
 *  - a coffered dome open at the top to a blazing oculus, with a volumetric beam of light
 *  - a walkway bridge entering through a great portal, with balustrades and lamp posts, over a
 *    misty abyss to a ring platform around the central tower
 *  - the tower: stacked drums, colonnades, arched windows, gold bands and a bell dome
 *  - the Divine Throne (Nukvah's crown) turning above the tower, and a floating golden orb
 * Units are metres; the tower stands at the origin and the walkway runs along +Z.
 */

const R = 46; // hall radius
const TIER_H = 6.2;
const TIERS_BELOW = 7;
const TIERS_ABOVE = 9;
const BAYS = 72;
const WALL_TOP = TIERS_ABOVE * TIER_H;
const WALL_BOTTOM = -TIERS_BELOW * TIER_H;

export const ROOM_SHOTS = {
  gate: { pos: new THREE.Vector3(-17, 16, R - 9), look: new THREE.Vector3(0, -6, 20) },
  walk: { pos: new THREE.Vector3(0.6, 4.2, 30), look: new THREE.Vector3(0, 13, 0) },
  throne: { pos: new THREE.Vector3(7, 6.5, 17), look: new THREE.Vector3(0, 33, 0) },
  bloom: { pos: new THREE.Vector3(2.5, 9, 11), look: new THREE.Vector3(0, 80, 0) },
} as const;
export type RoomShot = keyof typeof ROOM_SHOTS;

function stoneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8f8070';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = 110 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v - 10},${v - 22},0.12)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  g.strokeStyle = 'rgba(40,30,20,0.35)';
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
    for (let x = (y / 64) % 2 ? 0 : 64; x < 256; x += 128) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 64);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function coffersTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#f6e7c8');
  grd.addColorStop(1, '#6e5d4b');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 512; x += 32) {
      g.fillStyle = 'rgba(30,20,10,0.32)';
      g.fillRect(x + 5, y + 5, 22, 22);
      g.fillStyle = 'rgba(255,240,200,0.18)';
      g.fillRect(x + 5, y + 5, 22, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9b195';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) {
    const v = 150 + Math.random() * 70;
    g.fillStyle = `rgba(${v},${v - 16},${v - 34},0.10)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 7, 3 + Math.random() * 7);
  }
  const size = 128;
  for (let y = 0; y < 512; y += size) {
    for (let x = 0; x < 512; x += size) {
      g.strokeStyle = 'rgba(70,52,36,0.55)';
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
      g.strokeStyle = 'rgba(255,240,215,0.25)';
      g.lineWidth = 1;
      g.strokeRect(x + 5, y + 5, size - 10, size - 10);
      const cx = x + size / 2;
      const cy = y + size / 2;
      g.fillStyle = 'rgba(255,238,205,0.55)';
      g.beginPath();
      g.moveTo(cx, cy - 16);
      g.lineTo(cx + 3.5, cy - 3.5);
      g.lineTo(cx + 16, cy);
      g.lineTo(cx + 3.5, cy + 3.5);
      g.lineTo(cx, cy + 16);
      g.lineTo(cx - 3.5, cy + 3.5);
      g.lineTo(cx - 16, cy);
      g.lineTo(cx - 3.5, cy - 3.5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(110,80,50,0.5)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Carved interlace border running along V: overlapping ovals with a raised edge. */
function interlaceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b89c7c';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(70,50,32,0.6)';
  g.fillRect(0, 0, 5, 256);
  g.fillRect(59, 0, 5, 256);
  for (let y = -32; y < 288; y += 64) {
    for (const [stroke, w] of [
      ['rgba(70,50,32,0.65)', 9],
      ['rgba(245,226,196,0.85)', 4],
    ] as [string, number][]) {
      g.strokeStyle = stroke;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(32, y + 32, 18, 40, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One alcove module (frame + arch + sill), facing -Z, centred at the origin. */
function alcoveGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pillar = new THREE.BoxGeometry(0.55, 4.6, 1.3);
  parts.push(pillar.clone().translate(-1.45, -0.3, 0), pillar.clone().translate(1.45, -0.3, 0));
  const sill = new THREE.BoxGeometry(3.6, 0.5, 1.6);
  parts.push(sill.translate(0, -2.75, 0.1));
  const lintel = new THREE.BoxGeometry(3.9, 0.6, 1.4);
  parts.push(lintel.translate(0, 2.75, 0));
  const arch = new THREE.TorusGeometry(1.2, 0.26, 6, 16, Math.PI);
  parts.push(arch.translate(0, 1.0, 0.3));
  const back = new THREE.BoxGeometry(3.2, 5.2, 0.3);
  parts.push(back.translate(0, -0.2, -0.75));
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

export function buildCelestiaRoom(): { group: THREE.Group; update: (t: number) => void; crownGroup: THREE.Group } {
  const group = new THREE.Group();
  const stone = stoneTexture();
  const stoneMat = new THREE.MeshStandardMaterial({ map: stone, color: 0x9c8b74, roughness: 0.85, metalness: 0.05 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b866, metalness: 1, roughness: 0.3, emissive: 0x2a1600, emissiveIntensity: 0.5 });
  const marble = new THREE.MeshStandardMaterial({ color: 0xb9ad98, roughness: 0.6, metalness: 0.1 });

  // ---------------------------------------------------------------- hall wall
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.2, R + 1.2, WALL_TOP - WALL_BOTTOM + 8, BAYS, 1, true), darkStone);
  wall.material.side = THREE.BackSide;
  wall.position.y = (WALL_TOP + WALL_BOTTOM) / 2;
  group.add(wall);

  const tiers = TIERS_BELOW + TIERS_ABOVE;
  const alcoveCount = tiers * BAYS;
  const alcoves = new THREE.InstancedMesh(alcoveGeometry(), stoneMat, alcoveCount);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffb35a, emissive: 0xff7a1c, emissiveIntensity: 2.4 });
  const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), lanternMat, alcoveCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  let n = 0;
  for (let tIdx = 0; tIdx < tiers; tIdx++) {
    const y = WALL_BOTTOM + tIdx * TIER_H + TIER_H / 2;
    for (let b = 0; b < BAYS; b++) {
      const a = (b / BAYS) * Math.PI * 2;
      // Leave the portal bays open where the walkway enters (+Z).
      const nearPortal = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.09 && y > -4 && y < 14;
      const pos = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2);
      m.compose(pos, q, nearPortal ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : one);
      alcoves.setMatrixAt(n, m);
      const lp = new THREE.Vector3(Math.cos(a) * (R + 0.15), y - 0.6, Math.sin(a) * (R + 0.15));
      m.compose(lp, q, nearPortal ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : one);
      lanterns.setMatrixAt(n, m);
      // Lanterns dim with depth and vary a little, like flames.
      const depth = THREE.MathUtils.clamp((y - WALL_BOTTOM) / (WALL_TOP - WALL_BOTTOM), 0, 1);
      color.setRGB(0.35 + depth * 0.5, 0.22 + depth * 0.32, 0.1 + depth * 0.16).multiplyScalar(0.7 + Math.random() * 0.4);
      lanterns.setColorAt(n, color);
      n++;
    }
    // tier ledge
    const ledge = new THREE.Mesh(new THREE.TorusGeometry(R - 0.6, 0.32, 6, 160), tIdx % 3 === 0 ? gold : stoneMat);
    ledge.rotation.x = Math.PI / 2;
    ledge.position.y = WALL_BOTTOM + tIdx * TIER_H;
    group.add(ledge);
  }
  alcoves.instanceMatrix.needsUpdate = true;
  group.add(alcoves, lanterns);

  // Great pilasters dividing the wall into bays.
  const pilasters = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, WALL_TOP - WALL_BOTTOM, 2.2), stoneMat, 12);
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2 + Math.PI / 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2);
    m.compose(new THREE.Vector3(Math.cos(a) * (R - 1.3), (WALL_TOP + WALL_BOTTOM) / 2, Math.sin(a) * (R - 1.3)), q, one);
    pilasters.setMatrixAt(i, m);
  }
  group.add(pilasters);

  // ---------------------------------------------------------------- dome and oculus
  const coffers = coffersTexture();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R + 1, 96, 32, 0, Math.PI * 2, 0.2, Math.PI / 2 - 0.2),
    new THREE.MeshStandardMaterial({ map: coffers, side: THREE.BackSide, roughness: 0.7, emissive: 0x3a2c1a, emissiveIntensity: 0.25 }),
  );
  dome.position.y = WALL_TOP;
  dome.scale.y = 0.62;
  group.add(dome);
  const oculusY = WALL_TOP + (R + 1) * 0.62 * Math.cos(0.2);
  const oculusR = (R + 1) * Math.sin(0.2);
  const oculus = new THREE.Mesh(new THREE.CircleGeometry(oculusR + 0.2, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.6) }));
  oculus.rotation.x = Math.PI / 2;
  oculus.position.y = oculusY + 0.3;
  group.add(oculus);
  const oculusRim = new THREE.Mesh(new THREE.TorusGeometry(oculusR, 0.6, 8, 96), gold);
  oculusRim.rotation.x = Math.PI / 2;
  oculusRim.position.y = oculusY;
  group.add(oculusRim);

  // Volumetric beam: an additive cone fading downward and at its edges.
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uTop: { value: oculusY }, uBottom: { value: -10 } },
    vertexShader: /* glsl */ `
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uTop; uniform float uBottom;
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main(){ float h = clamp((vPos.y - uBottom) / (uTop - uBottom), 0.0, 1.0);
        float edge = pow(1.0 - abs(dot(vNormal, vView)), 1.6);
        float core = 1.0 - edge;
        float shimmer = 0.85 + 0.15 * sin(vPos.y * 0.35 - uTime * 1.2 + atan(vPos.z, vPos.x) * 6.0);
        float a = pow(h, 1.8) * core * 0.16 * shimmer;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * a, a); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(oculusR * 0.95, 13, oculusY + 10, 48, 1, true), beamMat);
  beam.position.y = (oculusY - 10) / 2;
  group.add(beam);

  // ---------------------------------------------------------------- the causeway
  // A massive ancient stone causeway on arched piers, crossing the misty depths to the tower.
  const deckY = 0;
  const DECK_W = 10;
  const deckStart = 11.2;
  const deckEnd = R + 1;
  const deckLen = deckEnd - deckStart;
  const deckMid = (deckStart + deckEnd) / 2;
  const tiles = tileTexture();
  tiles.repeat.set(DECK_W / 5, deckLen / 5);
  const tileMat = new THREE.MeshStandardMaterial({ map: tiles, color: 0xd9c2a6, roughness: 0.78, metalness: 0.02 });
  const sideMat = new THREE.MeshStandardMaterial({ map: stone, color: 0x8d7c69, roughness: 0.9 });
  // Box face order: +x, -x, +y, -y, +z, -z.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 2.4, deckLen), [sideMat, sideMat, tileMat, sideMat, sideMat, sideMat]);
  deck.position.set(0, deckY - 1.2, deckMid);
  group.add(deck);
  // Carved interlace border bands along both edges of the deck.
  const bandTex = interlaceTexture();
  bandTex.repeat.set(1, deckLen / 4);
  const bandMat = new THREE.MeshStandardMaterial({ map: bandTex, color: 0xe8d3b4, roughness: 0.6, emissive: 0x1a1006, emissiveIntensity: 0.3 });
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(0.9, deckLen), bandMat);
    band.rotation.set(-Math.PI / 2, 0, 0);
    band.position.set(side * (DECK_W / 2 - 1.15), deckY + 0.012, deckMid);
    group.add(band);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, deckLen), sideMat);
    curb.position.set(side * (DECK_W / 2 - 0.35), deckY + 0.27, deckMid);
    group.add(curb);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, deckLen), stoneMat);
    cap.position.set(side * (DECK_W / 2 - 0.35), deckY + 0.6, deckMid);
    group.add(cap);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, deckLen), stoneMat);
    cornice.position.set(side * (DECK_W / 2 + 0.2), deckY - 0.5, deckMid);
    group.add(cornice);
  }
  // Piers dropping into the depths, joined by great arches under the deck.
  const PIER_DEPTH = 80;
  const pierZs: number[] = [];
  for (let z = deckStart + 9; z < deckEnd - 4; z += 13) pierZs.push(z);
  for (const z of pierZs) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(DECK_W * 0.72, PIER_DEPTH, 4.4), sideMat);
    pier.position.set(0, deckY - 2.4 - PIER_DEPTH / 2, z);
    group.add(pier);
    for (const y of [-6, -20, -38]) {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(DECK_W * 0.8, 1.2, 5.2), stoneMat);
      plinth.position.set(0, deckY + y, z);
      group.add(plinth);
    }
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1.0, PIER_DEPTH, 1.4), stoneMat);
      rib.position.set(side * DECK_W * 0.36, deckY - 2.4 - PIER_DEPTH / 2, z);
      group.add(rib);
    }
  }
  const archZs = [deckStart, ...pierZs, deckEnd];
  for (let i = 0; i < archZs.length - 1; i++) {
    const z0 = archZs[i] + (i === 0 ? 0 : 2.2);
    const z1 = archZs[i + 1] - (i === archZs.length - 2 ? 0 : 2.2);
    const span = z1 - z0;
    if (span < 2) continue;
    // Arched spandrel: a thick half-ring under the deck, opening downward.
    const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.9, 6, 24, Math.PI), sideMat);
    arch.scale.set(1, 0.8, DECK_W * 0.62);
    arch.rotation.set(0, Math.PI / 2, Math.PI);
    arch.position.set(0, deckY - 2.6, (z0 + z1) / 2);
    group.add(arch);
  }
  // Stairs rising to the portal threshold.
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(DECK_W - 1.6, 0.32, 1.1), stoneMat);
    step.position.set(0, deckY + 0.16 + i * 0.32, deckEnd - 7.2 + i * 1.1);
    group.add(step);
  }
  const landing = new THREE.Mesh(new THREE.BoxGeometry(DECK_W - 1.6, 1.9, 2.4), stoneMat);
  landing.position.set(0, deckY + 0.95, deckEnd - 0.7);
  group.add(landing);
  // Soft light pooling on the causeway from above.
  const deckGlow = new THREE.SpotLight(0xffd9b8, 260, 70, 0.32, 0.9, 1.2);
  deckGlow.position.set(0, 60, 22);
  deckGlow.target.position.set(0, 0, 26);
  group.add(deckGlow, deckGlow.target);

  // Ruined colonnades drifting in the mist below the causeway.
  const ruinMat = new THREE.MeshStandardMaterial({ map: stone, color: 0x7f8094, roughness: 0.92 });
  const ruinSpots: [number, number, number, number, number][] = [
    [-24, -10, 22, 0.12, 5],
    [26, -14, 14, -0.2, 4],
    [-30, -22, -6, 0.35, 3],
    [22, -6, -22, -0.1, 5],
    [-12, -30, 34, 0.25, 3],
  ];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [x, y, z, tilt, count] of ruinSpots) {
    const ruin = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const h = 9 + rnd() * 8 - (i === count - 1 ? 5 : 0);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, h, 8), ruinMat);
      col.position.set(i * 3.2, h / 2, 0);
      ruin.add(col);
      const capital = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 2.8), ruinMat);
      capital.position.set(i * 3.2, h + 0.4, 0);
      ruin.add(capital);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(count * 3.2 - 1.2, 1.6, 3.0), ruinMat);
    lintel.position.set(((count - 1) * 3.2) / 2 - 1.2, 17, 0);
    lintel.rotation.z = 0.06;
    ruin.add(lintel);
    const base = new THREE.Mesh(new THREE.BoxGeometry(count * 3.2 + 1.4, 1.6, 4.4), ruinMat);
    base.position.set(((count - 1) * 3.2) / 2, -0.8, 0);
    ruin.add(base);
    ruin.position.set(x, y, z);
    ruin.rotation.set(tilt * 0.4, Math.atan2(x, z) + Math.PI / 2, tilt);
    group.add(ruin);
  }

  // Portal arch in the wall where the walkway enters.
  const portal = new THREE.Group();
  const jamb = new THREE.BoxGeometry(2.2, 14, 3.2);
  for (const side of [-1, 1]) {
    const j = new THREE.Mesh(jamb, stoneMat);
    j.position.set(side * 5.6, 7, 0);
    portal.add(j);
    const goldStrip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 14, 3.3), gold);
    goldStrip.position.set(side * 4.45, 7, 0);
    portal.add(goldStrip);
  }
  const portalArch = new THREE.Mesh(new THREE.TorusGeometry(5.6, 1.1, 10, 40, Math.PI), stoneMat);
  portalArch.position.set(0, 14, 0);
  portal.add(portalArch);
  const portalGold = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.12, 8, 40, Math.PI), gold);
  portalGold.position.set(0, 14, 1.6);
  portal.add(portalGold);
  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), gold);
  keystone.position.set(0, 20.6, 1.4);
  keystone.scale.set(0.8, 1.3, 0.5);
  portal.add(keystone);
  portal.position.set(0, deckY + 1.9, R - 0.2);
  group.add(portal);

  // Ring platform around the tower.
  const platform = new THREE.Mesh(new THREE.RingGeometry(7.2, 11.5, 96), marble);
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = deckY + 0.01;
  group.add(platform);
  const platformEdge = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 10.8, 1.6, 96, 1, true), stoneMat);
  platformEdge.position.y = deckY - 0.8;
  group.add(platformEdge);
  for (const r of [7.6, 11.2]) {
    const inlay = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 128), gold);
    inlay.rotation.x = Math.PI / 2;
    inlay.position.y = deckY + 0.05;
    group.add(inlay);
  }

  // ---------------------------------------------------------------- the tower
  const tower = new THREE.Group();
  const lathe = (pts: [number, number][], mat: THREE.Material) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 96), mat);
  // Shaft from the abyss to the platform.
  tower.add(lathe([[0, WALL_BOTTOM - 8], [5.6, WALL_BOTTOM - 8], [5.6, -1], [7.2, -0.5], [7.2, 0]], stoneMat));
  // Base drum with a colonnade.
  tower.add(lathe([[0, 0], [7.0, 0], [7.0, 0.8], [6.4, 1.0], [6.0, 1.0], [6.0, 7.4], [6.9, 7.6], [6.9, 8.4], [0, 8.4]], stoneMat));
  const colCount = 28;
  const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.36, 6.4, 12), marble, colCount);
  for (let i = 0; i < colCount; i++) {
    const a = (i / colCount) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * 6.45, 4.2, Math.sin(a) * 6.45);
    cols.setMatrixAt(i, m);
  }
  tower.add(cols);
  // Middle drum with arched windows.
  tower.add(lathe([[0, 8.4], [5.6, 8.4], [5.6, 16.2], [6.2, 16.4], [6.2, 17.2], [0, 17.2]], stoneMat));
  const winCount = 12;
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 4.4, 0.6), darkStone, winCount);
  const winArch = new THREE.InstancedMesh(new THREE.TorusGeometry(0.75, 0.16, 6, 14, Math.PI), gold, winCount);
  const winLight = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 3.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.72, 0.34) }), winCount);
  for (let i = 0; i < winCount; i++) {
    const a = (i / winCount) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
    m.compose(new THREE.Vector3(Math.cos(a) * 5.45, 12.4, Math.sin(a) * 5.45), q, one);
    windows.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(Math.cos(a) * 5.75, 14.6, Math.sin(a) * 5.75), q, one);
    winArch.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(Math.cos(a) * 5.78, 12.4, Math.sin(a) * 5.78), q, one);
    winLight.setMatrixAt(i, m);
  }
  tower.add(windows, winArch, winLight);
  // Upper drum, bell dome and lantern cupola.
  tower.add(lathe([[0, 17.2], [5.0, 17.2], [5.0, 21.6], [5.6, 21.8], [5.6, 22.4], [4.6, 22.6], [4.2, 24.2], [3.2, 25.6], [1.6, 26.4], [0.9, 26.6], [0.9, 27.6], [0, 27.6]], stoneMat));
  for (const [y, r] of [
    [0.95, 7.05],
    [8.05, 6.95],
    [16.8, 6.25],
    [22.1, 5.65],
  ] as [number, number][]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 8, 128), gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    tower.add(band);
  }
  const finialBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 1.2, 16), gold);
  finialBase.position.y = 28.2;
  tower.add(finialBase);
  group.add(tower);

  // ---------------------------------------------------------------- the Divine Throne
  const crown = buildTiara();
  const crownGroup = new THREE.Group();
  crownGroup.add(crown.group);
  crownGroup.scale.setScalar(4.2);
  crownGroup.position.set(0, 36.5, 0);
  group.add(crownGroup);
  const throneLight = new THREE.PointLight(0xffe4b0, 22, 30, 1.6);
  throneLight.position.set(0, 44, 10);
  group.add(throneLight);

  // Floating golden orb with an orbit ring.
  const orb = new THREE.Group();
  orb.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 40, 28),
      new THREE.MeshPhysicalMaterial({ color: 0xffe2a0, emissive: 0xffb84d, emissiveIntensity: 1.3, roughness: 0.1, transmission: 0.4, thickness: 1.2, clearcoat: 1 }),
    ),
  );
  const orbRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.2) }));
  orbRing.rotation.x = 1.2;
  orb.add(orbRing);
  const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)', 'rgba(255,190,90,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  orbGlow.scale.set(9, 9, 1);
  orb.add(orbGlow);
  orb.position.set(-15, 21, 6);
  group.add(orb);

  // Golden motes drifting up through the beam.
  const moteCount = 900;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    const r = Math.sqrt(Math.random()) * 15;
    const a = Math.random() * Math.PI * 2;
    motePos.set([Math.cos(a) * r, -10 + Math.random() * 90, Math.sin(a) * r], i * 3);
    moteSeed[i] = Math.random();
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({ map: glowTexture('rgba(255,245,215,1)', 'rgba(255,200,120,0.4)'), size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a8 }),
  );
  group.add(motes);

  // ---------------------------------------------------------------- lighting
  const sun = new THREE.SpotLight(0xfff0d0, 650, 160, 0.36, 0.7, 1.4);
  sun.position.set(0, oculusY, 0);
  sun.target.position.set(0, 24, 0);
  group.add(sun, sun.target);
  group.add(new THREE.HemisphereLight(0x8d95d8, 0x0b0c1a, 0.32));
  const wallWash = new THREE.PointLight(0xffc888, 70, 80, 1.4);
  wallWash.position.set(0, 46, 0);
  group.add(wallWash);

  const update = (t: number) => {
    // The Divine Throne faces the causeway entrance (+Z) and never turns away; it only floats.
    crown.animate(t, new THREE.Vector2(), 0);
    throneLight.intensity = 20 + Math.sin(t * 1.4) * 4;
    beamMat.uniforms.uTime.value = t;
    orb.position.y = 21 + Math.sin(t * 0.7) * 0.8;
    orb.rotation.y = t * 0.3;
    orbRing.rotation.z = t * 0.6;
    const p = moteGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < moteCount; i++) {
      let y = p.getY(i) + 0.02 + moteSeed[i] * 0.03;
      if (y > 85) y = -10;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.5 + moteSeed[i] * 20) * 0.004);
    }
    p.needsUpdate = true;
  };

  return { group, update, crownGroup };
}
