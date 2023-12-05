// #region IMPORTS
import * as THREE        from 'three';
import { OrbitControls } from 'OrbitControls';
export { THREE };
// #endregion

/*
<style>
    body, html { padding:0px; margin:0px; width:100%; height:100%; }
    canvas{ display:block; }
</style>

const App = useThreeWebGL2();
App.scene.add( facedCube( [0,3,0], 6 ) );
App
    .sphericalLook( 45, 35, 40 )
    .renderLoop();
*/


// #region OPTIONS
export function useDarkScene( tjs, props ){
    props = Object.assign({ floor:true }, props );

    // Light
    const light = new THREE.DirectionalLight( 0xffffff, 0.8 );
    light.position.set( 4, 10, 1 );
    tjs.scene.add( light );
    
    tjs.scene.add( new THREE.AmbientLight( 0x404040 ) );
    
    // Floor
    if( props.floor ){
        tjs.scene.add( new THREE.GridHelper( 20, 20, 0x0c610c, 0x444444 ) );
    }

    // Renderer
    tjs.renderer.setClearColor( 0x3a3a3a, 1 );
    return tjs;
};

export async function useVisualDebug( tjs ){
    const ary = await Promise.all([
        import( './meshes/DynLineMesh.js' ),
        import( './meshes/ShapePointsMesh.js' ),
    ]);

    const o = {};
    tjs.scene.add( ( o.ln  = new ary[ 0 ].default ) );
    tjs.scene.add( ( o.pnt = new ary[ 1 ].default ) );
    return o;
}
// #endregion

// #region EVENTS

class EventDispatcher{
    _evt = new EventTarget();
    on( evtName, fn ){ this._evt.addEventListener( evtName, fn ); return this; }
    off( evtName, fn ){ this._evt.removeEventListener( evtName, fn ); return this; }
    once( evtName, fn ){ this._evt.addEventListener( evtName, fn, { once:true } ); return this; }
    emit( evtName, data=null ){
        this._evt.dispatchEvent( ( !data )
            ? new Event( evtName, { bubbles:false, cancelable:true, composed:false } ) 
            : new CustomEvent( evtName, { detail:data, bubbles:false, cancelable:true, composed:false } )
        );
        return this;
    }
}

// #endregion

// #region MAIN
export default function useThreeWebGL2( props={} ){
    props = Object.assign( {
        colorMode : false,
        shadows   : false,
        preserverBuffer : false,
        power           : '',
    }, props );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // RENDERER
    const options = { 
        antialias               : true, 
        alpha                   : true,
        stencil                 : true,
        depth                   : true,
        preserveDrawingBuffer   : props.preserverBuffer,
        powerPreference         : ( props.power === '')      ? 'default' : 
                                  ( props.power === 'high' ) ? 'high-performance' : 'low-power',
    };

    const canvas    = document.createElement( 'canvas' );
    options.canvas  = canvas;
    options.context = canvas.getContext( 'webgl2' );

    const renderer = new THREE.WebGLRenderer( options );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setClearColor( 0x3a3a3a, 1 );

    //if( props.preserveDrawingBuffer ){
    // renderer.autoClearColor = false;
    // renderer.autoClearDepth = false;
    // Manual clearing : r.clearColor(); r.clearDepth();
    //}

    if( props.colorMode ){
        // React-Fiber changes the default settings, the defaults can cause issues trying to map colors 1:1
        // https://docs.pmnd.rs/react-three-fiber/api/canvas#render-defaults
        // https://threejs.org/docs/#manual/en/introduction/Color-management
        renderer.outputColorSpace       = THREE.SRGBColorSpace;           // Turns on sRGB Encoding & Gamma Correction 
        renderer.toneMapping            = THREE.ACESFilmicToneMapping;    // Try to make it close to HDR
        THREE.ColorManagement.enabled   = true;                           // Turns old 3JS's old color manager
    }   

    if( props.shadows ){
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type    = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    }

    document.body.appendChild( renderer.domElement );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // CORE
    const scene   = new THREE.Scene();    
    const clock   = new THREE.Clock();
    clock.start();

    const camera  = new THREE.PerspectiveCamera( 45, 1.0, 0.01, 5000 );
    camera.position.set( 0, 5, 20 );

    const camCtrl = new OrbitControls( camera, renderer.domElement );

    const events  = new EventDispatcher();

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // METHODS
    let self;   // Need to declare before methods for it to be useable

    const render = ( onPreRender=null, onPostRender=null ) =>{
        const deltaTime   = clock.getDelta();
        const ellapseTime = clock.getElapsedTime();

        if( onPreRender )  onPreRender( deltaTime, ellapseTime );
        renderer.render( scene, camera );
        if( onPostRender ) onPostRender( deltaTime, ellapseTime );

        return self;
    };

    const renderLoop = ()=>{
        window.requestAnimationFrame( renderLoop );
        render();
        return self;
    };

    const createRenderLoop = ( fnPreRender=null, fnPostRender=null )=>{
        let   reqId = 0;

        const onRender = ()=>{
            render( fnPreRender, fnPostRender );
            reqId = window.requestAnimationFrame( onRender );
        };
        
        return {
            stop    : () => window.cancelAnimationFrame( reqId ),
            start   : () => onRender(),
        };
    };

    const sphericalLook = ( lon, lat, radius, target=null )=>{
        const phi 	= ( 90 - lat )  * Math.PI / 180;
        const theta = ( lon + 180 ) * Math.PI / 180;

        camera.position.set(
            -(radius * Math.sin( phi ) * Math.sin(theta)),
            radius * Math.cos( phi ),
            -(radius * Math.sin( phi ) * Math.cos(theta))
        );

        if( target ) camCtrl.target.fromArray( target );
        camCtrl.update();
        return self;
    };

    const resize = ( w=0, h=0 )=>{
        const W = w || window.innerWidth;
        const H = h || window.innerHeight;
        renderer.setSize( W, H );           // Update Renderer

        if( !camera.isOrthographicCamera ){
            camera.aspect = W / H;              
        }else{
            const h = camera.top;
            const w = h * ( W / H );
            camera.left    = -w;
            camera.right   =  w;
            camera.top     =  h;
            camera.bottom  = -h;
        }

        camera.updateProjectionMatrix();
        events.emit( 'resize', { width:W, height:h } );
        return self;
    };

    const getRenderSize = ()=>{
        const v = new THREE.Vector2();
        renderer.getSize( v );
        return v.toArray();
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    window.addEventListener( 'resize', ()=>resize() );
    resize();

    return self = {
        renderer,
        scene,
        camera,
        camCtrl,
        clock,
        events,

        render,
        renderLoop,
        createRenderLoop,
        getRenderSize,
        sphericalLook,
        resize,

        version: ()=>{ return THREE.REVISION; },
    };
}
// #endregion
