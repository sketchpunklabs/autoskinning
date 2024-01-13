// #region IMPORTS
import { GLContext, GPGPU, TransformFeedback, GLShader, GLBuffer, GLDataTexture } from '../../lib/gl/index.js';
import Util from './Util.js';
// #endregion

export default class VoxelBones{
    // #region MAIN
    shCompute   = null;
    dtVoxBones  = null;
    voxDivision = 0;

    shDebug     = null;

    constructor( app ){
        this.app       = app;
        this.shCompute = GLShader.forGPGPU( GP_BONE_INTER );
    }
    // #endregion

    // #region COMPUTE
    execute( vox, dtSolidVox, dtBones ){
        if( this.voxDivision !== vox.division ){
            this.createDataTextures( vox );
            this.voxDivision = vox.division;
        }

        const size = this.app.getRenderSize();
        console.time( 'Vox_Bone_Intersection_Compute' );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Compute Voxel Shell
        this.shCompute
            .setUniform( 'vCellSize',   vox.cellSize )
            .setUniform( 'vXZCount',    vox.xzCount )
            .setUniform( 'vDimension',  vox.dimension )
            .setUniform( 'vMin',        vox.minBound )
            .setUniform( 'texVox',      dtSolidVox.ref )
            .setUniform( 'segCnt',      dtBones.rowLen )
            .setUniform( 'texSeg',      dtBones.ref );

        GPGPU.compute( this.shCompute, this.dtVoxBones, size );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.timeEnd( 'Vox_Bone_Intersection_Compute' );
    }

    createDataTextures( vox ){
        console.time( 'Create_Voxel_Bone_DT' );
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Clean up existing textures
        if( this.dtVoxBones ) this.dtVoxBones.dispose();

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Data Texture is laid out with 4 Uint32. Each int is partitioned
        // into two Uint16 values. This allows to compress data to 
        // fit more stuff. If a skeleton is going to have no more then 250
        // bones we can fit 4 Indices per component but when dealing with
        // hair & clothing the bone count can reach higher. For simplicity sake
        // using Uint16 partitions to store the index of each bone that
        // intersects the voxel for now.
        // X : Bone Count & IsEmpty (0:off, 1:on) -- X >> 16 for boneCount, X & 65535u for IsEmpty
        // Y : Bone 1 Index & Bone 0 Index
        // Z : Bone 3 Index & Bone 2 Index

        // **NOTE**, With WebGL there is no support for a Uint32 Vec3,
        // only 1,2 & 4. Even though only using 3 ints of data, we need
        // to allocate 4 ints. The last int can be used down the line 
        // if wanting to store 2 more bone indices.

        this.dtVoxBones = GLDataTexture.asUint32( 1, vox.count, 4 ).upload();

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.log( 'Voxel Bone DataTexture:', Util.byteSize( vox.count * 4 * 4 ) ); // 4 bytes * RGBA
        console.timeEnd( 'Create_Voxel_Bone_DT' );
    }
    // #endregion

    // #region DEBUGGING
    debugVoxels( mesh ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shDebug ){
            this.shDebug = GLShader.forTF( TF_DEBUG );
        }

        // Set input which is the DataTexture
        this.shDebug.setUniform( 'tex', this.dtVoxBones.ref );
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Translate the DataTexture to the Debug Mesh's Instance Buffer
        TransformFeedback.compute( this.app.renderer, this.shDebug, {
            to: mesh.geometry.attributes.inst
        });
    }
    
    debugRawDataGPU(){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.dtVoxBones ){ console.log( 'VoxelBone DataTexture is null' ); return; }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Output the screen each pixel data row
        const buf = GPGPU.readUint32( this.dtVoxBones );
        for( let i=0; i < buf.length; i+=4 ) console.log( buf[i+0], buf[i+1], buf[i+2], buf[i+3] );
    }
    // #endregion
}


// #region COMPUTE SHADER CODE
const GP_BONE_INTER = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////

uniform float vCellSize;    // Size of a voxel cell
uniform int   vXZCount;     // How many voxels in one level
uniform ivec3 vDimension;   // Voxel chunk size, how many voxels in each axis
uniform vec3  vMin;         // Min Bounding for Voxel Chunk

uniform sampler2D texVox;

uniform int segCnt;
uniform sampler2D texSeg;

// flat out uvec3 vox;
out uvec4 outColor;
// #endregion

// #region INTERSECTIONS ////////////////////////////////////////////////////////////////
int point_aabb( vec3 p, vec3 min, vec3 max ){
    return (
        min.x <= p.x && p.x <= max.x &&
        min.y <= p.y && p.y <= max.y &&
        min.z <= p.z && p.z <= max.z
    )? 1 : 0;
}

