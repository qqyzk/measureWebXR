import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader, addAfterEffect } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useState } from "react";

const publicBaseUrl = process.env.PUBLIC_URL || '';
let name = 'Box';
let type = 'gltf';
let N = 2;
let clickTimeAbsMs = null;
let loadLogged = false;

function getAbsoluteNow() {
  return performance.timeOrigin + performance.now();
}

function getPositions() {
  const minx = -0.5, miny = -0.8, minz = -20;
  const maxx = 0.5, maxy = 0.8, maxz = -3;
  const stepDenom = Math.max(1, N - 1);
  const positions = [];
  for (let i = 0; i < N; ++i)
    for (let j = 0; j < N; ++j)
      for (let k = 0; k < N; ++k)
        positions.push({
          x: minx + (maxx - minx) / stepDenom * i,
          y: miny + (maxy - miny) / stepDenom * j,
          z: minz + (maxz - minz) / stepDenom * k
        });
  return positions;
}

let loaded = false;

function Model() {
  let url, scale;
  if (name === 'Box' && type === 'gltf') {
    url = `${publicBaseUrl}/gltf/Box/box.gltf`; scale = 0.05;
  } else if (name === 'Box' && type === 'glb') {
    url = `${publicBaseUrl}/gltf/Box/Box.glb`; scale = 0.05;
  } else if (name === 'BoxTextured' && type === 'gltf') {
    url = `${publicBaseUrl}/gltf/BoxTextured4/BoxTextured.gltf`; scale = 0.05;
  } else {
    url = `${publicBaseUrl}/gltf/Box/Box.glb`; scale = 0.05;
  }

  const gltf = useLoader(GLTFLoader, url, (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(`${publicBaseUrl}/decoder/`);
    loader.setDRACOLoader(dracoLoader);
  });

  useEffect(() => {
    loaded = true;
    if (!loadLogged) {
      loadLogged = true;
      const sceneLoadedTimeAbsMs = getAbsoluteNow();
      console.log('scene loaded time', sceneLoadedTimeAbsMs);
      if (clickTimeAbsMs !== null) {
        console.log('load duration', sceneLoadedTimeAbsMs - clickTimeAbsMs, 'ms');
      }
    }
  }, [gltf]);

  const positions = useMemo(() => getPositions(), []);

  return (
    <>
      {positions.map((pos, idx) => (
        <primitive
          key={idx}
          object={gltf.scene.clone()}
          scale={scale}
          position={[pos.x, pos.y, pos.z]}
        />
      ))}
    </>
  );
}

function Lights({ mode }) {
  switch (mode) {
    case 'ambient-directional':
      return (
        <>
          <ambientLight color={0xffffff} intensity={0.45} />
          <directionalLight color={0xffffff} intensity={1.8} position={[2, 5, 4]} castShadow />
        </>
      );
    case 'hemisphere-directional':
      return (
        <>
          <hemisphereLight args={[0xffffff, 0x223344, 0.7]} />
          <directionalLight color={0xffffff} intensity={1.4} position={[3, 6, 4]} castShadow />
        </>
      );
    case 'point':
      return (
        <>
          <ambientLight color={0xffffff} intensity={0.2} />
          <pointLight color={0xffffff} intensity={30} distance={80} position={[0, 3, -6]} castShadow />
        </>
      );
    case 'spot':
      return (
        <>
          <ambientLight color={0xffffff} intensity={0.15} />
          <spotLight color={0xffffff} intensity={40} distance={120} angle={Math.PI / 6} penumbra={0.35} position={[0, 6, -6]} castShadow />
        </>
      );
    default:
      return null;
  }
}

let startFlag = true, frameCount = 0, startTime = null, shouldLog = true;

function resetMetrics() {
  startFlag = true; frameCount = 0; startTime = null; shouldLog = true;
}

export default function AppLighting() {
  const [started, setStarted] = useState(false);
  const [lightMode, setLightMode] = useState('ambient-directional');

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      if (!loaded) return;
      const time = performance.now();
      if (startFlag) {
        startTime = time; startFlag = false;
        console.log('startTime', time, 'light:', lightMode);
      }
      frameCount += 1;
      if (frameCount % 1000 === 0) {
        const fps = 1000 * frameCount / (time - startTime);
        console.log('light:', lightMode, frameCount, fps.toFixed(1), 'fps');
      }
      if ((time - startTime) / 1000 > 60 && shouldLog) {
        shouldLog = false;
        const fps = 1000 * frameCount / (time - startTime);
        console.log('1min', 'light:', lightMode, (time - startTime) / 1000, frameCount, fps.toFixed(1), 'fps');
      }
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [lightMode]);

  const handleModeChange = (e) => {
    setLightMode(e.target.value);
    resetMetrics();
    console.log('lighting mode switched:', e.target.value);
  };

  return (
    <div className="App">
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        color: '#fff', background: 'rgba(0,0,0,0.65)',
        padding: 10, borderRadius: 6, fontFamily: 'monospace'
      }}>
        {!started && (
          <button onClick={() => {
            loaded = false;
            loadLogged = false;
            clickTimeAbsMs = getAbsoluteNow();
            console.log('click time', clickTimeAbsMs);
            setStarted(true);
          }}>
            Start
          </button>
        )}
        {' '}
        <label>light mode: </label>
        <select value={lightMode} onChange={handleModeChange}>
          <option value="ambient-directional">ambient + directional</option>
          <option value="hemisphere-directional">hemisphere + directional</option>
          <option value="point">point</option>
          <option value="spot">spot</option>
        </select>
      </div>

      {started && (
        <Canvas shadowMap camera={{ position: [0, 0, 0], fov: 40, near: 1, far: 100 }}>
          <color attach="background" args={['#000000']} />
          <Lights mode={lightMode} />
          <Suspense fallback={null}>
            <Model />
          </Suspense>
          <OrbitControls />
        </Canvas>
      )}
    </div>
  );
}
