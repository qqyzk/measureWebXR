import "./styles.css";
import { Canvas, addAfterEffect, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useState } from "react";

const params = new URLSearchParams(window.location.search);
const publicBaseUrl = process.env.PUBLIC_URL || "";
const MODEL_NAME = "Box";
const MODEL_TYPE = "gltf";
const DEFAULT_N = 8;
const parsedN = Number.parseInt(params.get("n") || String(DEFAULT_N), 10);
const EDGE_COUNT = Number.isFinite(parsedN) && parsedN > 0 ? parsedN : DEFAULT_N;
const SCENEGRAPH_DEPTH = 1;
const DEFAULT_SHADING_MODE = "phong";

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

function getModelUrlAndScale() {
  if (MODEL_NAME === "Box" && MODEL_TYPE === "gltf") {
    return { url: `${publicBaseUrl}/gltf/Box/box.gltf`, scale: 0.05 };
  }
  if (MODEL_NAME === "Box" && MODEL_TYPE === "glb") {
    return { url: `${publicBaseUrl}/gltf/Box/Box.glb`, scale: 0.05 };
  }
  if (MODEL_NAME === "BoxTextured" && MODEL_TYPE === "gltf") {
    return { url: `${publicBaseUrl}/gltf/BoxTextured4/BoxTextured.gltf`, scale: 0.05 };
  }
  if (MODEL_NAME === "BoxTextured" && MODEL_TYPE === "glb") {
    return { url: `${publicBaseUrl}/gltf/BoxTextured/BoxTextured.glb`, scale: 0.05 };
  }
  if (MODEL_NAME === "BoomBox" && MODEL_TYPE === "gltf") {
    return { url: `${publicBaseUrl}/gltf/BoomBox/BoomBox.gltf`, scale: 4 };
  }
  if (MODEL_NAME === "BoomBox" && MODEL_TYPE === "glb") {
    return { url: `${publicBaseUrl}/gltf/BoomBox/BoomBox.glb`, scale: 4 };
  }
  if (MODEL_NAME === "DamagedHelmet" && MODEL_TYPE === "gltf") {
    return { url: `${publicBaseUrl}/gltf/DamagedHelmet/DamagedHelmet.gltf`, scale: 0.05 };
  }
  return { url: `${publicBaseUrl}/gltf/DamagedHelmet/DamagedHelmet.glb`, scale: 0.05 };
}

