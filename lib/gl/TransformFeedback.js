export default class TransformFeedback{
    static ref = null;  // Reference to TransformFeedback GL Object

    static compute( renderer, sh, bufMap, exeCnt=0 ){        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Prepare
        const rend = renderer;
        const gl   = rend.getContext();

        this.preCompute( gl );
        this.loadShader( gl, sh );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Enable Feedback with fragment stage disabled
        gl.bindTransformFeedback( gl.TRANSFORM_FEEDBACK, this.ref );    // Bind TransformFeedback
        gl.enable( gl.RASTERIZER_DISCARD );                             // Disable fragment shader, its not needed

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Buffer Bindings
        // TODO: Finish working binding input buffers
        // const inputDrawCnt  = this.bindOutputs( rend, gl, sh, bufMap );  
        const inputDrawCnt  = 0;
        const outputDrawCnt = this.bindOutputs( rend, gl, sh, bufMap );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Execute 
        const drawSize = ( exeCnt > 0 )? exeCnt : 
            ( inputDrawCnt > 0 )? inputDrawCnt : outputDrawCnt;

        gl.beginTransformFeedback( gl.POINTS );
        gl.drawArrays( gl.POINTS, 0, drawSize );
        gl.endTransformFeedback();

        // // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.postCompute( gl );
    }

    // #region LOADERS + BINDERS
    // Bind Input Attributes to Buffers
    static bindInputs( rend, gl, sh, bufMap ){
        let cnt = 0;
        for( const [k,v] of Object.entries( sh.inputs ) ){
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // NOTE - This wouldn't work normally in THREEJS
            // renderer.attributes only exists in a MODIFIED library to expose GL BUFFER references
            const buf = bufMap[ k ];
            if( !buf ){ console.log( 'TransformFeedback.compute - Buffer not found : ', k ); continue; }

            const atr = rend.attributes.get( buf );
            if( !atr ){ console.log( 'Attribute reference not found in 3js renderer', k ); continue; }

            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            let dType;  // GL Data Type
            let cLen;   // Component Length
            switch( type ){
                case 'float' : dType = gl.FLOAT; cLen = 1; break;
                case 'vec2'  : dType = gl.FLOAT; cLen = 2; break;
                case 'vec3'  : dType = gl.FLOAT; cLen = 3; break;
                case 'vec4'  : dType = gl.FLOAT; cLen = 4; break;
                // case 'uint'     : bType = gl.FLOAT; bSize = 1; break;
                default: console.log( 'TransformFeedback.bindInputs - Unknown type : ', type ); break;
            }

            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // NOTE: May need to support interleaved data
            gl.bindBuffer( gl.ARRAY_BUFFER, atr.buffer );               // Bind position gl buffer
            gl.vertexAttribPointer( v.loc, cLen, dType, false, 0, 0 );  // Setup attribute @ LOC 
            gl.enableVertexAttribArray( v.loc );                        // Turn on Attribute slot

            // Save draw size
            cnt = buf.count / buf.itemSize;
        }

        return cnt;
    }

    // Bind Output Varyings to Buffers
    static bindOutputs( rend, gl, sh, bufMap ){
        let cnt = 0;
        for( const [k,v] of Object.entries( sh.outputs ) ){
            // --------------------------------------------
            // Get GL reference to buffer from 3JS Renderer
            const buf = bufMap[ k ];
            if( !buf ){ console.log( 'TransformFeedback.compute - Buffer not found : ', k ); continue; }

            const atr = rend.attributes.get( buf );
            if( !atr ){ console.log( 'Attribute reference not found in 3js renderer', k ); continue; }

            // --------------------------------------------
            // Bind Buffer to varying location
            gl.bindBufferBase( gl.TRANSFORM_FEEDBACK_BUFFER, v.loc, atr.buffer );

            // Save draw size
            cnt = buf.count; // / buf.itemSize;
        }

        return cnt;
    }
    
    static loadShader( gl, sh ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Turn on shader
        gl.useProgram( sh.prog );  

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Pass uniform data to shader
        let texSlot = 0;
        for( const u of Object.values( sh.uniforms ) ){

            // ---------------------------------
            if( u.value === null ){
                console.log( 'TransformFeedback.loadShader - Uniform value is null : ', u );
                continuel
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

                default: console.log( 'TransformFeedback.loadShader - Uniform type unknown : ', u.type ); break;
            }
        }
    }
    // #endregion

    // #region COMPUTE EVENTS
    static preCompute( gl ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Looks like 3JS leaves VAOs bound after rendering
        // This breaks buffer binding for transform feedback
        // SOOO... Make sure there are no VAO bound before running TF
        gl.bindVertexArray( null );

        // For extra protection, lets just unbind array buffers too
        // Doesn't seem needed but since VAO was an issue, lets do this too.
        gl.bindBuffer( gl.ARRAY_BUFFER, null );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( !this.ref ) this.ref = gl.createTransformFeedback();
    }

    static postCompute( gl ){
        gl.disable( gl.RASTERIZER_DISCARD );                        // Turn on fragment shaders
        gl.bindTransformFeedback( gl.TRANSFORM_FEEDBACK, null );    // Turn off Feedback
        gl.useProgram( null );                                      // Unbind Shader
        gl.bindBuffer( gl.ARRAY_BUFFER, null );                     // Unbind Buffers
        gl.bindTexture( gl.TEXTURE_2D, null );                      // Unbind Textures
    }
    // #endregion
}