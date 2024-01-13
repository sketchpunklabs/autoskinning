import { THREE } from '../../lib/useThreeWebGL2.js';

const SH_NAME = '__DEBUG_WEIGHT__';

export default function VertWeightDebug( mesh ){
    if( mesh.material.name === SH_NAME ){

    }else{
        mesh.material = debugWeightMaterial();
    }
}

function debugWeightMaterial(){
    const mat = new THREE.RawShaderMaterial({
        name: SH_NAME,
    // depthTest       : true,
    // side            : THREE.DoubleSide,
    // transparent     : true, 
    // forceSinglePass : true,             
    // alphaToCoverage : true,             
    // lights          : true,
    uniforms        : {
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

    const vec3 red   = vec3( 1.0, 0.0, 0.0 );
    const vec3 green = vec3( 0.0, 1.0, 0.0 );
    const vec3 blue  = vec3( 0.0, 0.0, 1.0 );

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
        float wgt = getBoneWeight( boneIndex );

        fragColor = mix(
            vec3( 0.0, 1.0, 1.0 ),
            vec3( 1.0, 0.0, 0.0 ),
            wgt
        );

        // if( wgt > 0.5 ) fragColor = mix( green, red, wgt * 2.0 + 1.0 );
        // else            fragColor = mix( blue, green, wgt * 2.0 );

        // if( wgt <= 0.0 ) fragColor = vec3( 1.0, 1.0, 1.0 );

        if( wgt < 0.0 ) fragColor = vec3( 1.0, 1.0, 0.0 );


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