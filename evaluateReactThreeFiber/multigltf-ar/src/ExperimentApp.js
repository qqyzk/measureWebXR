import "./webxr-experiment-shell.css";
import { Canvas, useLoader, addAfterEffect, addEffect } from "@react-three/fiber";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { XR, startSession, stopSession, useXR } from "@react-three/xr";

let name = "BoxTextured";
let type = "gltf";
let N = 32;

function getPositions(n) {
  const minx = -1.2, miny = -2, minz = -15;
  const maxx = 1.2, maxy = 2, maxz = -5;
  const edgeNum = n;
  const positions = [];
  for (let i = 0; i < edgeNum; i++) {
    for (let j = 0; j < edgeNum; j++) {
      for (let k = 0; k < edgeNum; k++) {
        const curx = minx + (maxx - minx) / (edgeNum - 1) * i;
        const cury = miny + (maxy - miny) / (edgeNum - 1) * j;
        const curz = minz + (maxz - minz) / (edgeNum - 1) * k;
        positions.push({ x: curx, y: cury, z: curz });
      }
    }
  }
  return positions;
}

let loaded = false;
function Model() {
  let url, scale;
  if (name === "BoxTextured" && type === "gltf") {
    url = "./gltf/BoxTextured4/BoxTextured.gltf";
    scale = 0.2;
  } else {
    url = "./gltf/BoxTextured4/BoxTextured.gltf";
    scale = 0.2;
  }
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("./decoder/");
    loader.setDRACOLoader(dracoLoader);
  });
  const objs = [];
  getPositions(N).forEach((item) => {
    objs.push(
      <primitive object={gltf.scene.clone()} scale={scale} position={[item.x, item.y, item.z]} key={item.x + "," + item.y + "," + item.z} />
    );
  });
  loaded = true;
  console.log("scene loaded", performance.now());
  return <>{objs}</>;
}

function optionalFeaturesFromFlags(f) {
  const list = ["dom-overlay"];
  if (f.hitTest) list.push("hit-test");
  if (f.anchors) list.push("anchors");
  if (f.planeDetection) list.push("plane-detection");
  if (f.lightEstimation) list.push("light-estimation");
  if (f.objectTracking) list.push("object-tracking");
  return list;
}

function RunStateSync({ onRunning }) {
  const session = useXR((s) => s.session);
  useEffect(() => {
    onRunning(!!session);
  }, [session, onRunning]);
  return null;
}

let startFlag = true;
let frameCount = 0;
let startTime = null;
let shouldLog = true;
let frameSum = 0;
let frameStart;

function FpsMeter() {
  useEffect(() => {
    addEffect(() => {
      frameStart = performance.now();
    });
    addAfterEffect(() => {
      if (!loaded) return;
      const time = performance.now();
      frameSum += time - frameStart;
      if (startFlag) {
        startTime = time;
        startFlag = false;
        console.log("startTime", startTime);
      }
      frameCount += 1;
      if (frameCount % 1000 === 0) {
        const fps = 1000 * frameCount / (time - startTime);
        const ft = frameSum / frameCount;
        console.log(frameCount, fps, "fps", ft, "ft");
      }
      if ((time - startTime) / 1000 > 60 && shouldLog) {
        shouldLog = false;
        console.log("1min", (time - startTime) / 1000, frameCount);
      }
    });
  }, []);
  return null;
}

export default function ExperimentApp() {
  const overlayRef = useRef(null);
  const statsMountRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [flags, setFlags] = useState({
    hitTest: true,
    anchors: false,
    planeDetection: false,
    lightEstimation: false,
    objectTracking: false,
  });

  const onRunning = useCallback((v) => {
    const dock = document.getElementById("glass-dock");
    if (dock) dock.classList.toggle("running", v);
    setRunning(v);
  }, []);

  useEffect(() => {
    const stats = new Stats();
    stats.dom.style.position = "relative";
    stats.dom.style.top = "8px";
    stats.dom.style.left = "8px";
    if (statsMountRef.current) statsMountRef.current.appendChild(stats.dom);
    let alive = true;
    const loop = () => {
      if (!alive) return;
      stats.update();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (k) => (e) => {
    if (running) return;
    setFlags((f) => ({ ...f, [k]: e.target.checked }));
  };

  const onRunClick = async () => {
    if (running) {
      await stopSession();
      return;
    }
    const root = overlayRef.current;
    const sessionInit = {
      optionalFeatures: optionalFeaturesFromFlags(flags),
      domOverlay: root ? { root } : undefined,
    };
    try {
      await startSession("immersive-ar", sessionInit);
    } catch (e) {
      console.error(e);
      alert("启动失败: " + (e && e.message));
    }
  };

  return (
    <div className="App" style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div id="xr-canvas-host" style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <Canvas>
          <XR referenceSpace="local-floor">
            <RunStateSync onRunning={onRunning} />
            <FpsMeter />
            <Suspense fallback={null}>
              <ambientLight intensity={0.1} />
              <directionalLight color="white" position={[0, 0, 5]} />
              <Model />
            </Suspense>
          </XR>
        </Canvas>
      </div>
      <div ref={overlayRef} id="dom-overlay-root">
        <div className="stats-wrap" ref={statsMountRef} />
        <div className="glass-dock" id="glass-dock">
          <div className="glass-dock-inner">
            <div className="toggle-row">
              <span className="dock-title">R3F</span>
              <label className="chk">
                <input type="checkbox" checked={flags.hitTest} onChange={toggle("hitTest")} /> Hit test
              </label>
              <label className="chk">
                <input type="checkbox" checked={flags.anchors} onChange={toggle("anchors")} /> Anchors
              </label>
              <label className="chk">
                <input type="checkbox" checked={flags.planeDetection} onChange={toggle("planeDetection")} /> Plane
              </label>
              <label className="chk">
                <input type="checkbox" checked={flags.lightEstimation} onChange={toggle("lightEstimation")} /> Light est.
              </label>
              <label className="chk">
                <input type="checkbox" checked={flags.objectTracking} onChange={toggle("objectTracking")} /> Object tr.
              </label>
            </div>
            <div className="run-btn-wrap">
              <button type="button" className="run-btn" onClick={onRunClick}>
                <span className="run-btn-spinner" aria-hidden="true"></span>
                <span className="run-btn-label">{running ? "STOP" : "RUN"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
