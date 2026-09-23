// Developer release step. Never point a plugin marketplace at a working tree.
import {resolve} from 'node:path';
import {stagePlugin} from '../src/distribution.mjs';
import {packageRoot} from '../src/setup.mjs';
const destination=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!destination)throw Error('Use --out=/absolute/new/directory outside the repository');
const result=stagePlugin({source:packageRoot,destination:resolve(destination)});
console.log(JSON.stringify(result,null,2));
