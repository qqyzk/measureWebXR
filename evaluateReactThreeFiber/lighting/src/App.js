import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader,addAfterEffect, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useState } from "react";
let name = 'Box';
let type = 'gltf';
const params = new URLSearchParams(window.location.search);
const MODE = params.get('mode') || 'flat'; // 'flat' | 'scenegraph'
const LEVELS = Number(params.get('levels') || 4);
const parsedN = Number.parseInt(params.get('n') || '32', 10);
let N = Number.isFinite(parsedN) && parsedN > 0 ? parsedN : 32;
const publicBaseUrl = process.env.PUBLIC_URL || '';

function getAbsoluteNow() {
  return performance.timeOrigin + performance.now();
}
function getBounds(){
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
  return { minx, miny, minz, maxx, maxy, maxz };
}

function getPositions(n){
  const { minx, miny, minz, maxx, maxy, maxz } = getBounds();
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
let loadLogged = false;
let frameStartMark = 0;
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

    const edgeNum = N;
    const { minx, miny, minz, maxx, maxy, maxz } = getBounds();
    const levels = Math.max(1, Math.floor(Number.isFinite(LEVELS) ? LEVELS : 1));

    const sceneGraphRoot = useMemo(() => {
      if (MODE !== 'scenegraph') return null;

      const rootForModels = new THREE.Group();
      rootForModels.name = `SG_root_L${levels}`;

      const groupCache = new Map(); // pathKey -> THREE.Group

      function getOrCreateLeafParent(i, j, k, edgeNum) {
        if (levels === 1) return rootForModels;

        let x0 = 0, x1 = edgeNum - 1;
        let y0 = 0, y1 = edgeNum - 1;
        let z0 = 0, z1 = edgeNum - 1;

        let parent = rootForModels;
        let pathKey = '';

        for (let level = 0; level < levels - 1; level++) {
          const mx = (x0 + x1) >> 1;
          const my = (y0 + y1) >> 1;
          const mz = (z0 + z1) >> 1;

          const bx = (i > mx) ? 1 : 0;
          const by = (j > my) ? 1 : 0;
          const bz = (k > mz) ? 1 : 0;

          const oct = (bx << 2) | (by << 1) | bz;
          pathKey += (level === 0) ? String(oct) : `/${oct}`;

          let grp = groupCache.get(pathKey);
          if (!grp) {
            grp = new THREE.Group();
            grp.name = `SG_L${level + 1}_O${oct}`;
            groupCache.set(pathKey, grp);
            parent.add(grp);
          }
          parent = grp;

          if (bx === 0) x1 = mx; else x0 = mx + 1;
          if (by === 0) y1 = my; else y0 = my + 1;
          if (bz === 0) z1 = mz; else z0 = mz + 1;
        }

        return parent;
      }

      for(let i=0;i<edgeNum;++i){
        for(let j=0;j<edgeNum;++j){
          for(let k=0;k<edgeNum;++k){
            let curx = minx + (maxx-minx)/(edgeNum-1)*i;
            let cury = miny+ (maxy-miny)/(edgeNum-1)*j;
            let curz = minz + (maxz-minz)/(edgeNum-1)*k;

            const model = gltf.scene.clone();
            model.position.set(curx, cury, curz);
            model.scale.set(scale, scale, scale);
            const leafParent = getOrCreateLeafParent(i, j, k, edgeNum);
            leafParent.add(model);
          }
        }
      }

      return rootForModels;
    }, [gltf, edgeNum, levels, maxx, maxy, maxz, minx, miny, minz, scale]);

    useEffect(() => {
      loaded=true;
      if (!loadLogged) {
        loadLogged = true;
        console.log('model loaded time', getAbsoluteNow());
      }
    }, [sceneGraphRoot]);
    
    let objs=[]
    if (MODE !== 'scenegraph') {
      getPositions(edgeNum).forEach((item,key)=>{
        let res = <primitive key={key} object={gltf.scene.clone()} scale={scale}  position={[item.x,item.y,item.z]}/>;
        objs.push(res);
      })
    }
    return (
      <>
      {
        (MODE === 'scenegraph') ? <primitive object={sceneGraphRoot} /> : objs
      }
      </>
    );
   
};

function FrameStartProbe() {
  useFrame(() => {
    frameStartMark = performance.now();
  });
  return null;
}




let startFlag = true;
let frameCount = 0;
let startTime = null;
let shouldLog = true;
let frameSum = 0;
export default function App() {

  const [started, setStarted] = useState(false);


  //react hook, 函数组件每一次更新都会触发effect
  //组件更新挂在完成->执行useLayoutEffect->浏览器dom绘制完成->执行useEffect回调
  useEffect(()=>{
    const unsubscribe = addAfterEffect(()=>{
      if (loaded){
          let time=performance.now();
        if (frameStartMark > 0) {
          frameSum += Math.max(0, time - frameStartMark);
        }
          if (startFlag) {
              startTime = time;
              startFlag = false;
          console.log('startTime', getAbsoluteNow());
          }
          frameCount += 1;
          if(frameCount % 1000 === 0) {
              let fps = 1000 * frameCount / (time - startTime);
          let ft = frameSum / frameCount;
          console.log(frameCount,fps,'fps',ft,'ft');
          } 
          if ((time - startTime) /1000 > 60 && shouldLog){
              shouldLog = false;
              let fps = 1000 * frameCount / (time - startTime);
          let ft = frameSum / frameCount;
          console.log('1min', (time - startTime)/1000, frameCount,fps,'fps',ft,'ft');
          }
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [])
 
  const handleClick=()=>{
    console.log('click time', getAbsoluteNow());
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
            <FrameStartProbe />
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
