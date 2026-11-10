import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createStage } from '@/three/stage';
import { buildArmillary } from '@/three/armillary';
import { useReducedMotionPref } from '@/lib/motion';

/**
 * Full-screen 3D backdrop: Celestia's armillary turning in a dark sky (bloom, fog, parallax).
 * `focus` shifts the machinery horizontally (-1 left … 1 right) to frame page content. Lazy-loaded.
 */
export default function ArmillaryBackdrop({ focus = 0, className = '' }: { focus?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(canvas, { background: 0x03040a, bloom: { strength: 0.55, radius: 0.4, threshold: 0.62 }, reduced, parallax: 1.4, fov: 40 });
    } catch {
      return;
    }
    stage.scene.fog = new THREE.FogExp2(0x03040a, 0.028);
    stage.camera.position.set(0, -1.6, 29);
    const key = new THREE.DirectionalLight(0xfff0d2, 1.6);
    key.position.set(6, 10, 12);
    const fill = new THREE.DirectionalLight(0x7f9dff, 0.5);
    fill.position.set(-8, -4, 6);
    stage.scene.add(key, fill, new THREE.AmbientLight(0x2a2440, 0.25));
    key.intensity = 0.9;
    const armillary = buildArmillary();
    armillary.group.position.x = focus * 7;
    stage.scene.add(armillary.group);
    const look = new THREE.Vector3(focus * 7 * 0.6, 0, 0);
    stage.onFrame((t) => {
      armillary.animate(t);
      stage.camera.lookAt(look);
    });
    return () => stage.dispose();
  }, [reduced, focus]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
