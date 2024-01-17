// import * as THREE from '../../../build/three.module.js';
import * as THREE from '../node_modules/three/build/three.module.js';
import {GLTFLoader} from './myGLTFLoader.js';

let camera, scene, renderer, group;
let loaded;

let startFlag;
let frameCount;
let startTime;
let shouldLog;
let first;
let frameSum;

function init( canvas, width, height, pixelRatio, path ,cnt) {
    loaded = false;

    startFlag = true;
    frameCount = 0;
    startTime = null;
    shouldLog = true;
    first = true;
    frameSum=0;

	camera = new THREE.PerspectiveCamera( 40, width / height, 1, 1000 );
	camera.position.z = 200;

	scene = new THREE.Scene();
	scene.fog = new THREE.Fog( 0x444466, 100, 400 );
	scene.background = new THREE.Color( 0x444466 );

	group = new THREE.Group();
	scene.add( group );
    let addcube=false;
	
    if(addcube){
         //添加立方体
        const geometry2 = new THREE.BoxGeometry( 1, 1, 1 );//立方体对象，包含立方体中的顶点(vertices)和面(faces)
        // const material2 = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );//添加材质，让立方体有颜色
        const material2 = [
            new THREE.MeshBasicMaterial({ color: 0xff0000 }),
            new THREE.MeshBasicMaterial({ color: 0x0000ff }),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            new THREE.MeshBasicMaterial({ color: 0xff00ff }),
            new THREE.MeshBasicMaterial({ color: 0x00ffff }),
            new THREE.MeshBasicMaterial({ color: 0xffff00 })
        ];

        for ( let i = 0; i < cnt; i ++ ) {

            // const material = materials[ i % materials.length ];
            const mesh = new THREE.Mesh( geometry2, material2 );
            // const mesh = new THREE.Mesh( geometry, material );
            mesh.position.x = random() * 200/4 - 100/4;
            mesh.position.y = random() * 200/4 - 100/4;
            mesh.position.z = random() * 200/4 - 100/4;
            mesh.scale.setScalar( random() + 1 );
            group.add( mesh );
            

        }
    }else{
        let loader = new GLTFLoader();
        let name='Box';
        let url='../../gltf/Box/box.gltf';
        loader.load( url, function ( gltf ) {
            let minx = -0.5, miny = -0.8, minz= -20;
            let maxx = 0.5, maxy=0.8, maxz=-3;
            // let minx = -10, miny = -10, minz= -20;
            // let maxx = 10, maxy=10, maxz=10;
            let scale;
            if(name==="Box"){
                scale=0.05;
            }else if(name==='BoxTextured'){
                scale=0.05;
            }else if (name==='BoomBox'){
                scale=4;
            }else if(name==='DamagedHelmet'){
                scale=0.05;
            }

            for ( let i = 0; i < cnt; i ++ ) {

                const mesh = gltf.scene.clone();
                // const mesh = new THREE.Mesh( geometry, material );
                mesh.position.x = random() * 200/4 - 100/4;
                mesh.position.y = random() * 200/4 - 100/4;
                mesh.position.z = random() * 200/4 - 100/4;
                mesh.scale.setScalar( random() + 1 );
                group.add( mesh );
            }
            console.log('model loaded time',performance.now());
            loaded=true;
         
        });//load
       
    
    }//else
   
    loaded = true;

    renderer = new THREE.WebGLRenderer( { antialias: true, canvas: canvas } );
    renderer.setPixelRatio( pixelRatio );
    renderer.setSize( width, height, false );
    animate();


}


function animate() {
    let frameStart = performance.now();
	// group.rotation.x = Date.now() / 4000;
	// group.rotation.y = - Date.now() / 4000;
    if ( self.requestAnimationFrame ) {

		self.requestAnimationFrame( animate );

	} else {

		// Firefox

	}
    let time = performance.now();
	renderer.render( scene, camera );
    if (startFlag) {
        startTime = time;
        startFlag = false;
        console.log('startTime',startTime);
    }
   
    
    let frameEnd = performance.now();
    frameSum += frameEnd - frameStart;
    
    frameCount += 1;
    // console.log(frameCount)
    if(frameCount % 1000 === 0) {
        let fps = 1000 * frameCount / (time - startTime);
        let ft = frameSum/frameCount;
        console.log(frameCount,fps,'fps',ft,'ft');
    } 
    if ((time - startTime) /1000 > 60 && shouldLog){
        shouldLog = false;
        let fps = 1000 * frameCount / (time - startTime);
        let ft = frameSum/frameCount;
        console.log('1min', (time - startTime)/1000, frameCount,fps,'fps',ft,'ft');
    }
    
	

}

// PRNG

let seed = 1;

function random() {

	const x = Math.sin( seed ++ ) * 10000;

	return x - Math.floor( x );

}

export default init;
