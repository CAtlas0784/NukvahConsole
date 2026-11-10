import { Starfield } from './Starfield';
import { Motes } from './Motes';
import { Orrery } from './Orrery';

/**
 * App-wide 2.5D backdrop. Layers sit at different depths and shift with the pointer (`--px`,
 * `--py` from the reactor): far stars barely move, the tilted celestial orrery drifts, near motes
 * react directly. Under reduced motion the layers are static.
 */
export function CelestialBackdrop() {
  const layer = (depth: number) => ({
    transform: `translate3d(calc(var(--px, 0) * ${-depth}px), calc(var(--py, 0) * ${-depth * 0.6}px), 0)`,
    transition: 'transform 900ms cubic-bezier(.22,1,.36,1)',
  });
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -inset-8" style={layer(8)}>
        <Starfield />
      </div>
      {/* the heavens' machinery: a vast orrery seen at a low angle */}
      <div className="absolute -inset-20" style={layer(26)}>
        <div className="absolute top-[52%] left-1/2" style={{ perspective: '1200px' }}>
          <div style={{ transform: 'translate(-50%, -50%) rotateX(72deg) rotateZ(0deg)', transformStyle: 'preserve-3d' }}>
            <Orrery size={1500} className="max-w-none opacity-[0.17]" />
          </div>
        </div>
        <div className="absolute top-[-18%] left-1/2 h-[60vh] w-[90vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(247,228,176,0.10),transparent)]" />
      </div>
      <div className="absolute inset-0" style={layer(46)}>
        <Motes count={46} className="absolute inset-0" />
      </div>
    </div>
  );
}
