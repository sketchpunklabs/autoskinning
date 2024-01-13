// #region IMPORTS
import { GLContext, GPGPU, TransformFeedback, GLShader, GLBuffer, GLDataTexture } from '../../lib/gl/index.js';
import Util from './Util.js';
// #endregion

export default class Voxelizer{
    // #region MAIN
    shVoxShell  = null;
    shVoxFill   = null;
    dtShell     = null;
    dtSolid     = null;
    voxDivision = 0;

    shDebugShell = null;
    shDebugSolid = null;

    constructor( app ){
        this.app        = app;
        this.shVoxShell = GLShader.forGPGPU( GP_VOX_TRI );
        this.shVoxFill  = GLShader.forGPGPU( GP_VOX_FILL );
    }
    // #endregion

    // #region COMPUTE
    execute( vox, dtTriangles ){
        if( this.voxDivision !== vox.division ){
            this.createDataTextures( vox );
            this.voxDivision = vox.division;
        }

        const size = this.app.getRenderSize();
        console.time( 'Voxelizer_Compute' );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Compute Voxel Shell
        this.shVoxShell
            .setUniform( 'vCellSize',   vox.cellSize )
            .setUniform( 'vXZCount',    vox.xzCount )
            .setUniform( 'vDimension',  vox.dimension )
            .setUniform( 'vMin',        vox.minBound )
            .setUniform( 'triCnt',      dtTriangles.rowLen )
            .setUniform( 'texTri',      dtTriangles.ref );

        GPGPU.compute( this.shVoxShell, this.dtShell, size );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Fill Voxel Shell
        this.shVoxFill
            .setUniform( 'vXZCount',    vox.xzCount )
            .setUniform( 'vDimension',  vox.dimension )
            .setUniform( 'tex',         this.dtShell.ref );

        GPGPU.compute( this.shVoxFill, this.dtSolid, size );

        console.timeEnd( 'Voxelizer_Compute' );
    }

    createDataTextures( vox ){
        console.time( 'Create_Voxel_Shell_Solid_DT' );
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Clean up existing textures
        if( this.dtShell ) this.dtShell.dispose();
        if( this.dtSolid ) this.dtSolid.dispose();

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // VOXEL SHELL
        // Data is laid out as 1 RGBA pixel per voxel.
        // XYZ = Average Triangle Normal Direction of triangles that intersect voxel
        // W   = Has Triangle: 0-No, 1:Yes
        // **NOTE** - Shell tex can be deleted once we have solid voxels computed

        this.dtShell = GLDataTexture.asFloat32( 1, vox.count, 4 ).upload();
        console.log( 'Shell DataTexture:', Util.byteSize( vox.count * 4 * 4 ) ); // 4 bytes * RGBA

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Voxel Fill
        // Takes the voxel shell & turns on all the voxels inside the shell
        // while leaving the outer voxels in offset.
        // The data is laid out as 1 R pixel per voxel, but using a Uint8 to 
        // save as much GPU memory as possible as a simple On/Off boolea is
        // all the data we really need.

        this.dtSolid = GLDataTexture.asUint8( 1, vox.count, 1 ).upload();

        console.log( 'Solid DataTexture:', Util.byteSize( vox.count ) ); 
        console.timeEnd( 'Create_Voxel_Shell_Solid_DT' );
    }

    // #endregion

    // #region DEBUGGING
    debugShell( mesh ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shDebugShell ){
            this.shDebugShell = GLShader.forTF( TF_DEBUG_SHELL );
        }

        // Set input which is the DataTexture
        this.shDebugShell.setUniform( 'tex', this.dtShell.ref );
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Translate the DataTexture to the Debug Mesh's Instance Buffer
        TransformFeedback.compute( this.app.renderer, this.shDebugShell, {
            to: mesh.geometry.attributes.inst
        });
    }
    
    debugSolid( mesh ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shDebugSolid ){
            this.shDebugSolid = GLShader.forTF( TF_DEBUG_SOLID );
        }

        // Set input which is the DataTexture
        this.shDebugSolid.setUniform( 'tex', this.dtSolid.ref );
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Translate the DataTexture to the Debug Mesh's Instance Buffer
        TransformFeedback.compute( this.app.renderer, this.shDebugSolid, {
            to: mesh.geometry.attributes.inst
        });
    }

    debugRawDataGPU(){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.dtShell ){ console.log( 'Shell DataTexture is null' ); return; }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Output the screen each pixel data row
        const f32 = GPGPU.readFloat32( this.dtShell );
        for( let i=0; i < f32.length; i+=4 ) console.log( f32[i+0],f32[i+1],f32[i+2],f32[i+3] );
    }

    debugVoxelShellCount(){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.dtShell ){ console.log( 'Shell DataTexture is null' ); return; }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Count how many voxels have been set to on
        const f32 = GPGPU.readFloat32( this.dtShell );
        let cnt=0;
        for( let i=0; i < f32.length; i+=4 ) if( f32[i+3] == 1 ) cnt++;
        
        console.log( 'Shell Voxels:', cnt );
    }
    // #endregion
}

