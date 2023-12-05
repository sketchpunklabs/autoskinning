import GLContext from './GLContext.js';

export default class GPGPU{
    static frameBuffer = null;

    static compute( sh, dt, viewPort ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Initialize
        const gl = GLContext.ctx;
        this.preCompute( sh, dt );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Setup Shader
        gl.useProgram( sh.prog );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Execute
        gl.drawArrays( gl.TRIANGLES, 0, 3 );  // FullScreen Triangle, just 3 vertices

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Cleanup
        this.postCompute( viewPort );
    }

    static preCompute( sh, dt ){
        const gl = GLContext.ctx;
        if( !this.frameBuffer ) this.frameBuffer = gl.createFramebuffer();
        
        gl.viewport( 0, 0, dt.colLen, dt.rowLen );              // Set size to what the texture size is
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
}
