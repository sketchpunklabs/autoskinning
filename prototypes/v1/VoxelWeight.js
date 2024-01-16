// #region IMPORTS
import { GLContext, GPGPU, TransformFeedback, GLShader, GLBuffer, GLDataTexture } from '../../lib/gl/index.js';
import Util from './Util.js';
// #endregion

export default class VoxelWeight{
    // #region MAIN
    voxDivision = 0;
    vertCount   = 0;
    dtWeight    = [];
    dtIndex     = [];

    bfVoxWeight = [];
    bfVoxIndex  = [];
    
    shAccum     = null;
    shCompute   = null;
    shClear     = null;
    shDebug     = null;

    shInstDebug = null;

    index       = 0;
    geo         = null;
    
    constructor( app ){
        this.app        = app;
        this.shAccum    = GLShader.forTF( TF_ACCUM );
        this.shCompute  = GLShader.forTF( TF_COMPUTE );
        this.shClear    = GLShader.forTF( TF_CLEAR );

        this.shVoxAccum = GLShader.forTF( TF_VOX_ACCUM );
    }
    // #endregion

    // #region METHODS
    clear( geo, vox ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.index = 0;
        this.geo   = geo;

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Create new buffers if needed
        if( this.voxDivision !== vox.division ){
            this.voxDivision = vox.division;
            this.createVoxBuffers( vox.count );
        }else{
            TransformFeedback.compute( this.app.renderer, this.shClear, { to : this.bfVoxIndex[ 0 ] });
            TransformFeedback.compute( this.app.renderer, this.shClear, { to : this.bfVoxWeight[ 0 ] });
        }

        const vCnt = geo.attributes.position.count;
        if( vCnt !== this.vertCount || this.dtWeight.length == 0 ){
            this.vertCount = vCnt;
            this.createBuffers( vCnt );
            return;
        }
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.time( 'Clear_Voxel_Weight_GLBUF' );

        TransformFeedback.compute( this.app.renderer, this.shClear, { to : this.dtIndex[ 0 ] });
        TransformFeedback.compute( this.app.renderer, this.shClear, { to : this.dtWeight[ 0 ] });

        console.timeEnd( 'Clear_Voxel_Weight_GLBUF' );
    }
    // #endregion

    // #region COMPUTE

    accumlate( vox, dtCrawl, boneIdx ){
        console.time( 'Accumlate_Voxel_Weight' );

        // Ping-Pong Indices for Read - Write Buff Assignment
        const i  = this.index;
        const ii = ( i + 1 ) % 2;

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.shAccum
            .setUniform( 'vCellSize', vox.cellSize )
            .setUniform( 'vXZCount', vox.xzCount )
            .setUniform( 'vDimension', vox.dimension )
            .setUniform( 'vMin', vox.minBound )
            .setUniform( 'boneIdx', boneIdx )
            .setUniform( 'tex', dtCrawl.ref );

        TransformFeedback.compute( this.app.renderer, this.shAccum, {
            position    : this.geo.attributes.position,
            inWeight    : this.dtWeight[ i ],
            inIndex     : this.dtIndex[ i ],
            outWeight   : this.dtWeight[ ii ],
            outIndex    : this.dtIndex[ ii ],
        });

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.shVoxAccum
            .setUniform( 'boneIdx', boneIdx )
            .setUniform( 'tex', dtCrawl.ref );

        TransformFeedback.compute( this.app.renderer, this.shVoxAccum, {
            position    : this.geo.attributes.position,
            inWeight    : this.bfVoxWeight[ i ],
            inIndex     : this.bfVoxIndex[ i ],
            outWeight   : this.bfVoxWeight[ ii ],
            outIndex    : this.bfVoxIndex[ ii ],
        });

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.index = ii; // Most recent data is stored at this index
        console.timeEnd( 'Accumlate_Voxel_Weight' );
    }

