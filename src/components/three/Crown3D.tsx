import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createStage } from '@/three/stage';
import { buildTiara } from '@/three/tiara';
import { useReducedMotionPref } from '@/lib/motion';

/** Nukvah's crown rendered in real 3D on a transparent canvas. Lazy-loaded (three.js). */
export default function Crown3D({ className = '', distance = 6.8 }: { className?: string; distance?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(canvas, { transparent: true, reduced, parallax: 0.25, fov: 32 });
    } catch {
      return; // WebGL unavailable: the caller's 2D fallback stays visible underneath.
    }
    stage.camera.position.set(0, 0.1, distance);
    stage.camera.lookAt(0, 0, 0);
    const key = new THREE.DirectionalLight(0xfff1d0, 2.4);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.4);
    rim.position.set(-3, 1, -3);
    stage.scene.add(key, rim, new THREE.AmbientLight(0xffe6b0, 0.25));
    const crown = buildTiara();
    stage.scene.add(crown.group);
    stage.onFrame((t, p) => {
      crown.animate(t, p);
      stage.camera.lookAt(0, 0, 0);
    });
    return () => stage.dispose();
  }, [reduced, distance]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