// #region COMPUTE SHADER CODE

const GP_VOX_TRI = `#version 300 es
precision highp float;

// #region DATA
uniform float vCellSize;    // Size of a voxel cell
uniform int   vXZCount;     // How many voxels in one level
uniform ivec3 vDimension;   // Voxel chunk size, how many voxels in each axis
uniform vec3  vMin;         // Min Bounding for Voxel Chunk
uniform int   triCnt;       // How many triangles to test

// Datatexture storing 3xN RGB Float32 Data
// uniform highp sampler2D texTri; // Doesn't crash compiler but uniform gets treated as its not being used
uniform sampler2D texTri;

out vec4 outColor;
// #endregion

// #region INTERSECTION ////////////////////////////////////////////////////////////////

// Original : https://gist.github.com/yomotsu/d845f21e2e1eb49f647f
// Prototype Javascript Version : https://bitbucket.org/sketchpunk/sketchpunk.bitbucket.io/src/master/src/threejs/autoskinning/oito/geometry/Intersect.js

// int triangle_aabb( vec3 a, vec3 b, vec3 c, vec3 minBox, vec3 maxBox ){
int triangle_aabb( vec3 a, vec3 b, vec3 c, vec3 center, float halfLen ){
    float p0;
    float p1;
    float p2;
    float r;
    
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Compute box center and extents of AABoundingBox (if not already given in that format)
    
    // vec3 center = minBox * 0.5 + maxBox * 0.5;
    // vec3 extents = maxBox - center;
    vec3 extents = vec3( halfLen );

    // Translate triangle as conceptually moving AABB to origin
    vec3 v0 = a - center;
    vec3 v1 = b - center;
    vec3 v2 = c - center;
    
    // Compute edge vectors for triangle
    vec3 f0 = v1 - v0;
    vec3 f1 = v2 - v1;
    vec3 f2 = v0 - v2;
    
    // Test axes a00..a22 ( category 3 )
    vec3 a00 = vec3(      0, -f0[2],  f0[1] );
    vec3 a01 = vec3(      0, -f1[2],  f1[1] ); 
    vec3 a02 = vec3(      0, -f2[2],  f2[1] ); 
    vec3 a10 = vec3(  f0[2],      0, -f0[0] ); 
    vec3 a11 = vec3(  f1[2],      0, -f1[0] ); 
    vec3 a12 = vec3(  f2[2],      0, -f2[0] ); 
    vec3 a20 = vec3( -f0[1],  f0[0],      0 ); 
    vec3 a21 = vec3( -f1[1],  f1[0],      0 ); 
    vec3 a22 = vec3( -f2[1],  f2[0],      0 );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Axis Testing
    
    /*
    p0 = v0.dot( a00 );
    p1 = v1.dot( a00 );
    p2 = v2.dot( a00 );
    r  = extents[1] * Math.abs( f0[2] ) + extents[2] * Math.abs( f0[1] );
    if( Math.max( -Math.max( p0, p1, p2 ), Math.min( p0, p1, p2 ) ) > r ) return false;
    */
    
    vec3[9] aryAxis = vec3[9]( a00, a01, a02, a10, a11, a12, a20, a21, a22 ); // Axis Point
    vec3[9] aryEdge = vec3[9]( f0, f1, f2, f0, f1, f2, f0, f1, f2 ); // Triangle Vector Length Edges
    int[9] aryAA    = int[9]( 1, 1, 1, 0, 0, 0, 0, 0, 0 );  // First Axis Component
    int[9] aryBB    = int[9]( 2, 2, 2, 2, 2, 2, 1, 1, 1 );  // Second Axis Component

    for ( int i=0; i < 9; i++ ){
        // -----------------------------------
        // Project all 3 vertices of the triangle onto the seperating axis
        p0 = dot( v0, aryAxis[i] );
        p1 = dot( v1, aryAxis[i] );
        p2 = dot( v2, aryAxis[i] );

        // -----------------------------------
        // Project the aabb onto the seperating axis
        r = extents[ aryAA[i] ] * 
            abs( aryEdge[i][ aryBB[i] ] ) + 
            extents[ aryBB[i] ] *
            abs( aryEdge[i][ aryAA[i] ] );

        // -----------------------------------
        // Axis is a separating axis, then false
        // Actual test, basically see if either of the most extreme of the triangle points intersects r.
        // Points of the projected triangle are outside the projected half-length of the aabb
        // the axis is seperating and we can exit.
        if( max( 
             -max( p0, max( p1, p2 ) ), 
              min( p0, min( p1, p2 ) ) 
          ) > r 
        ) return 0;
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Test the three axes corresponding to the face normals of AABB b (category 1). Exit if...
    // ... [-extents.x, extents.x] and [min(v0.x,v1.x,v2.x), max(v0.x,v1.x,v2.x)] do not overlap

    if( max( v0.x, max( v1.x, v2.x ) ) < -extents.x || 
        min( v0.x, min( v1.x, v2.x ) ) > extents.x
    ) return 0;

    // ... [-extents.y, extents.y] and [min(v0.y,v1.y,v2.y), max(v0.y,v1.y,v2.y)] do not overlap
    if( max( v0.y, max( v1.y, v2.y ) ) < -extents.y || 
        min( v0.y, min( v1.y, v2.y ) ) > extents.y
    ) return 0;

    // ... [-extents.z, extents.z] and [min(v0.z,v1.z,v2.z), max(v0.z,v1.z,v2.z)] do not overlap    
    if( max( v0.z, max( v1.z, v2.z ) ) < -extents.z || 
        min( v0.z, min( v1.z, v2.z ) ) > extents.z
    ) return 0;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Intersection AABB-Plane
    // Test separating axis corresponding to triangle face normal (category 2)
    // Face Normal is -ve as Triangle is clockwise winding (and XNA uses -z for into screen)

    vec3 planeNorm   = normalize( cross( f1, f0 ) );
    float planeConst = dot( planeNorm, a );

    r = extents[0] * abs( planeNorm[0] ) +
        extents[1] * abs( planeNorm[1] ) +
        extents[2] * abs( planeNorm[2] );

    float s = abs( dot( planeNorm, center ) - planeConst );
    return ( s <= r )? 1 : 0;
}
// #endregion

// #region TRI DATA //////////////////////////////////////////////////////////////////

struct Tri{
    vec3 a;
    vec3 b;
    vec3 c;
};

Tri getTriAt( int i ){
    return Tri(
        texelFetch( texTri, ivec2( 0, i ), 0 ).rgb,
        texelFetch( texTri, ivec2( 1, i ), 0 ).rgb,
        texelFetch( texTri, ivec2( 2, i ), 0 ).rgb
    );
}

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
// #endregion

void main() {
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Voxel Position
    int   idx     = int( gl_FragCoord.y ); // Single Pixel width, so Y is row index
    ivec3 coord   = idxCoord( idx );
    vec3 voxMid   = coordMidPoint( coord );

    // outColor = vec4( gl_FragCoord.xy, 9.0, 10.0 ); // Float32 Data
    // outColor = vec4( gl_FragCoord.xy/255.0, 9.0/255.0, 10.0/255.0 ); // Uint8 Data
    // outColor = vec4( gl_FragCoord.xy, 0.0, triCnt );
    // outColor = vec4( coord, idx);

    // Tri t     = getTriAt( 0 );
    // outColor = vec4( t.c, 0);

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Tri t;
    int isHit;
    float halfLen = vCellSize * 0.5;
    float tCnt    = 0.0;
    vec3  dir     = vec3( 0.0 );

    for( int i=0; i < triCnt; i++ ){
        t     = getTriAt( i );
        isHit = triangle_aabb( t.a, t.b, t.c, voxMid, halfLen );

        if( isHit == 1 ){
            // Compute average normal direction
            dir += normalize( cross( t.b-t.a, t.c-t.a ) );
            tCnt++;
        }
    }

    outColor = ( tCnt < 0.1 )? vec4( 0.0 ) : vec4( normalize( dir / tCnt ), 1.0 );
}`;

