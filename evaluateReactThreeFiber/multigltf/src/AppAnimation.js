import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader, addAfterEffect } from "@react-three/fiber";
import { OrbitControls, useAnimations } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const publicBaseUrl = process.env.PUBLIC_URL || '';
const MODEL_URL = `${publicBaseUrl}/gltf/Soldier/Soldier.glb`;

let loaded = false;
let startFlag = true, frameCount = 0, startTime = null, shouldLog = true;

function SoldierModel({ activeClip, onClipsLoaded }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const ref = useRef();
  const { actions, names } = useAnimations(gltf.animations, ref);

  useEffect(() => {
    loaded = true;
    console.log('scene loaded time', performance.now());
    if (onClipsLoaded) onClipsLoaded(names);
  }, [gltf, names, onClipsLoaded]);

  useEffect(() => {
    if (!actions || names.length === 0) return;
    // Fade out all, fade in selected
    names.forEach(name => actions[name] && actions[name].fadeOut(0.3));
    const target = actions[activeClip];
    if (target) {
      target.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play();
    } else if (names.length > 0) {
      const first = actions[names[0]];
      if (first) first.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play();
    }
  }, [activeClip, actions, names]);

  return (
    <group ref={ref}>
      <primitive object={gltf.scene} />
    </group>
  );
}

export default function AppAnimation() {
  const [started, setStarted] = useState(false);
  const [activeClip, setActiveClip] = useState('Idle');
  const [clipNames, setClipNames] = useState(['Idle', 'Walk', 'Run']);

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      if (!loaded) return;
      const time = performance.now();
      if (startFlag) { startTime = time; startFlag = false; console.log('startTime', time); }
      frameCount += 1;
      if (frameCount % 300 === 0) {
        const fps = 1000 * frameCount / (time - startTime);
        console.log(frameCount, fps.toFixed(1), 'fps');
      }
      if ((time - startTime) / 1000 > 60 && shouldLog) {
        shouldLog = false;
        const fps = 1000 * frameCount / (time - startTime);
        console.log('1min result', fps.toFixed(1), 'fps');
      }
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  const handleClipsLoaded = (names) => {
    if (names.length > 0) setClipNames(names);
  };

  const switchClip = (name) => {
    setActiveClip(name);
  };

  return (
    <div className="App">
      {!started ? (
        <button type="button" onClick={() => { console.log('click', performance.now()); setStarted(true); }}>
          Start
        </button>
      ) : (
        <>
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 8, zIndex: 10
          }}>
            {clipNames.map(name => (
              <button
                key={name}
                onClick={() => switchClip(name)}
                style={{
                  padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                  borderRadius: 4, border: '1px solid #888', color: '#fff',
                  background: activeClip === name ? 'rgba(80,160,255,0.7)' : 'rgba(0,0,0,0.6)'
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <Canvas
            shadowMap
            camera={{ position: [1, 2, 5], fov: 45, near: 0.1, far: 100 }}
            onCreated={({ scene }) => {
              scene.fog = new THREE.Fog(0x334455, 10, 50);
            }}
          >
            <color attach="background" args={['#334455']} />
            <hemisphereLight args={[0xffffff, 0x444444, 0.6]} position={[0, 20, 0]} />
            <directionalLight
              color={0xffffff} intensity={0.8} position={[5, 10, 5]} castShadow
              shadow-mapSize-width={1024} shadow-mapSize-height={1024}
            />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[20, 20]} />
              <meshPhongMaterial color={0x556677} />
            </mesh>
            <gridHelper args={[20, 20, 0x445566, 0x334455]} />
            <Suspense fallback={null}>
              <SoldierModel activeClip={activeClip} onClipsLoaded={handleClipsLoaded} />
            </Suspense>
            <OrbitControls target={[0, 1, 0]} />
          </Canvas>
        </>
      )}
    </div>
  );
}