    computeSkinWeights( smooth=1.0, minWeight=0.0, maxDist  ){
        console.time( 'Compute_Vertex_Weight' );

        console.log( 'SkinWeight', maxDist, minWeight );
        const i = this.index;
        this.shCompute
            .setUniform( 'nSmooth', smooth )
            .setUniform( 'vMaxDist', maxDist )
            .setUniform( 'minWeight', minWeight );

        TransformFeedback.compute( this.app.renderer, this.shCompute, {
            inWeight    : this.dtWeight[ i ],
            inIndex     : this.dtIndex[ i ],

            outWeight   : this.geo.attributes.skinWeight,
            outIndex    : this.geo.attributes.skinIndex,
        });

        console.timeEnd( 'Compute_Vertex_Weight' );
        console.log( 'Smoothing', smooth, maxDist );

        // this.debugRawIndexGPUData();
    }

    createBuffers( vertCnt ){
        console.time( 'Create_Voxel_Weight_GLBUF' );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Get rid of previous buffers
        if( this.dtWeight.length > 0 ){
            this.dtWeight[0].dispose();
            this.dtWeight[1].dispose();
            this.dtWeight.length = 0;

            this.dtIndex[0].dispose();
            this.dtIndex[1].dispose();
            this.dtIndex.length = 0;
        }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Create Array with initial data, then create 4 GL Buffers with it
        const buf = new Float32Array( 4 * vertCnt ).fill( -1 );
        this.dtWeight.push(
            GLBuffer.asFloat32( 4, false ).set( buf ),
            GLBuffer.asFloat32( 4, false ).set( buf ),
        );

        this.dtIndex.push(
            GLBuffer.asFloat32( 4, false ).set( buf ),
            GLBuffer.asFloat32( 4, false ).set( buf ),
        );

        // Creat Blank Buffers --- Maybe use compute shader to fill in initial data??
        // // 4 Bytes * XYZW * PER_VERTEX
        // this.dtWeight.push(
        //     GLBuffer.asFloat32( 3, false ).set( 4 * 4 * vertCnt ),
        //     GLBuffer.asFloat32( 3, false ).set( 4 * 4 * vertCnt ),
        // );

        // this.dtIndex.push(
        //     GLBuffer.asFloat32( 3, false ).set( 4 * 4 * vertCnt ),
        //     GLBuffer.asFloat32( 3, false ).set( 4 * 4 * vertCnt ),
        // );


        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.log( 'Weight GLBuffers GPU Memory:', Util.byteSize( 4 * 4 * vertCnt * 4 ) ); // 4Bytes * XYZW * PER_VERTEX 2 * 4 BUFFERS
        console.timeEnd( 'Create_Voxel_Weight_GLBUF' );
    }

    createVoxBuffers( cnt ){
        console.time( 'Create_Voxel_Accum_GLBUF' );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Get rid of previous buffers
        if( this.bfVoxWeight.length > 0 ){
            this.bfVoxWeight[0].dispose();
            this.bfVoxWeight[1].dispose();
            this.bfVoxWeight.length = 0;

            this.bfVoxIndex[0].dispose();
            this.bfVoxIndex[1].dispose();
            this.bfVoxIndex.length = 0;
        }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Create Array with initial data, then create 4 GL Buffers with it
        const buf = new Float32Array( 4 * cnt ).fill( -1 );
        this.bfVoxWeight.push(
            GLBuffer.asFloat32( 4, false ).set( buf ),
            GLBuffer.asFloat32( 4, false ).set( buf ),
        );

        this.bfVoxIndex.push(
            GLBuffer.asFloat32( 4, false ).set( buf ),
            GLBuffer.asFloat32( 4, false ).set( buf ),
        );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        console.log( 'Voxel_Accum GLBuffers GPU Memory:', Util.byteSize( 4 * 4 * cnt * 4 ) ); // 4Bytes * XYZW * PER_VOX * 4 BUFFERS
        console.timeEnd( 'Create_Voxel_Accum_GLBUF' );
    }

    // #endregion

    // #region DEBUGGING
    debugMesh( mesh ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shDebug ){
            this.shDebug = GLShader.forTF( TF_DEBUG );
        }
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        const i   = this.index;
        const geo = mesh.geometry;

