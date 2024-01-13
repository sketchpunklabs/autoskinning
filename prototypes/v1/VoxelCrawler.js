// #region IMPORTS
import { GLContext, GPGPU, TransformFeedback, GLShader, GLBuffer, GLDataTexture } from '../../lib/gl/index.js';
import Util from './Util.js';
// #endregion

export default class VoxelCrawler{
    // #region MAIN
    voxDivision = 0;

    dtCrawl     = [];
    shInit      = null;
    shCrawl     = null;

    finalIndex  = 0;

    constructor( app ){
        this.app        = app;
        this.shInit     = GLShader.forGPGPU( GP_CRAWL_INIT );
        this.shCrawl    = GLShader.forGPGPU( GP_CRAWL );
    }
    // #endregion

    // #region GETTERS

    // Return the correct data texture with the most up to data
    get dataTexture(){ return this.dtCrawl[ this.finalIndex ]; }
    
    // #endregion

    // #region COMPUTE
    execute( vox, iter=1, boneIdx=0, dtVoxBones ){
        if( this.voxDivision !== vox.division ){
            this.createDataTextures( vox );
            this.voxDivision = vox.division;
        }

        const size = this.app.getRenderSize();
        console.time( 'Vox_Crawl_Compute' );
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Execute initial compute, set the voxels that intersect
        // the specific bone as the starting points for the crawl.

        this.shInit
            .setUniform( 'boneIndex', boneIdx )
            .setUniform( 'tex', dtVoxBones.ref );

        GPGPU.compute( this.shInit, this.dtCrawl[0], size );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Crawl the voxel grid 1 interation at a time. Since WebGL
        // has no support for Read+Write Buffers, we are limited
        // to Read or Write. To work around this the data is duplicated
        // into two buffers that will swop at every iteration.

        // So the initial compute will fill in BUF0 which will be
        // the input for the first iteration. BUF1 will be set as output
        // Then the next go around BUF1 is input with BUF0 as output.
        // So we just Ping-Pong the data till the final iteration,
        // whatever buffer is output last will contain the final 
        // version of the data.

        // Set voxel chunk information
        this.shCrawl
            .setUniform( 'vCellSize',   vox.cellSize )
            .setUniform( 'vXZCount',    vox.xzCount )
            .setUniform( 'vDimension',  vox.dimension )
            .setUniform( 'vMin',        vox.minBound );

        // Ping-Pong Loop
        let i, ii;
        for( let j=0; j < iter; j++ ){
            ii = ( j + 1 ) % 2;     // Output DataTexture Index
            i  = ( ii + 1 ) % 2;    // Input DataTexture Index

            this.shCrawl.setUniform( 'tex', this.dtCrawl[i].ref );
            GPGPU.compute( this.shCrawl, this.dtCrawl[ii], size );
        }

        this.finalIndex = ii;

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.timeEnd( 'Vox_Crawl_Compute' );
    }

    createDataTextures( vox ){
        console.time( 'Create_Voxel_Crawl_DT' );
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Clean up existing textures
        if( this.dtCrawl.length > 0 ){
            this.dtCrawl[0].dispose();
            this.dtCrawl[1].dispose();
            this.dtCrawl.length = 0;
        }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Data Texture is layed out as a single float per voxel.
        // Each voxel will contain the distance from a bone voxel.
        // There are special values:
        // -10 means the voxel is empty
        // -1 means the voxel is solid but has no set distance
        this.dtCrawl.push(
            GLDataTexture.asFloat32( 1, vox.count, 1 ).upload(),
            GLDataTexture.asFloat32( 1, vox.count, 1 ).upload(),
        );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.log( 'Crawl DataTextures:', Util.byteSize( vox.count * 4 * 2 ) ); // R * 4Bytes * 2 DataTextures
        console.timeEnd( 'Create_Voxel_Crawl_DT' );
    }
    // #endregion

    // #region DEBUGGING
    debugVoxels( mesh, maxDist ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shDebug ){
            this.shDebug = GLShader.forTF( TF_DEBUG );
        }

        // Set input which is the DataTexture
        this.shDebug
            .setUniform( 'tex', this.dtCrawl[ this.finalIndex ].ref );

        // Set max distance on debug mesh material
        mesh.material.uniforms.vMaxDist.value = maxDist;
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Translate the DataTexture to the Debug Mesh's Instance Buffer
        TransformFeedback.compute( this.app.renderer, this.shDebug, {
            to: mesh.geometry.attributes.inst
        });
    }
    // #endregion
}


// #region COMPUTE SHADER CODE

const GP_CRAWL_INIT = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform highp usampler2D tex;
uniform uint  boneIndex;
out vec4 outColor;
// #endregion