function getPositions(edgeCount) {
  const minx = -0.5;
  const miny = -0.8;
  const minz = -20;
  const maxx = 0.5;
  const maxy = 0.8;
  const maxz = -3;
  const stepDenom = Math.max(1, edgeCount - 1);
  const positions = [];

  for (let i = 0; i < edgeCount; ++i) {
    for (let j = 0; j < edgeCount; ++j) {
      for (let k = 0; k < edgeCount; ++k) {
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

function convertMaterial(originalMaterial, mode, cache) {
  if (Array.isArray(originalMaterial)) {
    return originalMaterial.map((material) => convertSingleMaterial(material, mode, cache));
  }
  return convertSingleMaterial(originalMaterial, mode, cache);
}

function convertSingleMaterial(src, mode, cache) {
  if (mode === "gltf-original") {
    return src;
  }

  const cacheKey = `${mode}:${src.uuid}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let material;
  if (mode === "phong") {
    material = new THREE.MeshPhongMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null,
      normalMap: src.normalMap || null,
      normalScale: src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1),
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: src.emissiveMap || null,
      emissiveIntensity: src.emissiveIntensity !== undefined ? src.emissiveIntensity : 1,
      transparent: !!src.transparent,
      opacity: src.opacity !== undefined ? src.opacity : 1,
      side: src.side !== undefined ? src.side : THREE.FrontSide,
      alphaTest: src.alphaTest !== undefined ? src.alphaTest : 0
    });
    material.specular = new THREE.Color(0x555555);
    material.shininess = 35;
  } else {
    material = new THREE.MeshStandardMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null,
      normalMap: src.normalMap || null,
      normalScale: src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1),
      roughness: 0.4,
      metalness: 0.6,
      roughnessMap: src.roughnessMap || null,
      metalnessMap: src.metalnessMap || null,
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: src.emissiveMap || null,
      emissiveIntensity: src.emissiveIntensity !== undefined ? src.emissiveIntensity : 1,
      transparent: !!src.transparent,
      opacity: src.opacity !== undefined ? src.opacity : 1,
      side: src.side !== undefined ? src.side : THREE.FrontSide,
      alphaTest: src.alphaTest !== undefined ? src.alphaTest : 0
    });
  }

  material.skinning = !!src.skinning;
  material.morphTargets = !!src.morphTargets;
  material.morphNormals = !!src.morphNormals;
  material.needsUpdate = true;

  cache.set(cacheKey, material);
  return material;
}

function applyShadingToRoot(root, mode, cache) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.material = convertMaterial(node.material, mode, cache);
  });
}

function ModelInstances({ shadingMode }) {
  const { url, scale } = getModelUrlAndScale();
  const positions = useMemo(() => getPositions(EDGE_COUNT), []);
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(`${publicBaseUrl}/decoder/`);
    loader.setDRACOLoader(dracoLoader);
  });

  const models = useMemo(() => {
    const cache = new Map();
    return positions.map((pos) => {
      const model = gltf.scene.clone(true);
      applyShadingToRoot(model, shadingMode, cache);
      model.position.set(pos.x, pos.y, pos.z);
      model.scale.set(scale, scale, scale);
      return model;
    });
  }, [gltf, positions, scale, shadingMode]);

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
  }, [models]);

  return (
    <>
      {models.map((model, index) => (
        <primitive key={`${shadingMode}-${index}`} object={model} />
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

function LightingRig({ mode }) {
  const { gl, scene } = useThree();
  const envTexture = useMemo(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const texture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();
    return texture;
  }, [gl]);

  useEffect(() => {
    scene.environment = mode === "env" ? envTexture : null;
    return () => {
      scene.environment = null;
    };
  }, [envTexture, mode, scene]);

  if (mode === "env") {
    return (
      <>
        <ambientLight color={0xffffff} intensity={0.28} />
        <directionalLight color={0xffffff} intensity={1} position={[2, 5, 4]} castShadow />
      </>
    );
  }

  if (mode === "ambient-directional") {
    return (
      <>
        <ambientLight color={0xffffff} intensity={0.45} />
        <directionalLight color={0xffffff} intensity={1.8} position={[2, 5, 4]} castShadow />
      </>
    );
  }

  if (mode === "hemisphere-directional") {
    return (
      <>
        <hemisphereLight args={[0xffffff, 0x223344, 0.7]} />
        <directionalLight color={0xffffff} intensity={1.4} position={[3, 6, 4]} castShadow />
      </>
    );
  }

  if (mode === "point") {
    return (
      <>
        <ambientLight color={0xffffff} intensity={0.2} />
        <pointLight color={0xffffff} intensity={30} distance={80} position={[0, 3, -6]} castShadow />
      </>
    );
  }

  return (
    <>
      <ambientLight color={0xffffff} intensity={0.15} />
      <spotLight color={0xffffff} intensity={40} distance={120} angle={Math.PI / 6} penumbra={0.35} position={[0, 6, -6]} castShadow />
    </>
  );
}

export default function AppLighting() {
  const [started, setStarted] = useState(false);
  const [lightMode, setLightMode] = useState("env");
  const [shadingMode, setShadingMode] = useState(DEFAULT_SHADING_MODE);

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
        console.log("startTime", getAbsoluteNow(), "light:", lightMode, "n:", EDGE_COUNT, "depth:", SCENEGRAPH_DEPTH, "shading:", shadingMode);
      }

      frameCount += 1;
      if (frameCount % 1000 === 0) {
        const fps = (1000 * frameCount) / (time - startTime);
        const ft = frameSum / frameCount;
        console.log("light:", lightMode, "n:", EDGE_COUNT, "depth:", SCENEGRAPH_DEPTH, "shading:", shadingMode, frameCount, fps.toFixed(1), "fps", ft, "ft");
      }

      if ((time - startTime) / 1000 > 60 && shouldLog) {
        shouldLog = false;
        const fps = (1000 * frameCount) / (time - startTime);
        const ft = frameSum / frameCount;
        console.log("1min", "light:", lightMode, "n:", EDGE_COUNT, "depth:", SCENEGRAPH_DEPTH, "shading:", shadingMode, (time - startTime) / 1000, frameCount, fps.toFixed(1), "fps", ft, "ft");
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [lightMode, shadingMode]);

  const handleStart = () => {
    loaded = false;
    loadLogged = false;
    frameStartMark = 0;
    resetMetrics();
    clickTimeAbsMs = getAbsoluteNow();
    console.log("click time", clickTimeAbsMs);
    setStarted(true);
  };

  const handleLightModeChange = (event) => {
    const nextMode = event.target.value;
    setLightMode(nextMode);
    if (loaded) {
      resetMetrics();
    }
    console.log("lighting mode switched:", nextMode);
  };

  const handleShadingModeChange = (event) => {
    const nextMode = event.target.value;
    setShadingMode(nextMode);
    if (loaded) {
      resetMetrics();
    }
    console.log("shading mode switched:", nextMode);
  };

  return (
    <div className="App">
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          color: "#fff",
          background: "rgba(0,0,0,0.65)",
          padding: 10,
          borderRadius: 6,
          fontFamily: "monospace"
        }}
      >
        <div>
          N: {EDGE_COUNT} Depth: {SCENEGRAPH_DEPTH}
        </div>
        {!started && (
          <button type="button" onClick={handleStart}>
            start
          </button>
        )}{" "}
        <label htmlFor="light-mode">light mode:</label>{" "}
        <select id="light-mode" value={lightMode} onChange={handleLightModeChange}>
          <option value="env">env(RoomEnvironment)</option>
          <option value="ambient-directional">ambient + directional</option>
          <option value="hemisphere-directional">hemisphere + directional</option>
          <option value="point">point</option>
          <option value="spot">spot</option>
        </select>{" "}
        <label htmlFor="shading-mode">shading:</label>{" "}
        <select id="shading-mode" value={shadingMode} onChange={handleShadingModeChange}>
          <option value="gltf-original">gltf-original</option>
          <option value="phong">phong</option>
          <option value="pbr">pbr(forced)</option>
        </select>
      </div>

      {started && (
        <Canvas shadows camera={{ position: [0, 0, 0], fov: 40, near: 1, far: 100 }}>
          <color attach="background" args={["#000000"]} />
          <FrameStartProbe />
          <LightingRig mode={lightMode} />
          <Suspense fallback={null}>
            <ModelInstances shadingMode={shadingMode} />
          </Suspense>
          <OrbitControls />
        </Canvas>
      )}
    </div>
  );
}
