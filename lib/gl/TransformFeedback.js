import GLBuffer from './GLBuffer.js';

export default class TransformFeedback{
    static ref = null;  // Reference to TransformFeedback GL Object

    static compute( renderer, sh, bufMap, exeCnt=0 ){        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Prepare
        const rend = renderer;
        const gl   = rend.getContext();

        this.preCompute( gl );
        this.loadShader( gl, sh );

        // const inputDrawCnt  = this.bindInputs( rend, gl, sh, bufMap );  

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Enable Feedback with fragment stage disabled
        gl.bindTransformFeedback( gl.TRANSFORM_FEEDBACK, this.ref );    // Bind TransformFeedback
        gl.enable( gl.RASTERIZER_DISCARD );                             // Disable fragment shader, its not needed

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Buffer Bindings
        // TODO: Finish working binding input buffers
        const inputDrawCnt  = this.bindInputs( rend, gl, sh, bufMap );  
        // const inputDrawCnt  = 0;
        const outputDrawCnt = this.bindOutputs( rend, gl, sh, bufMap );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Execute 
        const drawSize = ( exeCnt > 0 )? exeCnt : 
            ( inputDrawCnt > 0 )? inputDrawCnt : outputDrawCnt;

        console.log( "DrawSize", drawSize, "In", inputDrawCnt, 'Out', outputDrawCnt );

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
        let bRef;
        for( const [k,v] of Object.entries( sh.inputs ) ){
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // NOTE - This wouldn't work normally in THREEJS
            // renderer.attributes only exists in a MODIFIED library to expose GL BUFFER references

            console.log( 'Inputs', 'k', k, 'v', v, 'buf', bufMap[ k ] instanceof GLBuffer );

            const buf = bufMap[ k ];
            if( !buf ){ console.log( 'TransformFeedback.compute - Buffer not found : ', k ); continue; }

            if( buf instanceof GLBuffer ){
                // Raw GL buffer
                bRef = buf.ref;
                cnt  = buf.elementCount;
                console.log( 'isGLBuffer', buf, gl.UNSIGNED_INT, gl.ARRAY_BUFFER );
            }else{
                // ThreeJS Buffer, need to find GL reference in renderer's cache
                const atr = rend.attributes.get( buf );
                if( !atr ){ console.log( 'Attribute reference not found in 3js renderer', k ); continue; }
                bRef = atr.buffer;
                cnt  = buf.count; // Save draw size

                console.log( 'Is3JSBuffer', atr, cnt );
            }

            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            let dType;  // GL Data Type
            let cLen;   // Component Length
            switch( v.type ){
                case 'float' : dType = gl.FLOAT; cLen = 1; break;
                case 'vec2'  : dType = gl.FLOAT; cLen = 2; break;
                case 'vec3'  : dType = gl.FLOAT; cLen = 3; break;
                case 'vec4'  : dType = gl.FLOAT; cLen = 4; break;

                case 'uint'  : dType = gl.UNSIGNED_INT; cLen = 1; break;
                case 'uvec2' : dType = gl.UNSIGNED_INT; cLen = 2; break;
                case 'uvec3' : dType = gl.UNSIGNED_INT; cLen = 3; break;
                case 'uvec4' : dType = gl.UNSIGNED_INT; cLen = 4; break;
                default: console.log( 'TransformFeedback.bindInputs - Unknown type : ', v.type ); break;
            }

            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // Bind position gl buffer
            gl.bindBuffer( gl.ARRAY_BUFFER, bRef );

            // Setup attribute @ LOC
            // NOTE: WebGL 2 uses a diff pointer function to setup INTEGER buffers
            // This is because the other pointer will transform Int data to Float but will
            // crap out if the shader defines the attribute has a uint type
            switch( dType ){
                case gl.FLOAT        : gl.vertexAttribPointer(  v.loc, cLen, dType, false, 0, 0 ); break;
                case gl.UNSIGNED_INT : gl.vertexAttribIPointer( v.loc, cLen, dType, false, 0, 0 ); break;
                default              : console.log( 'TransformFeedback.bindInputs - Unknown dtype : ', dType ); break;
            }

            // Turn on Attribute slot
            gl.enableVertexAttribArray( v.loc );                        
        }

        return cnt;
    }

    // Bind Output Varyings to Buffers
    static bindOutputs( rend, gl, sh, bufMap ){
        let cnt = 0;
        let bRef;
        for( const [k,v] of Object.entries( sh.outputs ) ){

            console.log( 'Outputs', 'k', k, 'v', v, 'buf', bufMap[ k ] instanceof GLBuffer );

            // --------------------------------------------
            // Match output varying to buffer map
            const buf = bufMap[ k ];
            if( !buf ){ console.log( 'TransformFeedback.compute - Buffer not found in map : ', k ); continue; }

            if( buf instanceof GLBuffer ){
                // Raw GL buffer
                bRef = buf.ref;
                cnt  = buf.elementCount;
            }else{
                // ThreeJS Buffer, need to find GL reference in renderer's cache
                const atr = rend.attributes.get( buf );
                if( !atr ){ console.log( 'Attribute reference not found in 3js renderer', k ); continue; }
                bRef = atr.buffer;
                cnt  = buf.count; // / buf.itemSize;
            }

            // --------------------------------------------
            // Bind Buffer to varying location
            gl.bindBufferBase( gl.TRANSFORM_FEEDBACK_BUFFER, v.loc, bRef );            
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
        for( const [k,u] of Object.entries( sh.uniforms ) ){

            // ---------------------------------
            if( u.value === null ){
                console.log( 'TransformFeedback.loadShader - Uniform value is null : ',k,  u );
                continuel
            }

            // ---------------------------------
            switch( u.type ){
                case 'float'     : gl.uniform1f( u.loc, u.value ); break;
                case 'vec3'      : gl.uniform3fv( u.loc, u.value ); break;
                case 'int'       : gl.uniform1i( u.loc, u.value ); break;
                case 'ivec3'     : gl.uniform3iv( u.loc, u.value ); break;
                case 'uint'      : gl.uniform1ui( u.loc, u.value ); break;
                case 'isampler2D':
                case 'usampler2D':
                case 'sampler2D' : 
                    gl.uniform1i( u.loc, texSlot );             // Which slot for texture uniform to use
                    gl.activeTexture( gl.TEXTURE0 + texSlot );  // Activate Texture Slot
                    gl.bindTexture( gl.TEXTURE_2D, u.value );   // Bind Texture  
                    texSlot++; // Increment for next possible texture
                    // console.log( 'LoadTexture', texSlot );
                break;

                default: console.log( 'TransformFeedback.loadShader - Uniform type unknown : ', k, u.type ); break;
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