int segment_aabb( vec3 head, vec3 tail, vec3 bMin, vec3 bMax ){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Test if either end is inside the box
    if( point_aabb( head, bMin, bMax ) == 1 ) return 1;
    if( point_aabb( tail, bMin, bMax ) == 1 ) return 1;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    vec3 dir    = tail - head;
    vec3 tMin   = ( bMin - head ) / dir;
    vec3 tMax   = ( bMax - head ) / dir;
    
    vec3 t1     = min( tMin, tMax );
    vec3 t2     = max( tMin, tMax );
    float tNear = max( max( t1.x, t1.y ), t1.z );
    float tFar  = min( min( t2.x, t2.y ), t2.z );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~    
    if( tNear < tFar ){

        // Extra test where at least 1 side is within 0:1 range
        // If both are outside then the segment doesn't intersect
        // In Terms of a ray there is an intersection
        if( 
            ( tNear >=0.0 && tNear <= 1.0 ) ||
            ( tFar  >=0.0 && tFar  <= 1.0 )
        ) return 1;

        // return 1; // Return true as a Ray instead of a segment
    }

    return 0;
}
// #endregion

// #region SEGMENT DATA //////////////////////////////////////////////////////////////////
struct Seg{
    vec3 a;
    vec3 b;
};

Seg getSegAt( int i ){
    return Seg(
        texelFetch( texSeg, ivec2( 0, i ), 0 ).rgb,
        texelFetch( texSeg, ivec2( 1, i ), 0 ).rgb
    );
}
// #endregion

// #region VOXEL ////////////////////////////////////////////////////////////////

// Compute center point at voxel coordinate
// vec3 coordMidPoint( ivec3 coord ){
//     return vec3( coord ) * vCellSize + vMin + ( vCellSize * 0.5 );
// }

// Calc the voxel bounding box
void coordBounds( ivec3 coord, out vec3 bMin, out vec3 bMax ){
    bMin = vec3( coord ) * vCellSize + vMin;
    bMax = bMin + vCellSize;

    // [[ NOTE ]]
    // Add a smidge of buffer space for segments that
    // are perflecty in the boundary of two voxels.
    bMin -= vec3( 0.01 );
    bMax += vec3( 0.01 );
}

// Convert Index to Voxel Coordinate
ivec3 idxCoord( int i ){
    int y   = i / vXZCount;            // How Many Y Levels Can We Get?
    int xz  = i - ( y * vXZCount );    // Subtract Y Levels from total, To get remaining Layer
    int z   = xz / vDimension.x;       // How many rows in the last layer can we get?
    int x   = xz - z * vDimension.x;   // With all the rows removed, how many left
    return ivec3( x, y, z );
}

int coordIdx( ivec3 coord ){
    // ( xLen * zLen * y ) + ( xLen * z ) + x
    return vXZCount * coord.y + vDimension.x * coord.z + coord.x;
}
// #endregion

void main(){
    int vIdx = int( gl_FragCoord.y );
    vec4 px  = texelFetch( texVox, ivec2( 0, vIdx ), 0 );
    outColor = uvec4( 0u );

    if( px.x > 0.5 ){
        outColor.x = 1u;

        // Compute Voxel's bounding area
        vec3 bMin   = vec3( 0.0 );
        vec3 bMax   = vec3( 0.0 );
        ivec3 coord = idxCoord( vIdx );
        coordBounds( coord, bMin, bMax );

        // Test each bone segment against the voxel
        Seg seg;
        int isHit;

        uint boneCnt = 0u;
        uint ii      = 0u;

        for( int i=0; i < segCnt; i++ ){
            seg     = getSegAt( i );
            isHit   = segment_aabb( seg.a, seg.b, bMin, bMax );
            if( isHit == 1 ){
                boneCnt++;

                // Convert to Uint & Increment Bone Index
                ii = uint( i+1 ); 

                // save up to 4 bones indices as uint16
                // Paritions from the Y & Z UVEC3 components
                if( boneCnt == 1u ){
                    outColor.y = ii;
                }else if( boneCnt == 2u ){
                    outColor.y = ( ii << 16 ) | outColor.y;
                }else if( boneCnt == 3u ){
                    outColor.z = ii;
                }else if( boneCnt == 4u ){
                    outColor.z = ( ii << 16 ) | outColor.z;
                }
            }
        }

        // 16 Bit Partition, BoneCnt:IsVoxelActive
        outColor.x = ( boneCnt << 16 ) | 1u;
    }

}`;
// #endregion

// #region DEBUG COMPUTE SHADERS

const TF_DEBUG = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform highp usampler2D tex;
flat out uvec3 to;
// #endregion

void main(){
    int idx  = gl_VertexID;
    uvec4 px = texelFetch( tex, ivec2( 0, idx ), 0 );
    to = px.rgb;
}`;

// #endregion