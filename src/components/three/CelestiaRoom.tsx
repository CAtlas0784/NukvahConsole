import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createStage } from '@/three/stage';
import { buildCelestiaRoom, ROOM_SHOTS, type RoomShot } from '@/three/celestiaRoom';
import { useReducedMotionPref } from '@/lib/motion';

/**
 * The Celestia computing room in real 3D. `shot` names a camera position; the camera glides there
 * smoothly (critically damped) so each dialogue line can stage the scene. Lazy-loaded.
 */
export default function CelestiaRoom({ shot, exposure = 1, className = '' }: { shot: RoomShot; exposure?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shotRef = useRef(shot);
  const exposureRef = useRef(exposure);
  shotRef.current = shot;
  exposureRef.current = exposure;
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(canvas, { background: 0x10132a, bloom: { strength: 0.7, radius: 0.5, threshold: 0.9 }, reduced, parallax: 0, fov: 52 });
    } catch {
      return;
    }
    stage.scene.fog = new THREE.FogExp2(0x262b52, 0.0155);
    const room = buildCelestiaRoom();
    stage.scene.add(room.group);

    const start = ROOM_SHOTS.gate;
    const pos = start.pos.clone();
    const look = start.look.clone();
    const posVel = new THREE.Vector3();
    const lookVel = new THREE.Vector3();
    stage.camera.position.copy(pos);
    stage.camera.lookAt(look);
    let last = 0;
    const renderer = stage.renderer;

    // Smooth-damp toward the target shot (frame-rate independent).
    const damp = (cur: THREE.Vector3, vel: THREE.Vector3, target: THREE.Vector3, smooth: number, dt: number) => {
      const omega = 2 / smooth;
      const x = omega * dt;
      const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = cur.clone().sub(target);
      const temp = vel.clone().addScaledVector(change, omega).multiplyScalar(dt);
      vel.sub(temp.clone().multiplyScalar(omega)).multiplyScalar(exp);
      cur.copy(target).add(change.add(temp).multiplyScalar(exp));
    };

    stage.onFrame((t, p) => {
      const dt = Math.min(0.1, Math.max(0.001, t - last));
      last = t;
      room.update(t);
      const target = ROOM_SHOTS[shotRef.current];
      if (reduced) {
        pos.copy(target.pos);
        look.copy(target.look);
      } else {
        damp(pos, posVel, target.pos, 4.2, dt);
        damp(look, lookVel, target.look, 3.4, dt);
      }
      stage.camera.position.set(pos.x + p.x * 0.8, pos.y - p.y * 0.5, pos.z);
      stage.camera.lookAt(look);
      renderer.toneMappingExposure = 0.62 * exposureRef.current;
    });
    return () => stage.dispose();
  }, [reduced]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
