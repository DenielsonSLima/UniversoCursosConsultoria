import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const compiled = await build({entryPoints:[fileURLToPath(new URL('./PJPolos.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',plugins:[{name:'service',setup(b){b.onResolve({filter:/parceiros\.service$/},()=>({path:'service',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const parceirosService={getPolos:()=>{}};'}));}}]});
const module={exports:{}};
const realRequire=createRequire(import.meta.url);
new Function('require','module','exports',compiled.outputFiles[0].text)((id)=>id==='@tanstack/react-query'?{useQuery:()=>({data:[{id:'a',nome:'Matriz'},{id:'b',nome:'Filial'}],isPending:false,isError:false})}:realRequire(id),module,module.exports);
const Component=module.exports.default;
function inputs(node){if(!node||typeof node!=='object')return[];return [...(node.type==='input'?[node]:[]), ...[node.props?.children].flat(Infinity).flatMap(inputs)];}
test('gestor global seleciona todos e mantém polo principal',()=>{let data={poloId:'a',poloIds:['a']};const tree=Component({data,isEditing:true,canManage:true,onChange:f=>data=f(data)});const controls=inputs(tree);assert.equal(controls.length,3);controls[0].props.onChange({target:{checked:true}});assert.deepEqual(data,{poloId:'a',poloIds:['a','b']});});
test('gestor sem acesso global não recebe controles de ampliar polos',()=>{const tree=Component({data:{poloId:'a',poloIds:['a']},isEditing:true,canManage:false,onChange:()=>{throw Error('unexpected');}});assert.equal(inputs(tree).length,0);});
test('não permite remover único polo',()=>{const controls=inputs(Component({data:{poloId:'a',poloIds:['a']},isEditing:true,canManage:true,onChange:()=>{}}));assert.equal(controls[1].props.disabled,true);});
