import {stripTypeScriptTypes} from 'node:module';
import fs from 'node:fs';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw new Error('source and target required');
const original=fs.readFileSync(source,'utf8');
const compiled=stripTypeScriptTypes(original,{mode:'transform',sourceMap:false});
fs.writeFileSync(target,compiled,{flag:'wx',mode:0o644});
