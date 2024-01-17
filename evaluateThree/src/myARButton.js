var Stats = function () {

    var mode = 0;

    var container = document.createElement( 'div' );
    container.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
    container.addEventListener( 'click', function ( event ) {

        event.preventDefault();
        showPanel( ++ mode % container.children.length );

    }, false );

    //

    function addPanel( panel ) {

        container.appendChild( panel.dom );
        return panel;

    }

    function showPanel( id ) {

        for ( var i = 0; i < container.children.length; i ++ ) {

            container.children[ i ].style.display = i === id ? 'block' : 'none';

        }

        mode = id;

    }

    //

    var beginTime = ( performance || Date ).now(), prevTime = beginTime, frames = 0;

    var fpsPanel = addPanel( new Stats.Panel( 'FPS', '#0ff', '#002' ) );
    var msPanel = addPanel( new Stats.Panel( 'MS', '#0f0', '#020' ) );

    if ( self.performance && self.performance.memory ) {

        var memPanel = addPanel( new Stats.Panel( 'MB', '#f08', '#201' ) );

    }

    showPanel( 0 );

    return {

        REVISION: 16,

        dom: container,

        addPanel: addPanel,
        showPanel: showPanel,

        begin: function () {

            beginTime = ( performance || Date ).now();

        },

        end: function () {

            frames ++;

            var time = ( performance || Date ).now();

            msPanel.update( time - beginTime, 200 );

            if ( time >= prevTime + 1000 ) {

                fpsPanel.update( ( frames * 1000 ) / ( time - prevTime ), 100 );

                prevTime = time;
                frames = 0;

                if ( memPanel ) {

                    var memory = performance.memory;
                    memPanel.update( memory.usedJSHeapSize / 1048576, memory.jsHeapSizeLimit / 1048576 );

                }

            }

            return time;

        },

        update: function () {

            beginTime = this.end();

        },

        // Backwards Compatibility

        domElement: container,
        setMode: showPanel

    };

};

Stats.Panel = function ( name, fg, bg ) {

    var min = Infinity, max = 0, round = Math.round;
    var PR = round( window.devicePixelRatio || 1 );

    var WIDTH = 80 * PR, HEIGHT = 48 * PR,
        TEXT_X = 3 * PR, TEXT_Y = 2 * PR,
        GRAPH_X = 3 * PR, GRAPH_Y = 15 * PR,
        GRAPH_WIDTH = 74 * PR, GRAPH_HEIGHT = 30 * PR;

    var canvas = document.createElement( 'canvas' );
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.cssText = 'width:80px;height:48px';

    var context = canvas.getContext( '2d' );
    context.font = 'bold ' + ( 9 * PR ) + 'px Helvetica,Arial,sans-serif';
    context.textBaseline = 'top';

    context.fillStyle = bg;
    context.fillRect( 0, 0, WIDTH, HEIGHT );

    context.fillStyle = fg;
    context.fillText( name, TEXT_X, TEXT_Y );
    context.fillRect( GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT );

    context.fillStyle = bg;
    context.globalAlpha = 0.9;
    context.fillRect( GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT );

    return {

        dom: canvas,

        update: function ( value, maxValue ) {

            min = Math.min( min, value );
            max = Math.max( max, value );

            context.fillStyle = bg;
            context.globalAlpha = 1;
            context.fillRect( 0, 0, WIDTH, GRAPH_Y );
            context.fillStyle = fg;
            context.fillText( round( value ) + ' ' + name + ' (' + round( min ) + '-' + round( max ) + ')', TEXT_X, TEXT_Y );

            context.drawImage( canvas, GRAPH_X + PR, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT, GRAPH_X, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT );

            context.fillRect( GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, GRAPH_HEIGHT );

            context.fillStyle = bg;
            context.globalAlpha = 0.9;
            context.fillRect( GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, round( ( 1 - ( value / maxValue ) ) * GRAPH_HEIGHT ) );

        }

    };

};

