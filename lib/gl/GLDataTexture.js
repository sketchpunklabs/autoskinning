import GLContext from './GLContext.js';

export default class GLDataTexture{
    // #region MAIN
    ref            = null;  // GL Reference to GL Buffer
    colLen         = 0;     // Pixel Width
    rowLen         = 0;     // Pixel Height
    vecSize        = 0;     // How many pixel channels: 4 is max
    internalFormat = 0;     // Format of channel data
    format         = 0;     // Channel format: RB, RGB, RGBA
    type           = 0;
    data           = null;  // Raw Buffer Data

    constructor( colLen=1, rowLen=2, vecSize=3 ){
        this.colLen  = colLen;
        this.rowLen  = rowLen;
        this.vecSize = vecSize;
    }
    
    dispose(){
        if( this.ref ) GLContext.ctx.deleteTexture( this.ref );
        this.gl = null;
    }
    // #endregion

    // #region METHODS
    set( idx, ...args ){
        let ii = idx * this.colLen * this.vecSize;
        let c  = 0;
        for( let a of args ){
            for( let i of a ) this.data[ ii++ ] = i;

            // Prevent writing into next row
            if( ++c >= this.colLen ) break;
        }

        return this;
    }

    setRaw( idx, ...args ){
        let ii = idx * this.colLen * this.vecSize;
        for( let a of args ) this.data[ ii++ ] = a;
        return this;
    }

    upload(){
        if( !this.ref ){
            this._build();
        }else{
            const gl = GLContext.ctx;
            gl.bindTexture( gl.TEXTURE_2D, this.ref );
            gl.texSubImage2D( gl.TEXTURE_2D, 
                0, 0, 0, 
                this.colLen, this.rowLen, 
                this.format, this.type, 
                this.data
            );
            gl.bindTexture( gl.TEXTURE_2D, null );
        }

        return this;
    }
    // #endregion

    // #region HELPERS
    _build(){
        // Create & Bind
        const gl  = GLContext.ctx;
        const tex = gl.createTexture();
        gl.bindTexture( gl.TEXTURE_2D, tex );
        
        // No mips & no filtering
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE );

        // Data might not be 4 byte aligned, so set reading by 1 byte a time
        gl.pixelStorei( gl.UNPACK_ALIGNMENT, 1 );

        // Initialize Testure buffer with Data
        gl.texImage2D( gl.TEXTURE_2D, 0, 
            this.internalFormat, 
            this.colLen, this.rowLen, 0,
            this.format, 
            this.type,
            this.data,
        );

        gl.bindTexture( gl.TEXTURE_2D, null );
        this.ref = tex;
    }
    // #endregion

    // #region STATIC BUILDERS
    static asFloat32( colLen=1, rowLen=2, vecSize=3 ){
        const dt = new GLDataTexture( colLen, rowLen, vecSize );
        dt.type  = WebGL2RenderingContext.FLOAT;
        dt.data  = new Float32Array( vecSize * colLen * rowLen );

        switch( vecSize ){
            case 1:
                dt.internalFormat = WebGL2RenderingContext.R32F;
                dt.format         = WebGL2RenderingContext.RED;
                break;
            case 2:
                dt.internalFormat = WebGL2RenderingContext.RG32F;
                dt.format         = WebGL2RenderingContext.RG;
                break;
            case 3:
                dt.internalFormat = WebGL2RenderingContext.RGB32F;
                dt.format         = WebGL2RenderingContext.RGB;
                break;
            case 4:
                dt.internalFormat = WebGL2RenderingContext.RGBA32F;
                dt.format         = WebGL2RenderingContext.RGBA;
                break;
            default:
                console.error( 'GLDataTexture - UNKNOWN VEC SIZE' );
                break;
        }

        return dt;
    }

    static asUint8( colLen=1, rowLen=2, vecSize=1  ){
        const dt            = new GLDataTexture( colLen, rowLen, vecSize );
        dt.type             = WebGL2RenderingContext.UNSIGNED_BYTE;
        dt.data             = new Uint8Array( vecSize * colLen * rowLen );

        switch( vecSize ){
            case 1:
                dt.internalFormat = WebGL2RenderingContext.R8;
                dt.format         = WebGL2RenderingContext.RED;
                break;
            case 2:
                dt.internalFormat = WebGL2RenderingContext.RG8;
                dt.format         = WebGL2RenderingContext.RG;
                break;
            case 3:
                dt.internalFormat = WebGL2RenderingContext.RGB8;
                dt.format         = WebGL2RenderingContext.RGB;
                break;
            case 4:
                dt.internalFormat = WebGL2RenderingContext.RGBA8;
                dt.format         = WebGL2RenderingContext.RGBA;
                break;
            default:
                console.error( 'GLDataTexture - UNKNOWN VEC SIZE' );
                break;
        }

        return dt;
    }

    static asUint32( colLen=1, rowLen=2, vecSize=1  ){
        const dt = new GLDataTexture( colLen, rowLen, vecSize );
        dt.type  = WebGL2RenderingContext.UNSIGNED_INT;
        dt.data  = new Uint32Array( vecSize * colLen * rowLen );

        switch( vecSize ){
            case 1:
                dt.internalFormat = WebGL2RenderingContext.R32UI;
                dt.format         = WebGL2RenderingContext.RED_INTEGER;
                break;
            case 2:
                dt.internalFormat = WebGL2RenderingContext.RG32UI;
                dt.format         = WebGL2RenderingContext.RG_INTEGER;
                break;
            case 3:
                // https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html
                // NOTE: RGB32UI is marked as not color renderable, can not be bound to frame buffer
                dt.internalFormat = WebGL2RenderingContext.RGB32UI;
                dt.format         = WebGL2RenderingContext.RGB_INTEGER;
                break;
            case 4:
                dt.internalFormat = WebGL2RenderingContext.RGBA32UI;
                dt.format         = WebGL2RenderingContext.RGBA_INTEGER;
                break;
            default:
                console.error( 'GLDataTexture - UNKNOWN VEC SIZE' );
                break;
        }
        return dt;
    }
    // #endregion

    // #region STATIC READERS
    static readFloat32( dt ){
        const gl  = GLContext.ctx;
        const fbo = gl.createFramebuffer();;

        // Bind Texture as framebuffer color attachment
        gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dt.ref, 0 );

        // Read Data Out
        const results = new Float32Array( dt.colLen * dt.rowLen * 4 );
        gl.readPixels( 0, 0, dt.colLen, dt.rowLen, gl.RGBA, gl.FLOAT, results );

        // Return framebuffer back
        gl.bindFramebuffer( gl.FRAMEBUFFER, null );    
        gl.deleteFramebuffer( fbo ); 
        return results;
    }
    // #endregion

    // #region STATIC TRANSFERS
    static bufferTransfer( dt, buf ){
        const gl  = GLContext.ctx;

        // Bind input data & output texture
        gl.bindBuffer( gl.PIXEL_UNPACK_BUFFER, buf.ref );
        gl.bindTexture( gl.TEXTURE_2D, dt.ref );

        // Transfer
        gl.texSubImage2D( gl.TEXTURE_2D, 0, 0, 0, dt.colLen, dt.rowLen, dt.format, dt.type, 0 );

        // Cleanup
        gl.bindBuffer( gl.PIXEL_UNPACK_BUFFER, null );
    }
    // #endregion
}