const GP_VOX_FILL = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform int   vXZCount;         // How many voxels in one level
uniform ivec3 vDimension;       // Voxel chunk size, how many voxels in each axis
uniform sampler2D tex;          // XYZ: Vox Normal, W

out vec4 outColor;
// #endregion

// #region VOXEL ////////////////////////////////////////////////////////////////

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


// #region TRAVERAL /////////////////////////////////////////////////////////////
const float DOTLMT = -0.1;

const vec3  FWD    = vec3( 0.0, 0.0,  1.0 );
const vec3  BAK    = vec3( 0.0, 0.0, -1.0 );

const vec3  RIT    = vec3(  1.0, 0.0, 0.0 );
const vec3  LFT    = vec3( -1.0, 0.0, 0.0 );

// Traverse voxel axis checking if an empty voxel exists
// between an exit and entry voxel. This is done by testing
// the voxel's average triangle normal. If it does not, 
// the voxel lives outside the shell instead of inside.
bool taverseAxis( in ivec3 coord, vec3 nDir, vec3 pDir, int axis ){
    ivec3 c     = coord;    // Coordinate to modify in loops
    bool hasHit = false;  
    vec4 p;
    int idx;
    
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // NEGATIVE DIRECTION
    for( int i = coord[axis]-1; i >= 0; i-- ){
        c[axis] = i;
        idx     = coordIdx( c );
        p       = texelFetch( tex, ivec2( 0, idx ), 0 );

        if( p.w > 0.5 ){
            if( dot( normalize( p.xyz ), nDir ) > DOTLMT ) hasHit = true;
            break;
        }
    }

    if( !hasHit ) return false; // Exit early on failure

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // POSITIVE DIRECTION
    hasHit = false;
    for( int i = coord[axis]+1; i < vDimension[axis]; i++ ){
        c[axis] = i;
        idx     = coordIdx( c );
        p       = texelFetch( tex, ivec2( 0, idx ), 0 );

        if( p.w > 0.5 ){
            if( dot( normalize( p.xyz ), pDir ) > DOTLMT ) hasHit = true;
            break;
        }
    }

    if( !hasHit  ) return false;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    return true;
}
// #endregion

