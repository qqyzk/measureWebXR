import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader,addAfterEffect } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Suspense,useEffect} from "react";
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import {DoubleSide} from 'three';
import ReactDOM from "react-dom";
let name = 'BoxTextured';
let N=2;
function getPositions(n){
  let minx,miny,minz,maxx,maxy,maxz;
  minx = -2.5; miny = -4; minz= -15;
  maxx = 2.5; maxy=5; maxz=-3;
 
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
    let objurl,mtlurl,scale;
    if(name==='Box'){
      objurl="./obj/Box/Box.obj";
      mtlurl="./obj/Box/Box.mtl";
      scale = 0.2;
    }else if(name==='BoxTextured' ){
      objurl="./obj/BoxTextured4/BoxTextured.obj";
      mtlurl="./obj/BoxTextured4/BoxTextured.mtl";
      scale=0.2;
    }else if(name==='BoomBox' ){
      objurl="./obj/BoomBox/BoomBox.obj";
      mtlurl="./obj/BoomBox/BoomBox.mtl";
      scale=10;
    }else if(name==='DamagedHelmet' ){
      objurl="./obj/DamagedHelmet/DamagedHelmet.obj";
      mtlurl="./obj/DamagedHelmet/DamagedHelmet.mtl";
      scale=0.2;
    }
    const materials = useLoader(MTLLoader, mtlurl,(loader)=>{
      loader.setMaterialOptions({side:DoubleSide});
    });
    const obj=useLoader(OBJLoader, objurl, (loader) => {
      materials.preload();
      loader.setMaterials(materials);
    });
    let objs=[];
    getPositions(N).map((item,key)=>{
      let res = <primitive object={obj.clone()} scale={scale}  position={[item.x,item.y,item.z]}/>;
      objs.push(res);
    })
    loaded=true;
    console.log('scene loaded',performance.now());
    return (
      <>
      {
        objs
      }
      </>
    );
  
};




let startFlag = true;
let frameCount = 0;
let startTime = null;
let shouldLog = true;
export default function App() {


  //react hook, 函数组件每一次更新都会触发effect
  //组件更新挂在完成->执行useLayoutEffect->浏览器dom绘制完成->执行useEffect回调
  useEffect(()=>{
    addAfterEffect(()=>{
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
  })

  const handleClick=()=>{
    console.log('click',performance.now());
    const rootElement = document.getElementById("root");
    ReactDOM.render( <div className="App">
    <Canvas>
    <Suspense fallback={null}>
        <ambientLight intensity={0.1} />
        <directionalLight color="white" position={[0, 0, 5]} />
        <Model />
        <OrbitControls />
      </Suspense>
    </Canvas>
  </div>, rootElement);
  }
 
  return (
    <div>
    <button type="button" onClick={handleClick}>
      Click Me
    </button>
  </div>
 
  );
}
