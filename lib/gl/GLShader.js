import GLContext from './GLContext.js';

export default class GLShader{
    // #region MAIN
    prog     = null;
    uniforms = {}; // { name, type, value, loc }
    inputs   = {}; // { name, type, loc }, Attributes are inputs for compute shaders
    outputs  = {}; // { name, type, loc }, Out vars with fragment disabled are compute outputs
    
    constructor(){}

    dispose(){
        if( this.prog ) GLContext.ctx.deleteProgram( this.prog );
        this.prog = null;
    }
    // #endregion

    // #region METHODS

    // Set uniform value
    setUniform( vName, v ){
        const u = this.uniforms[ vName ];
        if( u ) u.value = v;
        else    console.log( 'UNIFORM NAME NOT FOUND: ', vName );

        return this;
    }
    // #endregion

    // #region STATIC

    static forGPGPU( fSrc ){
        // Compile
        const o = build( GPGPU_VERT, fSrc );
        if( !o ) return null;

        // Create Object
        const sh = new GLShader();
        sh.prog = o.prog;
        
        // Parse data out of source
        parseUniforms( sh.prog, fSrc, sh.uniforms );

        return sh;
    }

    static forTF( vSrc ){
        // Compile
        const o = build( vSrc, COMPUTE_FRAG, true );
        if( !o ) return null;

        // Create Object
        const sh = new GLShader();
        sh.prog = o.prog;

        if( o.outputs && Object.keys(o.outputs).length > 0 ) sh.outputs = o.outputs;

        // Parse data out of source
        parseInputs( vSrc, sh.inputs );
        parseUniforms( sh.prog, vSrc, sh.uniforms );

        return sh;
    }

    // #endregion
}


// #region SHADER CODE
const COMPUTE_FRAG = '#version 300 es\nvoid main(){}';
const GPGPU_VERT   = `#version 300 es

// Layout(location=0) in vec3 position;

const vec2[] points = vec2[](
    vec2( -1.0, -1.0 ), 
    vec2(  3.0, -1.0 ), 
    vec2( -1.0,  3.0 )
);

const vec2[] texcoord = vec2[](
    vec2( 0, 0 ), 
    vec2( 2, 0 ), 
    vec2( 0, 2 )
);

// out vec2 fragUV;

void main() { 
    gl_Position = vec4( points[ gl_VertexID ], 0.0, 1.0 );
}
`;


//     geo.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array([ -1.0, -1.0, 3.0, -1.0, -1.0, 3.0 ]), 2 ) );
//     geo.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array([0, 0, 2, 0, 0, 2]), 2 ) );
// #endregion


// #region SHADER COMPILING
function build( vSrc, fSrc, isCompute=false ){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Compile Shader
    const vSh = compileShader( vSrc, true );
    if( !vSh ) return null;

    const fSh = compileShader( fSrc, false );
    if( !fSh ){ GLContext.ctx.deleteShader( vSh ); return null; }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    return linkProgram( vSh, fSh, ( isCompute )?vSrc:null );
}

function compileShader( src, isVert=true ){
    const gl = GLContext.ctx;
    const sh = gl.createShader( isVert
        ? gl.VERTEX_SHADER
        : gl.FRAGMENT_SHADER
    );

    gl.shaderSource( sh, src );
    gl.compileShader( sh );

    if( !gl.getShaderParameter( sh, gl.COMPILE_STATUS ) ){
        console.log( 'SHADER COMPILE ERROR - isVert: ', isVert, 'MSG: ' , gl.getShaderInfoLog( sh ) );
        gl.deleteShader( sh );
        return null;
    }

    return sh;
}

function linkProgram( vSh, fSh, src ){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Build Program
    const gl   = GLContext.ctx;
    const prog = gl.createProgram();
    gl.attachShader( prog, vSh );
    gl.attachShader( prog, fSh );

    // Parse the output var names & set program to use them
    let varyings;
    let outputs;
    if( src ){
        [ varyings, outputs ] = parseOutputs( src );
        gl.transformFeedbackVaryings( prog, varyings, gl.SEPARATE_ATTRIBS );
    }

    // Complete Program
    gl.linkProgram( prog );
    
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Cleanup
    gl.detachShader( prog, vSh );
    gl.detachShader( prog, fSh );
    gl.deleteShader( vSh );
    gl.deleteShader( fSh );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Validate
    if( !gl.getProgramParameter( prog, gl.LINK_STATUS ) ){
        console.log( 'LINK ERROR', gl.getProgramInfoLog( prog ) );
        gl.deleteProgram( prog );
        return null;
    }

    return { prog, outputs };
}
// #endregion


// #region GLSL PARSER
function parseInputs( src, out ){
    // TODO: Support attribute src that don't define location
    // layout(location=0) in vec3 position;
    const reInput = /layout\(location=(\d+)\)\s+in\s+(\w+)\s+(\w+)\s*;/g;
    let result;

    while( (result = reInput.exec(src)) ) {
        out[ result[3] ] = { loc: parseInt( result[1] ), type:result[2] };
    }
}

function parseOutputs( src ){
    const reOutput = /out\s+(\w+)\s+(\w+)\s*;/g;   // uniform sampler2D tex;
    const varyings = [];
    const outputs  = {};
    let result;
    let i = 0;
    
    while( (result = reOutput.exec(src)) ) {
        outputs[ result[2] ] = { loc: i++, type:result[1] };
        varyings.push( result[2] );
    }

    return [ varyings, outputs ];
}

function parseUniforms( prog, src, out ){
    const reUniform = /uniform\s+(\w+)\s+(\w+)\s*;/g; // out vec3 color;
    const gl        = GLContext.ctx;
    let result;
    let loc;

    while( (result = reUniform.exec(src)) ){
        loc = gl.getUniformLocation( prog, result[2] );
        if( loc !== null )  out[ result[2] ] = { type: result[1], loc: loc, value: null };
        else                console.log( 'Uniform missing, may not be used : ', result[2] );
    }
}
// #endregion
