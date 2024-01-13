import { THREE } from '../../lib/useThreeWebGL2.js';

export default function VoxelBoneDebug( vox ){
    const iCnt = 3; // Component Count
    const buf  = new Uint32Array( vox.count * iCnt );//.fill( 1.0 );
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
        in uvec3 inst;

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

        bool hasBone( uint bi ){
            return (
                ( ( inst.y >> 16 )    == bi ) ||
                ( ( inst.y & 65535u ) == bi ) ||
                ( ( inst.z >> 16 )    == bi ) ||
                ( ( inst.z & 65535u ) == bi )
            )? true : false;
        }

        void main(){
            if( (inst.x & 65535u) == 0u ){
                // VOXEL OFF
                gl_Position = vec4( 0.0 );
            }else{
                // VOXEL ON
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // Voxel Position
                ivec3 coord = idxCoord( gl_InstanceID );
                vec3 voxMid = coordMidPoint( coord );
                vec3 pos    = position * vCellSize + voxMid;

                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // bool isHit = ( ( inst.x >> 16 ) == 1u )? true : false; // Voxels with 1 Bone
                // bool isHit = ( ( inst.x >> 16 ) == 2u )? true : false; // Voxels with 2 Bones
                // bool isHit = ( ( inst.x >> 16 ) > 0u )? true : false; // Voxels with bones

                // bool isHit = ( ( inst.y & 65535u ) > 0u )? true : false; // Bone assigned to First Slot
                // bool isHit = ( ( inst.y >> 16 ) > 0u )? true : false; // Bone assigned to Second Slot
                // bool isHit = ( ( inst.z & 65535u ) > 0u )? true : false; // Bone assigned to Third Slot
                // bool isHit = ( ( inst.z >> 16 ) > 0u )? true : false; // Bone assigned to Forth Slot

                // bool isHit = hasBone( 1u ); // Has Bone 0
                // bool isHit = hasBone( 2u ); // Has Bone 1
                // bool isHit = hasBone( 3u ); // Has Bone 2
                bool isHit = hasBone( 4u ); // Has Bone 3

                fragColor  = ( isHit )? vec3( 1.0, 1.0, 0.0 ) : vec3( 0.4 );   
                
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