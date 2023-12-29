import GLContext from './GLContext.js';

// WebGLRenderingContext.ARRAY_BUFFER
// WebGLRenderingContext.ELEMENT_ARRAY_BUFFER
// WebGLRenderingContext.UNIFORM_BUFFER

export default class GLBuffer{
    // #region MAIN
    ref         = null;                                 // GPU Reference
    type        = WebGL2RenderingContext.ARRAY_BUFFER;  // What Type of buffer is it
    dataType    = WebGL2RenderingContext.FLOAT;         // Data Type
    components  = 3;                                    // How many components, 3 If Vec3, etc
    compacity   = 0;                                    // Total byte size of buffer
    size        = 0;                                    // Currently used bytes
    isStatic    = true;                                 // WebGL2: Is the buffer going to be updated often

    constructor( comLen=3, dType=WebGL2RenderingContext.FLOAT, isStatic=true ){
        this.dataType   = dType
        this.components = comLen;
        this.isStatic   = isStatic;
    }

    dispose(){
        if( this.gRef ){
            GLContext.ctx.deleteBuffer( this.ref );
            this.gRef = null;
        }
    }
    // #endregion

    // #region METHODS
    set( data ){
        // TODO: Allow rewriting buffers or replacing with bigger ones
        if( !this.ref ){
            const result    = createBuffer( data, this.type, this.dataType, this.isStatic );
            this.ref        = result.gRef;
            this.compacity  = result.size;
            this.size       = result.size;
        }
        return this;
    }

    get elementCount(){
        let comByteSize = 0;

        switch( this.dataType ){
            case WebGL2RenderingContext.FLOAT:
            case WebGL2RenderingContext.UNSIGNED_INT:
                comByteSize = 4;
                break;
            default:
                console.log( 'GLBuffer.elementCount: dataType unknown - ', this.dataType );
                break;
        }

        return this.size / ( this.components * comByteSize );
    }
    // #endregion

    static asFloat32( colLen=3, isStatic=true ){
        return new GLBuffer( colLen, WebGL2RenderingContext.FLOAT, isStatic );
    }

    static asUint32( colLen=3, isStatic=true ){
        return new GLBuffer( colLen, WebGL2RenderingContext.UNSIGNED_INT, isStatic );
    }
}


function createBuffer( data, bufType=WebGL2RenderingContext.ARRAY_BUFFER, dataType=WebGL2RenderingContext.FLOAT, isStatic=true ){
    const gl = GLContext.ctx;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Is Data set or creating a blank buffer
    let content;
    if( ArrayBuffer.isView( data ) ){
        content = data;
    }else if( Array.isArray( data ) ){
        // Content MUST be a TypedArray, create one now
        switch( dataType ){
            case WebGL2RenderingContext.FLOAT : content = new Float32Array( data ); break;
            default:{
                console.log( 'UNKNOWN DATA TYPE FOR TypeARRAY CONVERSION' );
                break;
            }
        }
    } // }else if( Number.isInteger( data ) ){

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Create Buffer and push initial data if available
    const usage = ( isStatic )
        ? WebGL2RenderingContext.STATIC_DRAW
        : WebGL2RenderingContext.DYNAMIC_DRAW
    
    const obj = {
        gRef : gl.createBuffer(),
        size : ( content )? content.byteLength : data,
    }
    
    gl.bindBuffer( bufType, obj.gRef );     // Set it as active

    if( content )   gl.bufferData( bufType, content, usage );   // Fill Buffer
    else            gl.bufferData( bufType, data, usage );      // Empty Buffer

    gl.bindBuffer( bufType, null );         // Deactivate

    return obj;
}