class myARButton {
  
   
	static createButton( renderer, sessionInit = {} ) {
        //创建button
		const button = document.createElement( 'button' );
        const buttonStats = new Stats();
        //支持immersive-ar
		function showStartAR( /*device*/ ) {
            //如果没有要求domOverlay，添加上
			if ( sessionInit.domOverlay === undefined ) {

				const overlay = document.createElement( 'div' );
				
				document.body.appendChild( overlay );
                buttonStats.dom.style.top = '40px';
                buttonStats.dom.style.left = '20px';
                overlay.appendChild(buttonStats.dom);

				const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
				svg.setAttribute( 'width', 38 );
				svg.setAttribute( 'height', 38 );
				svg.style.position = 'absolute';
				svg.style.right = '20px';
				svg.style.top = '20px';
				svg.addEventListener( 'click', function () {

					currentSession.end();

				} );
				overlay.appendChild( svg );
                
				const path = document.createElementNS( 'http://www.w3.org/2000/svg', 'path' );
				path.setAttribute( 'd', 'M 12,12 L 28,28 M 28,12 12,28' );
				path.setAttribute( 'stroke', '#fff' );
				path.setAttribute( 'stroke-width', 2 );
				svg.appendChild( path );

               
				if ( sessionInit.optionalFeatures === undefined ) {

					sessionInit.optionalFeatures = [];

				}

				sessionInit.optionalFeatures.push( 'dom-overlay' );
				sessionInit.domOverlay = { root: overlay };

			}

			//

			let currentSession = null;
            //在sesion开启时，设置render.xr的Spacetype
			async function onSessionStarted( session ) {

				session.addEventListener( 'end', onSessionEnded );

				renderer.xr.setReferenceSpaceType( 'local' );

				await renderer.xr.setSession( session );

				button.textContent = 'STOP AR';
               
				sessionInit.domOverlay.root.style.display = '';
              
				currentSession = session;

			}
            //在session结束时
			function onSessionEnded( /*event*/ ) {

				currentSession.removeEventListener( 'end', onSessionEnded );

				button.textContent = 'START AR';
				sessionInit.domOverlay.root.style.display = 'none';

				currentSession = null;

			}

			
            //button样式
			button.style.display = '';

			button.style.cursor = 'pointer';
			button.style.left = 'calc(50% - 50px)';
			button.style.width = '100px';

			button.textContent = 'START AR';

			button.onmouseenter = function () {

				button.style.opacity = '1.0';

			};

			button.onmouseleave = function () {

				button.style.opacity = '0.5';

			};
          
            //核心功能：点击button时，开启一个immersive-ar session
			button.onclick = function () {

				if ( currentSession === null ) {

					navigator.xr.requestSession( 'immersive-ar', sessionInit ).then( onSessionStarted );

				} else {

					currentSession.end();

				}

			};

		}
        //在支持immersive-ar时，清空button的设置
		function disableButton() {

			button.style.display = '';

			button.style.cursor = 'auto';
			button.style.left = 'calc(50% - 75px)';
			button.style.width = '150px';

			button.onmouseenter = null;
			button.onmouseleave = null;

			button.onclick = null;

		}
        //不支持immersive-ar
		function showARNotSupported() {

			disableButton();

			button.textContent = 'AR NOT SUPPORTED';

		}
        //不支持immersive-ar
		function showARNotAllowed( exception ) {

			disableButton();

			console.warn( 'Exception when trying to call xr.isSessionSupported', exception );

			button.textContent = 'AR NOT ALLOWED';

		}
        //设置BUTTON样式
		function stylizeElement( element ) {

			element.style.position = 'absolute';
			element.style.bottom = '20px';
			element.style.padding = '12px 6px';
			element.style.border = '1px solid #fff';
			element.style.borderRadius = '4px';
			element.style.background = 'rgba(0,0,0,0.1)';
			element.style.color = '#fff';
			element.style.font = 'normal 13px sans-serif';
			element.style.textAlign = 'center';
			element.style.opacity = '0.5';
			element.style.outline = 'none';
			element.style.zIndex = '999';

		}
        //如果支持XR
		if ( 'xr' in navigator ) {

			button.id = 'ARButton';
			button.style.display = 'none';
            //设置BUTTON样式
			stylizeElement( button );
            //处理immersive-ar
			navigator.xr.isSessionSupported( 'immersive-ar' ).then( function ( supported ) {

				supported ? showStartAR() : showARNotSupported();

			} ).catch( showARNotAllowed );
           
			return {
                res:button, 
                stats:buttonStats,
            };

		} else {//如果不支持XR,显示可能的错误原因

			const message = document.createElement( 'a' );

			if ( window.isSecureContext === false ) {

				message.href = document.location.href.replace( /^http:/, 'https:' );
				message.innerHTML = 'WEBXR NEEDS HTTPS'; // TODO Improve message

			} else {

				message.href = 'https://immersiveweb.dev/';
				message.innerHTML = 'WEBXR NOT AVAILABLE';

			}

			message.style.left = 'calc(50% - 90px)';
			message.style.width = '180px';
			message.style.textDecoration = 'none';

			stylizeElement( message );

			return message;

		}
       

	}
  
    
}

export { myARButton };
