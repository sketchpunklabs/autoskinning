import { THREE } from '../../lib/useThreeWebGL2.js';

const SH_NAME = '__DEBUG_WEIGHTDIST__';

export default function VoxelCrawlVertDebug( mesh, maxDist ){
    if( mesh.material.name === SH_NAME ){
        mesh.material.vMaxDist = maxDist;
    }else{
        mesh.material = debugWeightDistMaterial( maxDist );
    }
}

function debugWeightDistMaterial( maxDist=0 ){
    const mat = new THREE.RawShaderMaterial({
        name: SH_NAME,
    // depthTest       : true,
    // side            : THREE.DoubleSide,
    // transparent     : true, 
    // forceSinglePass : true,             
    // alphaToCoverage : true,             
    // lights          : true,
    uniforms        : {
        vMaxDist     : { type: 'float', value:maxDist },
        boneIndex    : { type: 'int', value:0 },
    },
    
    vertexShader    : `#version 300 es
    in vec3 position;
    in vec3 normal;
    in vec2 uv;
    in vec4 skinWeight; // Bone Weights
    in vec4 skinIndex;  // Bone Indices
    
    uniform mat4 modelMatrix;
    uniform mat4 viewMatrix;
    uniform mat4 projectionMatrix;

    uniform float vMaxDist;
    uniform int   boneIndex;

    out vec3 fragColor;
    out vec3 fragNorm;
    out vec3 fragWPos;
    out vec2 fragUV;

    /////////////////////////////////////////////////////////////////

    float getBoneWeight( int bi ){
        ivec4 idx = ivec4( skinIndex );

        if( idx.x == bi ) return skinWeight.x;
        if( idx.y == bi ) return skinWeight.y;
        if( idx.z == bi ) return skinWeight.z;
        if( idx.w == bi ) return skinWeight.w;

        return -1.0;
    }

    /////////////////////////////////////////////////////////////////

    void main(){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        vec3 pos    = position;

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        vec4 wPos   = modelMatrix * vec4( pos, 1.0 );
        vec4 vPos   = viewMatrix * wPos;
        fragWPos    = wPos.xyz;
        fragUV      = uv;
        fragNorm    = normal;
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // float t   = skinWeight.x / vMaxDist;

        float wgt = getBoneWeight( boneIndex );
        float t   = wgt / vMaxDist;

        fragColor   = mix(
            vec3( 1.0, 0.0, 0.0 ),
            vec3( 0.0, 1.0, 1.0 ),
            pow( t, 0.7 )
        );

        // if( skinWeight.x < 0.0 ) fragColor = vec3( 1.0, 1.0, 1.0 );
        if( wgt < 0.0 ) fragColor = vec3( 1.0, 1.0, 1.0 );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        gl_Position = projectionMatrix * vPos;
    }`,
	
    fragmentShader  : `#version 300 es
    precision mediump float;

    in vec3 fragColor;
    in vec3 fragNorm;
    in vec3 fragWPos;
    in vec2 fragUV;

    out vec4  outColor;

    ////////////////////////////////////////////////////////////////////////

    const vec3 lightWPos = vec3( 2.0, 10.0, 4.0 );

    void main(){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        outColor = vec4( 1.0, 0.0, 0.0, 1.0 );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Half Lambert Lighting
        vec3  N   = normalize( cross( dFdx( fragWPos), dFdy( fragWPos ) ) ); //normalize( fragNorm );
        float NdL = dot( N, normalize( lightWPos - fragWPos ) );
        NdL       = NdL * 0.5 + 0.5;                    // Remap -1:0 to 0:1
        NdL       = clamp( 0.0, 1.0, NdL );             // Help remove any midtone shadows, don't notice it using planes
        NdL       = NdL * NdL;                          // Valve's Half Lambert, just curves the light value

        // outColor.rgb = vec3( NdL );
        // outColor.rgb = vec3( N );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Final Lighting
        // outColor.rgb = vec3( 1.0, 0.0, 0.0 ) * NdL;
        outColor.rgb = fragColor * NdL;
    }`
    });

    Object.defineProperty( mat, 'vMaxDist', { 
        set: ( v )=>{ mat.uniforms.vMaxDist.value = v; } 
    });

    Object.defineProperty( mat, 'boneIndex', { 
        set: ( v )=>{ mat.uniforms.boneIndex.value = v; } 
    });

    return mat;
}