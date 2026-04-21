import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader, addAfterEffect } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import { Suspense, useEffect, useState } from "react";

let name = 'Box';
let type = 'gltf';
let N = 16;
const DURATION = 600;
const WINDOW = 10;

const publicBaseUrl = process.env.PUBLIC_URL || '';

let loaded = false;
const Model = () => {
    let url, scale;
    if(name==='Box' && type==='gltf'){
      url=`${publicBaseUrl}/gltf/Box/box.gltf`;
      scale = 0.2;
    }else if(name==='BoxTextured' && type==='gltf'){
      url=`${publicBaseUrl}/gltf/BoxTextured4/BoxTextured.gltf`;
      scale = 0.2;
    }
    const gltf = useLoader(GLTFLoader, url, (loader) => {
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath(`${publicBaseUrl}/decoder/`)
        loader.setDRACOLoader(dracoLoader)
    })

    const edgeNum = N;
    let minx = -2.5, miny = -4, minz = -15;
    let maxx = 2.5, maxy = 5, maxz = -3;

    useEffect(() => {
      loaded = true;
      console.log('scene loaded', performance.now());
    }, [gltf]);

    let objs = [];
    for(let i=0;i<edgeNum;++i){
        for(let j=0;j<edgeNum;++j){
            for(let k=0;k<edgeNum;++k){
                let curx = minx + (maxx-minx)/(edgeNum-1)*i;
                let cury = miny + (maxy-miny)/(edgeNum-1)*j;
                let curz = minz + (maxz-minz)/(edgeNum-1)*k;
                objs.push(
                  <primitive key={`${i}-${j}-${k}`} object={gltf.scene.clone()} scale={scale} position={[curx, cury, curz]}/>
                );
            }
        }
    }
    return <>{objs}</>;
};

let startFlag = true;
let startTime = null;
let windowFrameSum = 0;
let windowFrameCount = 0;
let windowStartTime = null;
let lastFrameTime = null;
let results = [];
let finished = false;

export default function AppSustained() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      if (!loaded || finished) return;

      let now = performance.now();

      if (startFlag) {
        startTime = now;
        windowStartTime = now;
        lastFrameTime = now;
        startFlag = false;
        console.log('startTime', startTime);
        return;
      }

      let frametime = now - lastFrameTime;
      lastFrameTime = now;

      windowFrameSum += frametime;
      windowFrameCount += 1;

      let elapsed = (now - startTime) / 1000;
      let windowElapsed = (now - windowStartTime) / 1000;

      if (windowElapsed >= WINDOW) {
        let avgFt = windowFrameSum / windowFrameCount;
        let windowFps = 1000 * windowFrameCount / (now - windowStartTime);
        let entry = {t: Math.round(elapsed), ft: parseFloat(avgFt.toFixed(2)), fps: parseFloat(windowFps.toFixed(1)), frames: windowFrameCount};
        results.push(entry);
        console.log('window', entry.t + 's', 'ft=' + entry.ft + 'ms', 'fps=' + entry.fps, 'frames=' + entry.frames);

        windowFrameSum = 0;
        windowFrameCount = 0;
        windowStartTime = now;
      }

      if (elapsed >= DURATION) {
        finished = true;
        console.log('=== RESULTS ===');
        console.log(JSON.stringify(results));
        console.log('=== END ===');
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleClick = () => {
    console.log('click', performance.now());
    setStarted(true);
  }

  return (
    <div className="App">
      {!started ? (
        <button type="button" onClick={handleClick}>
          Click Me
        </button>
      ) : (
        <Canvas>
          <color attach="background" args={['#000000']} />
          <Suspense fallback={null}>
            <ambientLight intensity={0.1} />
            <directionalLight color="white" position={[0, 0, 5]} />
            <Model />
            <OrbitControls />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
