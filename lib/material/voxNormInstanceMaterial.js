import * as THREE from 'three';

export default function voxNormInstanceMaterial( chunk ){
    const mat = new THREE.RawShaderMaterial({        
        uniforms    : {
            vCellSize   : { type:'float', value:chunk.cellSize },
            vXZCount    : { type:'int', value:chunk.xzCount },
            vDimension  : { type:'ivec3', value:chunk.dimension },
            vMin        : { type:'vec3', value:chunk.minBound },
        },

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        vertexShader : `#version 300 es
        precision highp float;

        // #region DATA
        in vec3 position;
        in vec3 normal;
        in vec4 inst;

        uniform mat4 modelMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 projectionMatrix;

        uniform float vCellSize;    // Size of a voxel cell
        uniform int   vXZCount;     // How many voxels in one level
        uniform ivec3 vDimension;   // Voxel chunk size, how many voxels in each axis
        uniform vec3  vMin;         // Min Bounding for Voxel Chunk

        out vec3 fragWPos;
        out vec3 fragNorm;
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
    
        // #region QUAT

        #define PI 3.1415926535897932384626433832795

        // Quat * Vec3 - Rotates Vec3
        vec3 quatVec( vec4 q, vec3 v ){
            //return v + cross( 2.0 * q.xyz, cross( q.xyz, v) + q.w * v );  // Either Seems to Work, not sure which is the correct way to handle transformation
            return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
        } 

        vec4 quatAxisAngle( vec3 axis, float angle ){ 
            vec4 qr;
            float half_angle = ( angle * 0.5 );
            qr.x = axis.x * sin(half_angle);
            qr.y = axis.y * sin(half_angle);
            qr.z = axis.z * sin(half_angle);
            qr.w = cos(half_angle);
            return qr;
        }

        vec4 quatSwing( vec3 a, vec3 b ){
            // http://physicsforgames.blogspot.com/2010/03/Quat-tricks.html
            float dot = dot( a, b );
    
            if( dot < -0.999999 ){ // 180 opposites
                vec3 v = cross( vec3(1.,0.,0.), a ); // Maybe -1,0,0?
    
                if( length(v) < 0.000001 ) v = cross( vec3(0.,1.,0.), a );

                return quatAxisAngle( normalize( v ), PI );
            }else if( dot > 0.999999 ){ // Same Direction
                return vec4( 0.0, 0.0, 0.0, 1.0 );
            }else{
                vec4 v = vec4( cross( a, b ), 1.0 + dot );
                return normalize( v );
            }
        }
        // #endregion

        void main(){
            if( inst.w < 0.5 ){
                // VOXEL OFF
                gl_Position = vec4( 0.0 );
            }else{
                // VOXEL ON
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // Voxel Position
                ivec3 coord = idxCoord( gl_InstanceID );
                vec3 voxMid = coordMidPoint( coord );

                // vec3 pos    = position * vCellSize + voxMid; // * float( inst )

                vec4 q      = quatSwing( vec3(0.,1., 0.), normalize( inst.xyz ) );
                vec3 pos    = quatVec( q, position );
                pos         = pos * vCellSize + voxMid;

                
                
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
            outColor.rgb = vec3( 0.0, 1.0, 0.0 ) * NdL;
        }`,
    });

    return mat;
}