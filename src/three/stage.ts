import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export interface StageOptions {
  /** Transparent canvas (no bloom) so it can sit over CSS scenery. */
  transparent?: boolean;
  bloom?: { strength: number; radius: number; threshold: number } | null;
  background?: number;
  fov?: number;
  reduced?: boolean;
  /** Pointer parallax strength (camera offset in world units). */
  parallax?: number;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Per-frame callbacks; receive elapsed seconds and the eased pointer (-1..1). */
  onFrame: (fn: (t: number, pointer: THREE.Vector2) => void) => void;
  dispose: () => void;
  renderer: THREE.WebGLRenderer;
}

/**
 * A self-managing three.js stage on a canvas: PBR environment lighting (so gold reads as metal),
 * optional bloom, resize handling, pointer parallax, pause when hidden, and a single static frame
 * under reduced motion.
 */
export function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!opts.transparent, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.transparent ? 1.05 : 0.8;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  if (!opts.transparent) scene.background = new THREE.Color(opts.background ?? 0x04050b);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, 1, 0.1, 200);
  const base = new THREE.Vector3();

  let composer: EffectComposer | null = null;
  if (opts.bloom && !opts.transparent) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), opts.bloom.strength, opts.bloom.radius, opts.bloom.threshold));
    composer.addPass(new OutputPass());
  }

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const pointer = new THREE.Vector2();
  const target = new THREE.Vector2();
  const onMove = (e: PointerEvent) => target.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  window.addEventListener('pointermove', onMove, { passive: true });

  const frames: ((t: number, p: THREE.Vector2) => void)[] = [];
  const clock = new THREE.Clock();
  let raf = 0;
  let started = false;
  const render = () => {
    const t = opts.reduced ? 2 : clock.getElapsedTime();
    pointer.lerp(target, opts.reduced ? 1 : 0.05);
    if (!started) {
      base.copy(camera.position);
      started = true;
    }
    const k = opts.parallax ?? 0;
    camera.position.set(base.x + pointer.x * k, base.y - pointer.y * k * 0.6, base.z);
    for (const fn of frames) fn(t, pointer);
    if (composer) composer.render();
    else renderer.render(scene, camera);
  };
  const loop = () => {
    render();
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (opts.reduced) requestAnimationFrame(render);
    else raf = requestAnimationFrame(loop);
  };
  const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
  document.addEventListener('visibilitychange', onVis);
  // Defer the first frame so callers can position the camera and add objects first.
  setTimeout(start, 0);

  return {
    scene,
    camera,
    renderer,
    onFrame: (fn) => frames.push(fn),
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => {
          Object.values(m).forEach((v) => v instanceof THREE.Texture && v.dispose());
          m.dispose();
        });
      });
      env.dispose();
      pmrem.dispose();
      composer?.dispose();
      renderer.dispose();
    },
  };
}

export const GOLD = () =>
  new THREE.MeshStandardMaterial({ color: 0xf0c56a, metalness: 1, roughness: 0.24, emissive: 0x2a1800, emissiveIntensity: 0.6 });
export const PALE_GOLD = () => new THREE.MeshStandardMaterial({ color: 0xfff0c8, metalness: 1, roughness: 0.15, emissive: 0x3a2a08, emissiveIntensity: 0.5 });