        TransformFeedback.compute( this.app.renderer, this.shDebug, {
            inWeight    : this.dtWeight[ i ],
            inIndex     : this.dtIndex[ i ],
            outWeight   : this.geo.attributes.skinWeight,
            outIndex    : this.geo.attributes.skinIndex,
        });
    }

    debugVoxels( mesh, maxDist, dtCrawl ){
        const geo = mesh.geometry;
        const i   = this.index;

        mesh.material.vMaxDist = maxDist;

        // // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shInstDebug ){
            this.shInstDebug = GLShader.forTF( TF_INST_DEBUG );
        }
        this.shInstDebug
            .setUniform( 'tex', dtCrawl.ref );

        // // Set max distance on debug mesh material
        // mesh.material.uniforms.vMaxDist.value = maxDist;
        
        // Translate the DataTexture to the Debug Mesh's Instance Buffer
        TransformFeedback.compute( this.app.renderer, this.shInstDebug, {
            to: geo.attributes.inst
        });

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.shDebug ){
            this.shDebug = GLShader.forTF( TF_DEBUG );
        }

        TransformFeedback.compute( this.app.renderer, this.shDebug, {
            inWeight    : this.bfVoxWeight[ i ],
            inIndex     : this.bfVoxIndex[ i ],
            outWeight   : geo.attributes.skinWeight,
            outIndex    : geo.attributes.skinIndex,
        });
    }

    debugRawIndexGPUData(){
        const t = this.dtIndex[ this.index ].read();
        for( let i=0; i < t.length; i+=4 ){
            console.log( t[i+0], t[i+1], t[i+2], t[i+3] );
        }
    }

    debugRawWeightGPUData(){
        const t = this.dtWeight[ this.index ].read();
        for( let i=0; i < t.length; i+=4 ){
            console.log( t[i+0], t[i+1], t[i+2], t[i+3] );
        }
    }

    debugRawVoxIndexGPUData(){
        const t = this.bfVoxIndex[ this.index ].read();
        for( let i=0; i < t.length; i+=4 ){
            console.log( t[i+0], t[i+1], t[i+2], t[i+3] );
        }
    }

    debugRawVoxWeightGPUData(){
        const t = this.bfVoxWeight[ this.index ].read();
        for( let i=0; i < t.length; i+=4 ){
            console.log( t[i+0], t[i+1], t[i+2], t[i+3] );
        }
    }
    // #endregion
}


// #region COMPUTE SHADER CODE

const TF_ACCUM = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
layout(location=0) in vec3 position;
layout(location=1) in vec4 inWeight;
layout(location=2) in vec4 inIndex;

uniform float vCellSize;    // Size of a voxel cell
uniform int   vXZCount;     // How many voxels in one level
uniform ivec3 vDimension;   // Voxel chunk size, how many voxels in each axis
uniform vec3  vMin;         // Min Bounding for Voxel Chunk

uniform float boneIdx;
uniform highp sampler2D tex;

flat out vec4 outWeight;
flat out vec4 outIndex;
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

ivec3 posCoord( vec3 pos ){
    return ivec3( floor( ( pos - vMin ) / vCellSize ) );
}
// #endregion

