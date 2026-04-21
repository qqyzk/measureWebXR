import "./App.css";
import { Canvas } from "@react-three/fiber";
import { useLoader, addAfterEffect } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import { Suspense, useEffect, useState } from "react";

const params = new URLSearchParams(window.location.search);
const texSize = params.get('texSize') || '2048';
const N = 8; // 8^3 = 512 models

const publicBaseUrl = process.env.PUBLIC_URL || '';

let loaded = false;
const Model = () => {
    let url, scale;
    if (texSize === '2048') {
        url = `${publicBaseUrl}/gltf/BoxTextured4/BoxTextured.gltf`;
    } else {
        url = `${publicBaseUrl}/gltf/BoxTextured4_${texSize}/BoxTextured.gltf`;
    }
    scale = 0.2;
    console.log('Loading texture size:', texSize, 'URL:', url);

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
let frameCount = 0;
let startTime = null;
let shouldLog = true;

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const unsubscribe = addAfterEffect(() => {
      if (loaded){
          let time = performance.now();
          if (startFlag) {
              startTime = time;
              startFlag = false;
              console.log('startTime', startTime);
          }
          frameCount += 1;
          if(frameCount % 1000 === 0) {
              let fps = 1000 * frameCount / (time - startTime);
              console.log(frameCount, fps, 'fps');
          }
          if ((time - startTime) /1000 > 60 && shouldLog){
              shouldLog = false;
              let fps = 1000 * frameCount / (time - startTime);
              console.log('1min', (time - startTime)/1000, frameCount, fps, 'fps');
          }
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [])

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
