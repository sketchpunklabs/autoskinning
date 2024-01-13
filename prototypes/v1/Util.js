// #region IMPORTS
import { GLTFLoader } from 'tp/GLTFLoader.js';
// #endregion

export default class Util{

    static gltfLoaderAsync( url ){
        return new Promise( ( resolve, reject )=>{
            const loader = new GLTFLoader();
            loader.load( url, resolve, null, reject );
        });
    }

    static byteSize( bytes ){
        const sizes = [ 'Bytes', 'KB', 'MB', 'GB', 'TB' ];
        if( bytes === 0 ) return 'n/a'

        const i = parseInt( Math.floor( Math.log(bytes) / Math.log(1024) ), 10 );
        return ( i === 0 )
            ? `${bytes} ${sizes[i]}`
            : `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}`;
    }

}