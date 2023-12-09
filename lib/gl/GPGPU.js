import GLContext from './GLContext.js';

export default class GPGPU{
    // #region MAIN
    static frameBuffer = null;

    static compute( sh, dt, viewPort ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Initialize
        const gl = GLContext.ctx;
        this.preCompute( sh, dt );
        this.loadShader( sh );        

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Execute
        gl.drawArrays( gl.TRIANGLES, 0, 3 );  // FullScreen Triangle, just 3 vertices

        // const results = new Float32Array( dt.colLen * dt.rowLen * 4 );
        // gl.readPixels( 0, 0, dt.colLen, dt.rowLen, gl.RGBA, gl.FLOAT, results );
        // console.log( results );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Cleanup
        this.postCompute( viewPort );
    }
    // #endregion 

    // #region LOADERS
    static loadShader( sh ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Turn on shader
        const gl = GLContext.ctx;
        gl.useProgram( sh.prog );  

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Pass uniform data to shader
        let texSlot = 0;
        for( const u of Object.values( sh.uniforms ) ){

            // ---------------------------------
            if( u.value === null ){
                console.log( 'GPGPU.loadShader - Uniform value is null : ', u );
                continue;
            }

            // ---------------------------------
            switch( u.type ){
                case 'float'     : gl.uniform1f( u.loc, u.value ); break;
                case 'vec3'      : gl.uniform3fv( u.loc, u.value ); break;
                case 'int'       : gl.uniform1i( u.loc, u.value ); break;
                case 'ivec3'     : gl.uniform3iv( u.loc, u.value ); break;
                case 'uint'      : gl.uniform1ui( u.loc, u.value ); break;
                case 'sampler2D' : 
                    gl.uniform1i( u.loc, texSlot );             // Which slot for texture uniform to use
                    gl.activeTexture( gl.TEXTURE0 + texSlot );  // Activate Texture Slot
                    gl.bindTexture( gl.TEXTURE_2D, u.value );   // Bind Texture  
                    texSlot++; // Increment for next possible texture
                break;

                default: console.log( 'GPGPU.loadShader - Uniform type unknown : ', u.type ); break;
            }
        }
    }
    
    // #endregion

    // #region COMPUTE EVENTS
    static preCompute( sh, dt ){
        const gl = GLContext.ctx;
        if( !this.frameBuffer ) this.frameBuffer = gl.createFramebuffer();
        
        gl.viewport( 0, 0, dt.colLen, dt.rowLen );              // Set size to what the texture size is
        gl.bindVertexArray( null );                             // 3JS Leaves this unbound, close it to not break things
        gl.bindFramebuffer( gl.FRAMEBUFFER, this.frameBuffer ); // Set frame buffer

        // Set texture to store the data in
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dt.ref, 0 );
    }

    static postCompute( viewPort ){
        const gl = GLContext.ctx;
        
        gl.useProgram( null );                          // Clear shader
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );     // Return framebuffer back
        gl.viewport( 0, 0, viewPort[0], viewPort[1] );  // Reset viewport back to its original size
    }
    // #endregion

    // #region READERS

    static readFloat32( dt ){
        const gl = GLContext.ctx;

        // Bind Texture as framebuffer color attachment
        gl.bindFramebuffer( gl.FRAMEBUFFER, this.frameBuffer );
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dt.ref, 0 );

        // Read Data Out
        const results = new Float32Array( dt.colLen * dt.rowLen * 4 );
        gl.readPixels( 0, 0, dt.colLen, dt.rowLen, gl.RGBA, gl.FLOAT, results );

        // Return framebuffer back
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );     
        return results;
    }

    static readUint8( dt ){
        const gl = GLContext.ctx;

        // Bind Texture as framebuffer color attachment
        gl.bindFramebuffer( gl.FRAMEBUFFER, this.frameBuffer );
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dt.ref, 0 );

        // Read Data Out
        const results = new Uint8Array( dt.colLen * dt.rowLen * 4 );
        gl.readPixels( 0, 0, dt.colLen, dt.rowLen, gl.RGBA, gl.UNSIGNED_BYTE, results );

        // Return framebuffer back
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );     
        return results;
    }

    // #endregion
}

          // TEST - Read the Texture data back
        
        
        // Uint8
//         const results = new Uint8Array( dt.colLen * dt.rowLen * 4 );
//         gl.readPixels( 0, 0, dt.colLen, dt.rowLen, gl.RGBA, gl.UNSIGNED_BYTE, results );

//         for( let i=0; i < results.length; i+=4 ){
//             console.log( Math.floor(results[i+0]), Math.floor(results[i+1]), results[i+2], results[i+3] );
//         }