void main(){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    ivec3 coord = posCoord( position );
    int   idx   = coordIdx( coord );
    float px    = texelFetch( tex, ivec2( 0, idx ), 0 ).r;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    outWeight = inWeight;
    outIndex  = inIndex;

    // if voxel has no crawl distance, exit early
    if( px < 0.0 ) return;

    // Add distance from vertex to voxel modpoint
    // to the total crawl distance for the actual
    // distance from vertex to bone voxel
    // EX: vertexCrawlDistance = voxelCrawlDistance + ( vertexPosition - voxelPosition )
    vec3 vMid  = coordMidPoint( coord );
    px         = px + length( position - vMid );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    float maxDist = -1.0;
    int   maxIdx  = -1;

    for( int i=0; i < 4; i++ ){
        // ----------------------------------
        // Find an empty spot in the vertex 
        // weights data to place
        if( outWeight[i] < 0.0 ){
            outWeight[i] = px;
            outIndex[i]  = boneIdx;
            return;
        }

        // ----------------------------------
        // Incase there isn't an empty spot, lets
        // keep track of the furthest possible bone
        // for this vertex
        if( outWeight[i] > maxDist  ){
            maxDist = outWeight[i];
            maxIdx  = i;
        }
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // If no spot is available, If the new bone is closer
    // to the vertex then the furthest set bone, then
    // replace it.
    if( px < maxDist && maxIdx != -1 ){
        outWeight[ maxIdx ] = px;
        outIndex[ maxIdx ]  = boneIdx;
    }
}
`;

const TF_VOX_ACCUM = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
layout(location=0) in vec4 inWeight;
layout(location=1) in vec4 inIndex;

uniform float boneIdx;
uniform highp sampler2D tex;

flat out vec4 outWeight;
flat out vec4 outIndex;
// #endregion

void main(){
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    int   idx   = gl_VertexID; 
    float px    = texelFetch( tex, ivec2( 0, idx ), 0 ).r;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    outWeight = inWeight;
    outIndex  = inIndex;

    // if voxel has no crawl distance, exit early
    if( px < 0.0 ) return;

    // Add distance from vertex to voxel modpoint
    // to the total crawl distance for the actual
    // distance from vertex to bone voxel
    // EX: vertexCrawlDistance = voxelCrawlDistance + ( vertexPosition - voxelPosition )
    // vec3 vMid  = coordMidPoint( coord );
    // px         = px + length( position - vMid );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    float maxDist = -1.0;
    int   maxIdx  = -1;

    for( int i=0; i < 4; i++ ){
        // ----------------------------------
        // Find an empty spot in the vertex 
        // weights data to place
        if( outWeight[i] < 0.0 ){
            outWeight[i] = px;
            outIndex[i]  = boneIdx;
            return;
        }

        // ----------------------------------
        // Incase there isn't an empty spot, lets
        // keep track of the furthest possible bone
        // for this vertex
        if( outWeight[i] > maxDist  ){
            maxDist = outWeight[i];
            maxIdx  = i;
        }
    }

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // If no spot is available, If the new bone is closer
    // to the vertex then the furthest set bone, then
    // replace it.
    if( px < maxDist && maxIdx != -1 ){
        outWeight[ maxIdx ] = px;
        outIndex[ maxIdx ]  = boneIdx;
    }
}
`;

const TF_COMPUTE = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
layout(location=0) in vec4 inWeight;
layout(location=1) in vec4 inIndex;

uniform float minWeight;
uniform float vMaxDist;
uniform float nSmooth;

flat out vec4 outWeight;
flat out vec4 outIndex;
// #endregion

vec4 norm( vec4 v ){
    // float sum = v.x + v.y + v.z + v.w;
    float sum = dot( v, vec4( 1.0 ) ); // Same results as above

    return ( sum > 0.0 )? v / sum : v;
}

void main(){
    highp vec4 fWgt = vec4( 0.0 );
    highp vec4 fIdx = vec4( 0.0 );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ACCUM RESULTS ONLY HAS VERTEX CRAW DISTANCE, NOT NORMALIZED DISTANCE
    // normalizedDist = ( voxelBoneDist + ( vertexPos - voxelMidPos ) ) / MAX_DISTANCE;
    vec4 dn  = inWeight / vMaxDist; // Normalized Distance
    
    //vec4 wgt = 1.0 - dn;
    vec4 wgt = 1.0 / ( 
        ( 1.0 - nSmooth ) * dn +
        nSmooth * ( dn * dn )
    );

    wgt = wgt * wgt;    // Pow( wgt, 2 )
    wgt = norm( wgt );  // Sum of 1 Normalization

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // FINAL RESULTS : Filter & Shift
    // float wMin = 0.0;
    int   j    = 0;
    for( int i=0; i < 4; i++ ){
        if( wgt[i] >= minWeight  ){ //&& ( int( inIndex[i] ) == 1 || int( inIndex[i] ) == 0 )
            fWgt[j] = wgt[i];
            fIdx[j] = inIndex[i];
            j++;
        }
    }

    fWgt = norm( fWgt );


    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ACCUM RESULTS ONLY HAS VERTEX CRAW DISTANCE, NOT NORMALIZED DISTANCE
    // normalizedDist = ( voxelBoneDist + ( vertexPos - voxelMidPos ) ) / MAX_DISTANCE;
    // vec4 idx = inIndex;
    // vec4 dn  = inWeight / vMaxDist;

    // // dn = max( 1.0 - dn, vec4( 0.0 ) );
    // // dn = vec4( 1.0 );

    // vec4 wgt = 1.0 / ( 
    //     ( 1.0 - nSmooth ) * dn +
    //     nSmooth * ( dn * dn )
    // );
    
    // wgt = wgt * wgt; // Pow( wgt, 2 )
    // wgt = normalize( wgt );

    // float minWeight = 0.0;

    // for( int i=0; i < 4; i++ ){
    //     if( wgt[i] < minWeight ){
    //         wgt[i] = 0.0;
    //         idx[i] = 0.0;
    //     }
    // }

    // wgt = normalize( wgt );

    // wgt = 1.0 - dn;
    // wgt = normalize( wgt );
    // wgt = dn;    

    // // float nSmooth = 0.5;

    // // zero out any negative numbers
    // vec4 dn  = max( inWeight, vec4( 0.0 ) );
    
    // // apply smoothing to the normalized distances
    // // weight = ( 1 / ( (1-smooth)*dn + smooth*(dn^2) ) )^2
    // // (1 / ((1 - this.smooth) * dist + this.smooth * (dist ** 2))) ** 2;
    
    // vec4 wgt = 1.0 / ( 
    //     ( 1.0 - nSmooth ) * dn +
    //     nSmooth * ( dn * dn )
    // );

    // wgt = wgt * wgt; // Pow( wgt, 2 )
    // wgt = normalize( wgt );

    // float wSum = 0.0;
    // float wCnt = 0.0;
    // for( let i=0; i < 4; i++ ){
    //     if( wgt[i] > 0.0 ){
    //         wSum += wgt[i];
    //         wCnt ++;
    //     }
    // }

    // Shift all the Weights to the start of the voxel.
    // wgt.forEach((v, i) => {
    //     if (v != 0) {
    //         outWeights[i] = v;
    //         outIndices[i] = bones[i].boneIdx;
    //     }
    // });

    // wgt = dn; // vec4( 1.0, 1.0, 0.0, 0.0 );

    // highp vec4 fWgt = vec4( 0.0 );
    // highp vec4 fIdx = vec4( 0.0 );
    // int  j = -1;
    // float wMin = 0.1;
    // float wSum = 0.0;
    // for( int i=0; i < 4; i++ ){
    //     if( wgt[i] >= wMin  ){ //&& ( int( inIndex[i] ) == 1 || int( inIndex[i] ) == 0 )
    //         j++;
    //         fWgt[j] = wgt[i];
    //         fIdx[j] = inIndex[i];
    //         wSum    += wgt[i];
    //     }
    // }

    // fWgt = norm( fWgt );
    // fWgt = normalize( fWgt );

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    outWeight = fWgt;
    // outWeight = normalize( vec4( 1.0, 1.0, 0.0, 0.0 ) );
    // outWeight = vec4( 0.5, 0.5, 0.0, 0.0 );
    // outWeight = vec4( 1.0/2.0, 1.0/2.0, 0.0, 0.0 );
    // outWeight = vec4( 1.0, 1.0, 0.0, 0.0 ) / 2.0;

    outIndex  = fIdx;

    // TEST - All verts controlled by first bone
    // -- Renders as expected
    // outWeight = vec4( 1.0, 0.0, 0.0, 0.0 );
    // outIndex  = vec4( 0.0 );

    // TEST - All verts controlled by nothing
    // Mesh doesn't render, might make sense
    // that the weighed matrix is all zeros
    // which kills the vertex
    // outWeight = vec4( 0.0, 0.0, 0.0, 0.0 );
    // outIndex  = vec4( 0.0 );

    // TEST - All verts controlled by first bone
    // Renders BUT THERE IS NO BONE 100??????
    // Is Threejs doing index checks in the shader???
    // outWeight = vec4( 1.0, 0.0, 0.0, 0.0 );
    // outIndex  = vec4( 100.0 );
}
`;

const TF_CLEAR = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
flat out vec4 to;
// #endregion

void main(){
    to = vec4( -1.0 );
}`;

// #endregion

// #region DEBUG COMPUTE SHADERS

const TF_DEBUG = `#version 300 es
precision highp float;

// #region DATA ////////////////////////////////////////////////////////////////
layout(location=0) in vec4 inWeight;
layout(location=1) in vec4 inIndex;

flat out vec4 outWeight;
flat out vec4 outIndex;
// #endregion

void main(){
    outWeight = inWeight;
    outIndex  = inIndex;
}`;

const TF_INST_DEBUG = `#version 300 es
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