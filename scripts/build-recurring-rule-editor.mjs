import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../web/recurring-rule-editor/', import.meta.url);
const [model, ui, css, template] = await Promise.all(['model.mjs','ui.mjs','style.css','index.template.html'].map(p=>readFile(new URL(p,root),'utf8')));
const imports = ui.split('\n')[0];
if (!imports.startsWith('import { ') || !imports.endsWith(" } from './model.mjs';")) throw new Error('Unexpected UI dependency.');
if (/^\s*import /m.test(model) || (model.match(/^export (?:const|function) /gm)||[]).length !== 9) throw new Error('Unexpected model module boundary.');
const script = "(()=>{\n'use strict';\n" + model.replace(/^export (?=const |function )/gm,'') + '\n' + ui.slice(imports.length + 1) + '\n})();\n';
if (/<\/script/i.test(script) || /<\/style/i.test(css)) throw new Error('Unexpected HTML boundary in own source.');
const digest = text => createHash('sha256').update(text).digest('base64');
const substitutions={'@@SCRIPT_HASH@@':digest(script),'@@STYLE_HASH@@':digest(css),'@@STYLE@@':css,'@@SCRIPT@@':script};
let output=template;
for(const [marker,value] of Object.entries(substitutions)){
 if(output.split(marker).length!==2)throw new Error('Expected one '+marker);
 output=output.replace(marker,()=>value);
}
if(/@@[A-Z_]+@@/.test(output))throw new Error('Unresolved template marker.');
const target=new URL('index.html',root);
if(process.argv.length>3 || process.argv[2] && process.argv[2]!=='--check')throw new Error('Use no argument or --check.');
if(process.argv[2]==='--check'){
 if(await readFile(target,'utf8')!==output)throw new Error('Generated editor does not match sources.');
 process.stdout.write('Standalone editor matches all source bytes.\n');
}else{
 await writeFile(target,output,'utf8');process.stdout.write('Built standalone recurring-rule editor.\n');
}