// const float iOn    = 1.0/255.0; // Store Byte of value of 1 using float form
const float iOn    = 1.0; // Using float with 1 or 0 works fine in this use case

void main(){
    int idx  = int( gl_FragCoord.y );                   // Single Pixel width, so Y is row index
    vec4 px  = texelFetch( tex, ivec2( 0, idx ), 0 );   // XYZ: Triangle Normal, W: Has Triangle 0-No, 1-Yes
    outColor = vec4( 0.0 );                             // Default is off

    if( px.a > 0.5 ){
        outColor = vec4( iOn ); // Voxel is already active, Save as is
    }else{
        // Empty voxel will only be active if its exists between
        // an Entry and Exit Voxel.
        ivec3 coord = idxCoord( idx );
        
        // ivec3 c     = coord;
        // int idx;
        // vec4 p;
        // float d;
        
        // // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // // BACK EXIT TEST
        // bool hasBak = false;
        // for( int i = c.z-1; i >= 0; i-- ){
        //     coord.z = i;
        //     idx     = coordIdx( coord );
        //     p       = texelFetch( tex, ivec2( 0, idx ), 0 );

        //     if( p.w > 0.5 ){
        //         if( dot( normalize( p.xyz ), BAK ) > DOTLMT ) hasBak = true;
        //         break;
        //     }
        // }

        // if( !hasBak ) return; // Exit early on failure

        // // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // // FORWARD ENTRANCE TEST
        // bool hasFwd = false;
        // for( int i = c.z+1; i < vDimension.z; i++ ){
        //     coord.z = i;
        //     idx     = coordIdx( coord );
        //     p       = texelFetch( tex, ivec2( 0, idx ), 0 );

        //     if( p.w > 0.5 ){
        //         if( dot( normalize( p.xyz ), FWD ) > DOTLMT ) hasFwd = true;
        //         break;
        //     }
        // }

        // if( !hasFwd  ) return;

        // ** NOTE **
        // Originally only doing test on the Z Axis seemed to work
        // but at heigher resolutions there are some small gaps found.
        // Testing on the X and Z axis seems to do the job of filling
        // in the gaps. The original paper mention they did all 3 axis
        // so if there is a future problem with gaps add the Y axis checks
    
        // X AXIS CHECK
        if( taverseAxis( coord, LFT, RIT, 0 ) ){
            outColor = vec4( iOn );
            return;
        }

        // Z AXIS CHECK
        if( taverseAxis( coord, BAK, FWD, 2 ) ){
            outColor = vec4( iOn );
            return;
        }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Success
        // outColor = vec4( iOn );
    }
}`;

// #endregion

// #region DEBUG COMPUTE SHADERS

const TF_DEBUG_SHELL = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform highp sampler2D tex;
flat out float to;
// #endregion

void main(){
    int idx = gl_VertexID;
    vec4 px = texelFetch( tex, ivec2( 0, idx ), 0 );
    to = px.w;
}`;

const TF_DEBUG_SOLID = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
uniform highp sampler2D tex;
flat out float to;
// #endregion

void main(){
    int idx  = gl_VertexID;
    float px = texelFetch( tex, ivec2( 0, idx ), 0 ).r;
    to = px;
}`;

// #endregion