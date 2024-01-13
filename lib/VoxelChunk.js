export default class VoxelChunk{
    // #region MAIN
    cells       = null;
    cellSize    = 0;        // Size size of a voxel
    count       = 0;        // Total Voxel Count
    xzCount     = 0;        // x cell cnt * z cell cnt
    minBound    = [0,0,0];
    maxBound    = [1,1,1];
    dimension   = [1,1,1];
    division    = 0;
    constructor(){}
    // #endregion

    // #region SETTERS
    // Try to subdivide dimension

    fitSize( size=[2,1,1], div=2, centered=true ){
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Found how many voxels can be fit in the size
        this.division     = div;
        this.cellSize     = Math.min( size[0] / div, size[1] / div, size[2] / div );
        this.dimension[0] = Math.ceil( size[0] / this.cellSize );
        this.dimension[1] = Math.ceil( size[1] / this.cellSize );
        this.dimension[2] = Math.ceil( size[2] / this.cellSize );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Counts
        this.xzCount = this.dimension[0] * this.dimension[2];
        this.count   = this.dimension[1] * this.xzCount;

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Bounding
        if( centered ){
            this.maxBound[0] = this.dimension[0] * this.cellSize * 0.5;
            this.maxBound[1] = this.dimension[1] * this.cellSize * 0.5;
            this.maxBound[2] = this.dimension[2] * this.cellSize * 0.5;
            this.minBound[0] = -this.maxBound[0];
            this.minBound[1] = -this.maxBound[1];
            this.minBound[2] = -this.maxBound[2];
        }else{
            this.minBound[0] = 0;
            this.minBound[1] = 0;
            this.minBound[2] = 0;
            this.maxBound[0] = this.dimension[0] * this.cellSize;
            this.maxBound[1] = this.dimension[1] * this.cellSize;
            this.maxBound[2] = this.dimension[2] * this.cellSize;
        }

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Buffer
        // this.cells = new Uint32Array( this.count );
        return this;
    }

    fitBound( min, max, div=2, scl=1 ){
        const size = [ ( max[0]-min[0] )*scl, ( max[1]-min[1] )*scl, ( max[2]-min[2] )*scl ];

        this.division     = div;
        this.cellSize     = Math.min( size[0] / div, size[1] / div, size[2] / div );
        this.dimension[0] = Math.ceil( size[0] / this.cellSize );
        this.dimension[1] = Math.ceil( size[1] / this.cellSize );
        this.dimension[2] = Math.ceil( size[2] / this.cellSize );

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Counts
        this.xzCount = this.dimension[0] * this.dimension[2];
        this.count   = this.dimension[1] * this.xzCount;

        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        size[0] = this.dimension[0] * this.cellSize;
        size[1] = this.dimension[1] * this.cellSize;
        size[2] = this.dimension[2] * this.cellSize;

        const offset = [
            ( min[0]*0.5 + max[0]*0.5 ) - size[0] * 0.5,
            ( min[1]*0.5 + max[1]*0.5 ) - size[1] * 0.5,
            ( min[2]*0.5 + max[2]*0.5 ) - size[2] * 0.5,
        ];

        this.minBound[0] = offset[0];
        this.minBound[1] = offset[1];
        this.minBound[2] = offset[2];
        this.maxBound[0] = size[0] + offset[0];
        this.maxBound[1] = size[1] + offset[1];
        this.maxBound[2] = size[2] + offset[2];
        
        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Buffer
        // this.cells = new Uint32Array( this.count );

        return this;
    }
    // #endregion

    // #region GETTERS
    // Get the cell min/max boundary from voxel coordinates
    coordBound( coord, minOut, maxOut ){
        minOut[0] = coord[0] * this.cellSize + this.minBound[0];
        minOut[1] = coord[1] * this.cellSize + this.minBound[1];
        minOut[2] = coord[2] * this.cellSize + this.minBound[2];
        maxOut[0] = (coord[0] + 1) * this.cellSize + this.minBound[0];
        maxOut[1] = (coord[1] + 1) * this.cellSize + this.minBound[1];
        maxOut[2] = (coord[2] + 1) * this.cellSize + this.minBound[2];
    }

    // Get the center point of a cell
    coordMidPoint( coord, out ){
        const h = this.cellSize * 0.5;
        out[0]  = coord[0] * this.cellSize + this.minBound[0] + h;
        out[1]  = coord[1] * this.cellSize + this.minBound[1] + h;
        out[2]  = coord[2] * this.cellSize + this.minBound[2] + h;
    }

    maxDimension(){ return Math.max( this.dimension[0], this.dimension[1], this.dimension[2] ); }

    maxDistance(){
        const x = this.maxBound[0] - this.minBound[0];
        const y = this.maxBound[1] - this.minBound[1];
        const z = this.maxBound[2] - this.minBound[2];
        return Math.sqrt( x*x + y*y + z*z );
    }
    // #endregion

    // #region COORDINATE
    // Using Voxel Coordinates, Gets the Cell Array Index
    coordIdx( coord ){
        // ( xLen * zLen * y ) + ( xLen * z ) + x
        return this.xzCount * coord[1] + this.dimension[ 0 ] * coord[2] + coord[0];
    }

    // Compute voxel coordinate from cell flat index
    idxCoord( i, out=[0,0,0] ){
        const y     = Math.floor( i / this.xzCount );       // How Many Y Levels Can We Get?
        const xz    = i - y * this.xzCount;                 // Subtract Y Levels from total, To get remaining Layer
        const z     = Math.floor( xz / this.dimension[0] ); // How many rows in the last layer can we get?
        out[0]      = xz - z * this.dimension[0];
        out[1]      = y;
        out[2]      = z;
        return out;
    }

    // Convert Worldspace Position to Voxel Coordinates
    posCoord( pos, out=[0,0,0] ){
        // out .fromSub( pos, this.minBound )  // Localize Postion in relation to Chunk's Starting position
        //     .divScale( this.cellSize )     // Divide  the Local Position by Voxel's Size.
        //     .floor();                       // Floor it to get final coordinate value.

        // coord = floor( ( pos - minBound ) / cellSize )
        out[0] = Math.floor( ( pos[0] - this.minBound[0] ) / this.cellSize );
        out[1] = Math.floor( ( pos[1] - this.minBound[1] ) / this.cellSize );
        out[2] = Math.floor( ( pos[2] - this.minBound[2] ) / this.cellSize );
        return out;
    }
    // #endregion
}