void main(){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    int idx  = int( gl_FragCoord.y );
    uvec3 px = texelFetch( tex, ivec2( 0, idx ), 0 ).rgb;
    
    // Even tho its just a Float out, must set GBA as 0,0,1, 
    // else R gets effed up with anything else somehow???
    // Vec2 & Vec3 doesn't work either, just Vec4.
    outColor = vec4( 0., 0., 0., 1. );
    
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    uint isVoxel = px.x & 65535u; // 0: Empty, 1:Solid
    uint boneCnt = px.x >> 16;    // Total bones that intersect voxel
    outColor.x   = -1.0;            // Start with solid voxel ready State

    if( isVoxel == 0u ){
        outColor.x = -10.0; // set as empty state

    }else if( boneCnt > 0u ){
        // Bone index is stored in vox buffer with a Plus 1
        // Add one now to make testing easier with bitwise ops
        uint bi = boneIndex + 1u;

        // Test the 4 bone indices if any is ths selected one
        if( 
            ( px.y & 65535u ) == bi ||
            ( px.y >> 16 )    == bi ||
            ( px.z & 65535u ) == bi ||
            ( px.z >> 16 )    == bi
        ){
            // Bone intersected voxel state as zero
            // The crawl will replace all voxels set as -1
            // with the distance from this initial voxel
            outColor.x = 0.0;
        }
    }
}`;

const GP_CRAWL = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform float vCellSize;    // Size of a voxel cell
uniform int   vXZCount;     // How many voxels in one level
uniform ivec3 vDimension;   // Voxel chunk size, how many voxels in each axis
uniform vec3  vMin;         // Min Bounding for Voxel Chunk

uniform highp sampler2D tex; // Data from previous pass

out vec4 outColor;

const ivec3[6] dirs = ivec3[6](
    ivec3(  0,  1,  0 ), // up
    ivec3(  0, -1,  0 ), // down
    ivec3(  1,  0,  0 ), // right
    ivec3( -1,  0,  0 ), // left
    ivec3(  0,  0,  1 ), // forward
    ivec3(  0,  0, -1 )  // back
);
// #endregion

// #region VOXEL ////////////////////////////////////////////////////////////////
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

// Convert cvoxel coordinate to index
int coordIdx( ivec3 coord ){
    // ( xLen * zLen * y ) + ( xLen * z ) + x
    return vXZCount * coord.y + vDimension.x * coord.z + coord.x;
}

bool isValidCoord( ivec3 c ){
    return ( 
        c.x >= 0 && c.x < vDimension.x &&
        c.y >= 0 && c.y < vDimension.y &&
        c.z >= 0 && c.z < vDimension.z
    );
}
// #endregion

void main(){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    int idx  = int( gl_FragCoord.y );
    float px = texelFetch( tex, ivec2( 0, idx ), 0 ).r;
    
    // Even tho its just a Float out, must set GBA as 0,0,1, 
    // else R gets effed up with anything else somehow???
    // Vec2 & Vec3 doesn't work either, just Vec4.
    outColor = vec4( px, 0., 0., 1. );

    // Skip any empty voxels, should be set as -10.0
    // Float points arent precise values for equal tests
    // So lets play it safe and test for -5 instead :)
    if( px < -5.0 ) return;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Traverse each neighbor voxel
    ivec3 vCoord  = idxCoord( idx );
    vec3  vMid    = coordMidPoint( vCoord );
    float minDist = px;
    
    ivec3 nCoord;
    int   nIdx;
    float nDist;
    float dist;
    vec3  nMid;

    for( int i=0; i < 6; i++ ){
        // ---------------------------
        // Only use valid voxel coordinates for neighbors
        nCoord = vCoord + dirs[ i ];
        if( !isValidCoord( nCoord ) ) continue;

        // ---------------------------
        // Look for neighor connected to a bone path
        // If a voxel is set to -1, it is not part of
        // a path
        nIdx   = coordIdx( nCoord );
        nDist  = texelFetch( tex, ivec2( 0, nIdx ), 0 ).r;
        if( nDist < 0.0 ) continue;
        
        // ---------------------------
        // Compute distance from bone using voxel 
        // mid points plus neighbors distance
        // This should compute total crawl distance
        // traveled from the bone. 
        nMid = coordMidPoint( nCoord );
        dist = length( vMid - nMid ) + nDist;

        minDist = ( minDist < 0.0 )  // If unused...
            ? dist                   // Use computed distance
            : min( minDist, dist );  // Else use shortest distance to bone
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Finalize
    outColor.x = minDist;
}`;

// #endregion

// #region DEBUG COMPUTE SHADERS

const TF_DEBUG = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform highp sampler2D tex;
flat out float to;
// #endregion

void main(){
    int idx  = gl_VertexID;
    vec4 px = texelFetch( tex, ivec2( 0, idx ), 0 );
    to = px.r;
}`;

// #endregion