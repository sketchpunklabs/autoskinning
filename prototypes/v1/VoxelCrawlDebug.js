import { THREE } from '../../lib/useThreeWebGL2.js';

export default function VoxelCrawlDebug( vox ){
    const iCnt = 1; // Component Count
    const buf  = new Float32Array( vox.count * iCnt );//.fill( 1.0 );
    const geo  = new THREE.PlaneGeometry( 0.5, 0.5 );
    geo.rotateX( -Math.PI * 0.5 );

    const iGeo = new THREE.InstancedBufferGeometry();
    iGeo.setIndex( Array.from( geo.index.array ) ); // 3Js flips out, need to pass JS Array
    iGeo.setAttribute( 'position', geo.attributes.position );
    iGeo.setAttribute( 'normal', geo.attributes.normal );
    iGeo.setAttribute( 'inst', new THREE.InstancedBufferAttribute( buf, iCnt ) );
    iGeo.instanceCount = vox.count;

    const mat  = customMaterial( vox );
    const mesh = new THREE.Mesh( iGeo, mat );
    
    mesh.frustumCulled = false;
    return mesh;
}

function customMaterial( chunk ){
    const mat = new THREE.RawShaderMaterial({
        side: THREE.DoubleSide,

        uniforms    : {
            vCellSize   : { type:'float',   value:chunk.cellSize },
            vXZCount    : { type:'int',     value:chunk.xzCount },
            vDimension  : { type:'ivec3',   value:chunk.dimension },
            vMin        : { type:'vec3',    value:chunk.minBound },
            vMaxDist    : { type:'float',   value:0 },
        },

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        vertexShader : `#version 300 es
        precision highp float;

        // #region DATA
        in vec3  position;
        in vec3  normal;
        in float inst;

        uniform mat4 modelMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projectionMatrix;

        uniform float vCellSize;    // Size of a voxel cell
        uniform int   vXZCount;     // How many voxels in one level
        uniform ivec3 vDimension;   // Voxel chunk size, how many voxels in each axis
        uniform vec3  vMin;         // Min Bounding for Voxel Chunk
        uniform float vMaxDist;

        out vec3 fragWPos;
        out vec3 fragNorm;
        out vec3 fragColor;
        // #endregion

        // #region VOXEL ////////////////////////////////////////////////////////////////////////

        // Compute center point at voxel coordinate
        vec3 coordMidPoint( ivec3 coord ){
            return vec3( coord ) * vCellSize + vMin + ( vCellSize * 0.5 );
        }

        // Convert Index to Voxel Coordinate
        ivec3 idxCoord( int i ){
            int y   = i / vXZCount;            // How Many Y Levels Can We Get?
            int xz  = i - ( y * vXZCount );    // Subtract Y Levels from total, To get remaining Layer
            int z   = xz / vDimension.x;       // How many rows in the last layer can we get?
            int x   = xz - z * vDimension.x;   // With all the rows removed, how many left
            return ivec3( x, y, z );
        }

        // #endregion

        void main(){
            
            if( inst <= -5.0 ){
                // VOXEL OFF
                // Ignore any voxel set to -10, as its marked as empty
                gl_Position = vec4( 0.0 );

            }else{
                // VOXEL ON
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // Voxel Position
                ivec3 coord = idxCoord( gl_InstanceID );
                vec3 voxMid = coordMidPoint( coord );
                vec3 pos    = position * vCellSize + voxMid;

                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                fragColor = mix(
                    vec3( 1.0, 0.0, 0.0 ),
                    vec3( 0.0, 1.0, 1.0 ),
                    pow( inst / vMaxDist, 0.7 )
                );

                if( inst == 0.0 ) fragColor = vec3( 0.0, 1.0, 0.0 );
                if( inst < 0.0 )  fragColor = vec3( 1.0, 1.0, 1.0 );  
                
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // Output
                vec4 wpos   = modelMatrix * vec4( pos , 1.0 );

                fragWPos    = wpos.xyz;
                fragNorm    = ( modelMatrix * vec4( normal, 0.0 ) ).xyz;

                gl_Position = projectionMatrix * viewMatrix * wpos;
            }
        }`,

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        fragmentShader	: `#version 300 es
        precision mediump float;
                
        out vec4 outColor;
        in  vec3 fragWPos;
        in  vec3 fragNorm;
        in  vec3 fragColor;

        ////////////////////////////////////////////////////////////////////////

        void main(){
            // outColor = vec4( 1.0, 0.0, 0.0, 1.0 );

            // Lambert Lighting
            vec3 lightWPos = vec3( 2.0, 10.0, 4.0 );
            float NdL      = dot( fragNorm, normalize( lightWPos - fragWPos ) );
            NdL            = NdL * 0.5 + 0.5;                    // Remap -1:0 to 0:1
            NdL            = clamp( 0.0, 1.0, NdL );             // Help remove any midtone shadows, don't notice it using planes
            NdL            = NdL * NdL;                          // Valve's Half Lambert, just curves the light value

            outColor.a   = 1.0;
            // outColor.rgb = vec3( 0.0, 1.0, 0.0 ) * NdL;
            outColor.rgb = fragColor * NdL;
        }`,
    });

    return mat;
}