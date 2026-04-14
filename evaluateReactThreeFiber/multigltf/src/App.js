import "./styles.css";
import { Canvas, addAfterEffect, useFrame, useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useState } from "react";

let name = "Box";
let type = "gltf";
const params = new URLSearchParams(window.location.search);
const DEFAULT_N = 32;
const parsedN = Number.parseInt(params.get("n") || String(DEFAULT_N), 10);
let N = Number.isFinite(parsedN) && parsedN > 0 ? parsedN : DEFAULT_N;
const publicBaseUrl = process.env.PUBLIC_URL || "";

let loaded = false;
let loadLogged = false;
let frameStartMark = 0;
let clickTimeAbsMs = null;

let startFlag = true;
let frameCount = 0;
let startTime = null;
let shouldLog = true;
let frameSum = 0;

function getAbsoluteNow() {
  return performance.timeOrigin + performance.now();
}

function resetMetrics() {
  startFlag = true;
  frameCount = 0;
  startTime = null;
  shouldLog = true;
  frameSum = 0;
}

function getBounds() {
  return {
    minx: -0.5,
    miny: -0.8,
    minz: -20,
    maxx: 0.5,
    maxy: 0.8,
    maxz: -3
  };
}

function getPositions(edgeNum) {
  const { minx, miny, minz, maxx, maxy, maxz } = getBounds();
  const stepDenom = Math.max(1, edgeNum - 1);
  const positions = [];

  for (let i = 0; i < edgeNum; ++i) {
    for (let j = 0; j < edgeNum; ++j) {
      for (let k = 0; k < edgeNum; ++k) {
        positions.push({
          x: minx + ((maxx - minx) / stepDenom) * i,
          y: miny + ((maxy - miny) / stepDenom) * j,
          z: minz + ((maxz - minz) / stepDenom) * k
        });
      }
    }
  }

  return positions;
}

function getModelUrlAndScale() {
  if (name === "Box" && type === "gltf") {
    return { url: `${publicBaseUrl}/gltf/Box/box.gltf`, scale: 0.05 };
  }
  if (name === "Box" && type === "glb") {
    return { url: `${publicBaseUrl}/gltf/Box/Box.glb`, scale: 0.05 };
  }
  if (name === "BoxTextured" && type === "gltf") {
    return { url: `${publicBaseUrl}/gltf/BoxTextured4/BoxTextured.gltf`, scale: 0.05 };
  }
  if (name === "BoxTextured" && type === "glb") {
    return { url: `${publicBaseUrl}/gltf/BoxTextured/BoxTextured.glb`, scale: 0.05 };
  }
  if (name === "BoomBox" && type === "gltf") {
    return { url: `${publicBaseUrl}/gltf/BoomBox/BoomBox.gltf`, scale: 4 };
  }
  if (name === "BoomBox" && type === "glb") {
    return { url: `${publicBaseUrl}/gltf/BoomBox/BoomBox.glb`, scale: 4 };
  }
  if (name === "DamagedHelmet" && type === "gltf") {
    return { url: `${publicBaseUrl}/gltf/DamagedHelmet/DamagedHelmet.gltf`, scale: 0.05 };
  }
  return { url: `${publicBaseUrl}/gltf/DamagedHelmet/DamagedHelmet.glb`, scale: 0.05 };
}

function EnvironmentSetup() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);

    scene.environment = envTarget.texture;
    scene.background = new THREE.Color(0x000000);

    return () => {
      scene.environment = null;
      envTarget.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);

  return null;
}

function Model() {
  const { url, scale } = getModelUrlAndScale();
  const positions = useMemo(() => getPositions(N), []);
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
      console.log("scene loaded time", sceneLoadedTimeAbsMs);
      if (clickTimeAbsMs !== null) {
        console.log("load duration", sceneLoadedTimeAbsMs - clickTimeAbsMs, "ms");
      }
    }
  }, [gltf]);

  return (
    <>
      {positions.map((item, key) => (
        <primitive
          key={key}
          object={gltf.scene.clone()}
          scale={scale}
          position={[item.x, item.y, item.z]}
        />
      ))}
    </>
  );
}

function FrameStartProbe() {
  useFrame(() => {
    frameStartMark = performance.now();
  });
  return null;
}

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      if (!loaded) return;

      const time = performance.now();
      if (frameStartMark > 0) {
        frameSum += Math.max(0, time - frameStartMark);
      }

      if (startFlag) {
        startTime = time;
        startFlag = false;
        console.log("startTime", getAbsoluteNow());
      }

      frameCount += 1;
      if (frameCount % 1000 === 0) {
        const fps = (1000 * frameCount) / (time - startTime);
        const ft = frameSum / frameCount;
        console.log(frameCount, fps, "fps", ft, "ft");
      }

      if ((time - startTime) / 1000 > 60 && shouldLog) {
        shouldLog = false;
        const fps = (1000 * frameCount) / (time - startTime);
        const ft = frameSum / frameCount;
        console.log("1min", (time - startTime) / 1000, frameCount, fps, "fps", ft, "ft");
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleClick = () => {
    loaded = false;
    loadLogged = false;
    frameStartMark = 0;
    resetMetrics();
    clickTimeAbsMs = getAbsoluteNow();
    console.log("click time", clickTimeAbsMs);
    setStarted(true);
  };

  return (
    <div className="App">
      {!started ? (
        <button type="button" onClick={handleClick}>
          Click Me
        </button>
      ) : (
        <Canvas camera={{ position: [0, 0, 0], fov: 40, near: 1, far: 100 }}>
          <EnvironmentSetup />
          <Suspense fallback={null}>
            <FrameStartProbe />
            <Model />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
