import "./styles.css";
import { Canvas, useFrame } from "@react-three/fiber";
import { addAfterEffect } from "@react-three/fiber";
import { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";

let startFlag = true, frameCount = 0, startTime = null, shouldLog = true;

function ParticleSystem({ mode, count }) {
  const pointsRef = useRef();
  const clockRef = useRef(new THREE.Clock());
  const userDataRef = useRef(null);

  const { geo, mat } = useMemo(() => {
    const positions  = new Float32Array(count * 3);
    const colors     = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes  = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 1.0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.0;

      velocities[i * 3]     = (Math.random() - 0.5) * 0.03;
      velocities[i * 3 + 1] = Math.random() * 0.08 + 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.03;

      lifetimes[i] = Math.random();

      if (mode === 'fire') {
        colors[i * 3]     = 1.0;
        colors[i * 3 + 1] = Math.random() * 0.5;
        colors[i * 3 + 2] = 0.0;
      } else {
        const v = Math.random() * 0.4 + 0.3;
        colors[i * 3] = v; colors[i * 3 + 1] = v; colors[i * 3 + 2] = v;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: mode === 'fire' ? 0.85 : 0.45,
      depthWrite: false,
      blending: mode === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true
    });

    userDataRef.current = { velocities, lifetimes, mode, count };
    return { geo: geometry, mat: material };
  }, [mode, count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const delta = clockRef.current.getDelta();
    const { velocities, lifetimes, mode, count } = userDataRef.current;
    const pos = pointsRef.current.geometry.attributes.position;
    const col = pointsRef.current.geometry.attributes.color;

    for (let i = 0; i < count; i++) {
      lifetimes[i] += delta * 0.5;
      if (lifetimes[i] > 1.0) {
        lifetimes[i] = 0;
        pos.array[i * 3]     = (Math.random() - 0.5) * 1.0;
        pos.array[i * 3 + 1] = 0;
        pos.array[i * 3 + 2] = (Math.random() - 0.5) * 1.0;
        velocities[i * 3]     = (Math.random() - 0.5) * 0.03;
        velocities[i * 3 + 1] = Math.random() * 0.08 + 0.02;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
      } else {
        pos.array[i * 3]     += velocities[i * 3];
        pos.array[i * 3 + 1] += velocities[i * 3 + 1];
        pos.array[i * 3 + 2] += velocities[i * 3 + 2];
        const age = lifetimes[i];
        if (mode === 'fire') {
          col.array[i * 3 + 1] = Math.max(0, (0.5 - age) * 1.0);
        } else {
          const v = 0.3 + age * 0.4;
          col.array[i * 3] = v; col.array[i * 3 + 1] = v; col.array[i * 3 + 2] = v;
        }
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  // Dispose old geometry/material when props change
  useEffect(() => {
    return () => { geo.dispose(); mat.dispose(); };
  }, [geo, mat]);

  return <points ref={pointsRef} geometry={geo} material={mat} />;
}

export default function AppParticles() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState('smoke');
  const [count, setCount] = useState(5000);
  const [displayCount, setDisplayCount] = useState(5000);
  const [activeKey, setActiveKey] = useState(0);

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      const time = performance.now();
      if (startFlag) { startTime = time; startFlag = false; }
      frameCount += 1;
      if (frameCount % 300 === 0) {
        const fps = 1000 * frameCount / (time - startTime);
        console.log('frame', frameCount, 'fps:', fps.toFixed(1), 'particles:', count);
      }
      if ((time - startTime) / 1000 > 60 && shouldLog) {
        shouldLog = false;
        const fps = 1000 * frameCount / (time - startTime);
        console.log('1min result', fps.toFixed(1), 'fps  particles:', count);
      }
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [count]);

  const handleStart = () => {
    if (!started) {
      setStarted(true);
    } else {
      // Rebuild particle system
      startFlag = true; frameCount = 0; startTime = null; shouldLog = true;
      setCount(displayCount);
      setActiveKey(k => k + 1);
    }
  };

  return (
    <div className="App">
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 10, color: '#fff',
        background: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 4, fontFamily: 'monospace'
      }}>
        Particle Effects (React Three Fiber)<br />
        Particles: {count}  Mode: {mode}
      </div>
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 10, color: '#fff',
        background: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 4, fontFamily: 'monospace'
      }}>
        <label style={{ display: 'block', margin: '4px 0' }}>Mode:
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="smoke">Smoke</option>
            <option value="fire">Fire</option>
          </select>
        </label>
        <label style={{ display: 'block', margin: '4px 0' }}>
          Count: {displayCount}
          <br />
          <input
            type="range" min="100" max="50000" step="100" value={displayCount}
            style={{ width: 160 }}
            onChange={e => setDisplayCount(parseInt(e.target.value))}
          />
        </label>
        <button onClick={handleStart} style={{ marginTop: 4 }}>
          {started ? 'Restart' : 'Start'}
        </button>
      </div>

      {started && (
        <Canvas camera={{ position: [0, 5, 20], fov: 60, near: 0.1, far: 1000 }}>
          <color attach="background" args={['#000000']} />
          <ambientLight intensity={0.1} />
          <ParticleSystem key={activeKey + '-' + mode} mode={mode} count={count} />
        </Canvas>
      )}
    </div>
  );
}
