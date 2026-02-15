import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader,addAfterEffect } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useLayoutEffect, useState } from "react";
let name = 'BoxTextured';
let type = 'gltf';
let N=32;
const publicBaseUrl = process.env.PUBLIC_URL || '';
function getPositions(n){
  let minx,miny,minz,maxx,maxy,maxz;
  if(name==='Box'){
    minx = -2.5; miny = -4; minz= -15;
    maxx = 2.5; maxy=5; maxz=-3;
  }else if(name === 'BoxTextured'){
    minx = -2.5; miny = -4; minz= -15;
    maxx = 2.5; maxy=5; maxz=-3;
  } else if(name === 'BoomBox'){
    minx = -2.5; miny = -4; minz= -15;
    maxx = 2.5; maxy=5; maxz=-3;
  }else if(name === 'DamagedHelmet'){
    minx = -2.5; miny = -4; minz= -15;
    maxx = 2.5; maxy=5; maxz=-3;
  }
  let edgeNum=n;
  let positions = [];
  for(let i=0;i<edgeNum;++i){
      for(let j=0;j<edgeNum;++j){
          for(let k=0;k<edgeNum;++k){   
              let curx = minx + (maxx-minx)/(edgeNum-1)*i;
              let cury = miny+ (maxy-miny)/(edgeNum-1)*j;
              let curz = minz + (maxz-minz)/(edgeNum-1)*k;
              positions.push({'x':curx,'y':cury,'z':curz});
          }
      }
  }
  return positions;
}

let loaded=false;
const Model = () => {
    
    let url,scale;
    if(name==='Box' && type==='gltf'){
      url=`${publicBaseUrl}/gltf/Box/box.gltf`;
      scale = 0.2;
    }else if(name==='Box' && type==='glb'){
      url=`${publicBaseUrl}/gltf/Box/Box.glb`;
      scale=0.2;
    }else if(name==='BoxTextured' && type==='gltf'){
      url=`${publicBaseUrl}/gltf/BoxTextured4/BoxTextured.gltf`;
      scale = 0.2;
    }else if(name==='BoxTextured' && type==='glb'){
      url=`${publicBaseUrl}/gltf/BoxTextured/BoxTextured.glb`;
      scale=0.2;
    }else if(name==='BoomBox' && type==='gltf'){
      url=`${publicBaseUrl}/gltf/BoomBox/BoomBox.gltf`;
      scale = 10;
    }else if(name==='BoomBox' && type==='glb'){
      url=`${publicBaseUrl}/gltf/BoomBox/BoomBox.glb`;
      scale=10;
    }else if(name==='DamagedHelmet' && type==='gltf'){
      url=`${publicBaseUrl}/gltf/DamagedHelmet/DamagedHelmet.gltf`;
      scale = 0.2;
    }else if(name==='DamagedHelmet' && type==='glb'){
      url=`${publicBaseUrl}/gltf/DamagedHelmet/DamagedHelmet.glb`;
      scale=0.2;
    }
    const gltf=useLoader(GLTFLoader,url , (loader) => {
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath(`${publicBaseUrl}/decoder/`)
        loader.setDRACOLoader(dracoLoader)
    })

    const positions = useMemo(() => getPositions(N), []);
    const meshEntries = useMemo(() => {
      const entries = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          entries.push({
            geometry: child.geometry,
            material: child.material,
            baseMatrix: child.matrixWorld.clone()
          });
        }
      });
      return entries;
    }, [gltf]);

    const refs = useRef([]);
    useLayoutEffect(() => {
      const dummy = new THREE.Object3D();
      const tempMatrix = new THREE.Matrix4();

      for (let meshIdx = 0; meshIdx < meshEntries.length; meshIdx++) {
        const instanced = refs.current[meshIdx];
        if (!instanced) continue;
        const baseMatrix = meshEntries[meshIdx].baseMatrix;

        for (let i = 0; i < positions.length; i++) {
          const item = positions[i];
          dummy.position.set(item.x, item.y, item.z);
          dummy.scale.set(scale, scale, scale);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          tempMatrix.multiplyMatrices(dummy.matrix, baseMatrix);
          instanced.setMatrixAt(i, tempMatrix);
        }

        instanced.instanceMatrix.needsUpdate = true;
      }

      loaded=true;
      console.log('scene loaded',performance.now());
    }, [meshEntries, positions, scale]);

    return (
      <>
      {meshEntries.map((entry, key) => (
        <instancedMesh
          key={key}
          ref={(el) => { refs.current[key] = el; }}
          args={[entry.geometry, entry.material, positions.length]}
          frustumCulled={false}
        />
      ))}
      </>
    );
  
};




let startFlag = true;
let frameCount = 0;
let startTime = null;
let shouldLog = true;
export default function App() {

  const [started, setStarted] = useState(false);


  //react hook, 函数组件每一次更新都会触发effect
  //组件更新挂在完成->执行useLayoutEffect->浏览器dom绘制完成->执行useEffect回调
  useEffect(()=>{
    const unsubscribe = addAfterEffect(()=>{
      if (loaded){
          let time=performance.now();
          if (startFlag) {
              startTime = time;
              startFlag = false;
              console.log('startTime',startTime);
          }
          frameCount += 1;
          if(frameCount % 1000 === 0) {
              let fps = 1000 * frameCount / (time - startTime);
              console.log(frameCount,fps,'fps');
          } 
          if ((time - startTime) /1000 > 60 && shouldLog){
              shouldLog = false;
              let fps = 1000 * frameCount / (time - startTime);
              console.log('1min', (time - startTime)/1000, frameCount,fps,'fps');
          }
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [])
 
  const handleClick=()=>{
    console.log('click',performance.now());
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
