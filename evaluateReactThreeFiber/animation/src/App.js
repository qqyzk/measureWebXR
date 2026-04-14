import "./styles.css";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, addAfterEffect, useFrame } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const publicBaseUrl = process.env.PUBLIC_URL || "";
const MODEL_URL = `${publicBaseUrl}/gltf/Soldier/Soldier.glb`;
const DEFAULT_ACTIONS = ["Idle", "Walk", "Run"];
const LOAD_REQUEST_TIME = typeof performance !== "undefined" ? performance.now() : 0;

function Soldier({
  activeAction,
  showSkeleton,
  setActiveAction,
  setClipNames,
  setMetrics,
  setStatus
}) {
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions, names } = useAnimations(animations, scene);
  const perfRef = useRef({
    action: "-",
    frameCount: 0,
    frameTimeSum: 0,
    frameStartMark: 0,
    startTime: 0,
    lastHudUpdate: 0,
    shouldLogMinute: true
  });

  const { scale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetHeight = 2;
    const nextScale = size.y > 0 ? targetHeight / size.y : 1;

    return {
      scale: nextScale,
      offset: [-center.x, -box.min.y, -center.z]
    };
  }, [scene]);

  const skeletonHelper = useMemo(() => new THREE.SkeletonHelper(scene), [scene]);

  const logActionSummary = useCallback((reason) => {
    const perf = perfRef.current;
    if (!perf.startTime || perf.frameCount === 0) return;

    const elapsed = performance.now() - perf.startTime;
    if (elapsed <= 0) return;

    const fps = (1000 * perf.frameCount) / elapsed;
    const ft = perf.frameTimeSum / perf.frameCount;
    console.log(
      `[perf] action=${perf.action} reason=${reason} frames=${perf.frameCount} elapsed=${elapsed.toFixed(
        1
      )}ms fps=${fps.toFixed(1)} ft=${ft.toFixed(3)}ms`
    );
  }, []);

  const resetPerf = useCallback((actionName) => {
    perfRef.current = {
      action: actionName,
      frameCount: 0,
      frameTimeSum: 0,
      frameStartMark: 0,
      startTime: performance.now(),
      lastHudUpdate: 0,
      shouldLogMinute: true
    };

    setMetrics((prev) => ({
      ...prev,
      action: actionName,
      fps: 0,
      ft: 0
    }));
  }, [setMetrics]);

  useEffect(() => {
    scene.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [scene]);

  useEffect(() => {
    if (!names.length) {
      setStatus("Loaded model, but no animation clips were found");
      setClipNames([]);
      return;
    }

    const loadEnd = performance.now();
    const loadDuration = loadEnd - LOAD_REQUEST_TIME;

    console.log(
      `[load] start=${LOAD_REQUEST_TIME.toFixed(1)} end=${loadEnd.toFixed(1)} duration=${loadDuration.toFixed(
        1
      )}ms clips=${names.join(", ")}`
    );

    setClipNames(names);
    setStatus(`Clips: ${names.join(", ")}`);
    setMetrics((prev) => ({
      ...prev,
      loadStart: LOAD_REQUEST_TIME,
      loadEnd,
      loadDuration
    }));
  }, [names, setClipNames, setMetrics, setStatus]);

  useEffect(() => {
    if (!names.length) return;

    const nextActionName = actions[activeAction] ? activeAction : names[0];
    if (nextActionName !== activeAction) {
      setActiveAction(nextActionName);
      return;
    }

    if (perfRef.current.action && perfRef.current.action !== "-" && perfRef.current.action !== nextActionName) {
      logActionSummary("switch");
    }

    Object.values(actions).forEach((action) => {
      if (!action) return;
      action.stop();
      action.enabled = true;
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(1);
    });

    actions[nextActionName]?.reset().play();
    resetPerf(nextActionName);
    console.log(`[action] start name=${nextActionName} time=${perfRef.current.startTime.toFixed(1)}`);
  }, [actions, activeAction, logActionSummary, names, resetPerf, setActiveAction]);

  useEffect(() => {
    return () => {
      logActionSummary("unmount");
      Object.values(actions).forEach((action) => action?.stop());
    };
  }, [actions, logActionSummary]);

  useFrame(() => {
    const perf = perfRef.current;
    if (!perf.startTime) return;
    perf.frameStartMark = performance.now();
  });

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      const perf = perfRef.current;
      if (!perf.startTime) return;

      const now = performance.now();
      if (perf.frameStartMark > 0) {
        perf.frameTimeSum += Math.max(0, now - perf.frameStartMark);
      }

      perf.frameCount += 1;

      const elapsed = now - perf.startTime;
      if (elapsed <= 0) return;

      const fps = (1000 * perf.frameCount) / elapsed;
      const ft = perf.frameTimeSum / perf.frameCount;

      if (now - perf.lastHudUpdate > 250) {
        perf.lastHudUpdate = now;
        setMetrics((prev) => ({
          ...prev,
          action: perf.action,
          fps,
          ft
        }));
      }

      if (perf.frameCount % 300 === 0) {
        console.log(
          `[perf] action=${perf.action} frames=${perf.frameCount} elapsed=${elapsed.toFixed(1)}ms fps=${fps.toFixed(
            1
          )} ft=${ft.toFixed(3)}ms`
        );
      }

      if (perf.shouldLogMinute && elapsed >= 60000) {
        perf.shouldLogMinute = false;
        console.log(
          `[1min] action=${perf.action} elapsed=${elapsed.toFixed(1)}ms frames=${perf.frameCount} fps=${fps.toFixed(
            1
          )} ft=${ft.toFixed(3)}ms`
        );
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [setMetrics]);

  return (
    <group scale={scale}>
      <group position={offset}>
        <primitive object={scene} />
        {showSkeleton ? <primitive object={skeletonHelper} /> : null}
      </group>
    </group>
  );
}

