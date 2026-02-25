import "./styles.css";
import { Canvas } from "@react-three/fiber";
import { useLoader, addAfterEffect } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { Suspense, useEffect } from "react";
import ReactDOM from "react-dom";

const modelName = 'Duck'; //  'Duck', 'SheenChair', 'ToyCar'
const modelMap = {
    'Duck': { fileName: 'Duck.gltf', scale: 1 },
    'SheenChair': { fileName: 'SheenChair.gltf', scale: 5 },
    'ToyCar': { fileName: 'ToyCar.gltf', scale: 50 }
};

let N = 2; 

function getPositions(n) {
    let minx, miny, minz, maxx, maxy, maxz;
    
    minx = -2.5;
    miny = -4;
    minz = -15;
    maxx = 2.5;
    maxy = 5;
    maxz = -3;
    
    let edgeNum = n;
    let positions = [];
    
    for (let i = 0; i < edgeNum; ++i) {
        for (let j = 0; j < edgeNum; ++j) {
            for (let k = 0; k < edgeNum; ++k) {
                let curx = minx + (maxx - minx) / (edgeNum - 1) * i;
                let cury = miny + (maxy - miny) / (edgeNum - 1) * j;
                let curz = minz + (maxz - minz) / (edgeNum - 1) * k;
                positions.push({ 'x': curx, 'y': cury, 'z': curz });
            }
        }
    }
    
    return positions;
}

let loaded = false;

const Model = () => {
    const modelConfig = modelMap[modelName];
    if (!modelConfig) {
        console.error('Model not found:', modelName);
        return null;
    }

    const url = `./gltf/${modelName}/${modelConfig.fileName}`;
    console.log('Loading model from:', url);

    const gltf = useLoader(GLTFLoader, url, (loader) => {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./decoder/');
        loader.setDRACOLoader(dracoLoader);
    });

    let objs = [];
    getPositions(N).map((item, key) => {
        let res = <primitive key={key} object={gltf.scene.clone()} scale={modelConfig.scale} position={[item.x, item.y, item.z]} />;
        objs.push(res);
    });

    loaded = true;
    console.log('scene loaded', performance.now());

    return (
        <>
            {objs}
        </>
    );
};

let startFlag = true;
let frameCount = 0;
let startTime = null;
let shouldLog = true;
let frameSum = 0;
export default function App() {
    useEffect(() => {
        addAfterEffect(() => {
            if (loaded) {
                let frameStart = performance.now();
                let time = performance.now();
                
                if (startFlag) {
                    startTime = time;
                    startFlag = false;
                    console.log('startTime', startTime);
                }
                
                frameCount += 1;
                frameSum += performance.now() - frameStart;
                
                if (frameCount % 1000 === 0) {
                    let fps = 1000 * frameCount / (time - startTime);
                    let ft = frameSum / frameCount;
                    console.log(frameCount, fps, 'fps', ft, 'ft');
                }
                
                if ((time - startTime) / 1000 > 60 && shouldLog) {
                    shouldLog = false;
                    let fps = 1000 * frameCount / (time - startTime);
                    let ft = frameSum / frameCount;
                    console.log('1min', (time - startTime) / 1000, frameCount, fps, 'fps', ft, 'ft');
                }
            }
        });
    });

    const handleClick = () => {
        console.log('click time', performance.now());
        loaded = false;
        startFlag = true;
        frameCount = 0;
        startTime = null;
        shouldLog = true;
        frameSum = 0;

        const rootElement = document.getElementById("root");
        ReactDOM.render(
            <div className="App">
                <Canvas>
                    <color attach="background" args={['#000000']} />
                    <Suspense fallback={null}>
                        <ambientLight intensity={0.1} />
                        <directionalLight color="white" position={[0, 0, 5]} />
                        <Model />
                        <OrbitControls />
                    </Suspense>
                </Canvas>
            </div>,
            rootElement
        );
    };

    return (
        <div>
            <button type="button" onClick={handleClick}>
                Start
            </button>
        </div>
    );
}
