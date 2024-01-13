export default class GLContext{
    static ctx          = null;
    static maxTexSize   = 0;

    static init( ctx ){
        this.ctx        = ctx;
        this.maxTexSize = ctx.getParameter( WebGL2RenderingContext.MAX_TEXTURE_SIZE )
    }
}