export default function App() {
  const [status, setStatus] = useState("Loading model...");
  const [clipNames, setClipNames] = useState(DEFAULT_ACTIONS);
  const [activeAction, setActiveAction] = useState("Idle");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [metrics, setMetrics] = useState({
    action: "Idle",
    fps: 0,
    ft: 0,
    loadStart: LOAD_REQUEST_TIME,
    loadEnd: 0,
    loadDuration: 0
  });

  return (
    <div className="App">
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          color: "#fff",
          fontFamily: "monospace",
          fontSize: 13,
          background: "rgba(0,0,0,0.55)",
          padding: 8,
          borderRadius: 4,
          lineHeight: 1.6,
          zIndex: 10
        }}
      >
        <div>Skeletal Animation (React Three Fiber)</div>
        <div>{status}</div>
        <div>
          Action: {metrics.action} | fps: {metrics.fps.toFixed(1)} | ft: {metrics.ft.toFixed(3)} ms
        </div>
        <div>
          Load:{" "}
          {metrics.loadDuration > 0
            ? `${metrics.loadDuration.toFixed(1)} ms`
            : "waiting"}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          zIndex: 10
        }}
      >
        {clipNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setActiveAction(name)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
              borderRadius: 4,
              border: "1px solid #888",
              background: activeAction === name ? "rgba(80,160,255,0.7)" : "rgba(0,0,0,0.6)",
              color: "#fff"
            }}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowSkeleton((value) => !value)}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
            borderRadius: 4,
            border: "1px solid #888",
            background: showSkeleton ? "rgba(255,170,60,0.7)" : "rgba(0,0,0,0.6)",
            color: "#fff"
          }}
        >
          Skeleton
        </button>
      </div>

      <Canvas
        shadows
        camera={{ position: [1, 2, 5], fov: 45, near: 0.1, far: 100 }}
        onCreated={({ scene, camera }) => {
          scene.background = new THREE.Color(0x334455);
          scene.fog = new THREE.Fog(0x334455, 10, 50);
          camera.lookAt(0, 1, 0);
        }}
      >
        <hemisphereLight args={[0xffffff, 0x444444, 0.6]} position={[0, 20, 0]} />
        <directionalLight
          color={0xffffff}
          intensity={0.8}
          position={[5, 10, 5]}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshPhongMaterial color={0x556677} depthWrite={false} />
        </mesh>
        <gridHelper args={[20, 20, 0x445566, 0x334455]} />
        <Suspense fallback={null}>
          <Soldier
            activeAction={activeAction}
            showSkeleton={showSkeleton}
            setActiveAction={setActiveAction}
            setClipNames={setClipNames}
            setMetrics={setMetrics}
            setStatus={setStatus}
          />
        </Suspense>
        <OrbitControls target={[0, 1, 0]} />
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
