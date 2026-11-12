import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const component = resolve('modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoFinanceiro.tsx');
const compiled = await build({
  stdin: { contents: `export {default as Finance} from ${JSON.stringify(component)}; export {loadStudentFinanceView,loadExistingBoletoPdf} from './modules/gestor/parceiros/components/viewparceiros/aluno/parceiro-aluno-financeiro.service';`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
  plugins: [{ name: 'synthetic-finance', setup(plugin) {
    plugin.onResolve({filter:/lib\/supabase$/}, () => ({path:'supabase',namespace:'fake'}));
    plugin.onResolve({filter:/^@tanstack\/react-query$/}, () => ({path:'query',namespace:'fake'}));
    plugin.onLoad({filter:/.*/,namespace:'fake'}, ({path}) => ({loader:'js',contents: path==='supabase'
      ? 'export const supabase={rpc:(...args)=>globalThis.fixture.rpc(...args),functions:{invoke:(...args)=>globalThis.fixture.invoke(...args)}};'
      : 'export const useQuery=options=>{globalThis.fixture.options=options;return globalThis.fixture.query;};'}));
  }}],
});
const module = {exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {Finance,loadStudentFinanceView,loadExistingBoletoPdf}=module.exports;
const item = {id:'r1',matricula_id:'m1',descricao:'Matrícula EAD',valor:119.90,status:'PENDENTE',tipo_lancamento:'MATRICULA',can_open_boleto:true,matriculas:{id:'m1',status:'PENDENTE'},turmas:{nome:'Turma EAD',codigo:'EAD-1',cursos:{nome:'Curso sintético'},polos:{nome:'Polo'}}};
function fixture(data={items:[item],summary:{paid:10,open:119.90,suspended:0}}) {
  globalThis.fixture={ query:{data,isLoading:false,isError:false,refetch(){}},rpc:async()=>({data,error:null}),invoke:async()=>({data:new Blob(['pdf'],{type:'application/pdf'}),error:null}) };
}
const render=()=>renderToStaticMarkup(React.createElement(Finance,{alunoId:'a1',cacheScope:'user:context:polo'}));
test('exibe Abrir somente por capacidade do backend e totais canônicos',()=>{
  fixture();const html=render();assert.match(html,/Abrir boleto em nova aba/);assert.match(html,/119,90/);assert.match(html,/10,00/);
  fixture({items:[{...item,can_open_boleto:false}],summary:{paid:0,open:0,suspended:0}});
  assert.doesNotMatch(render(),/Abrir boleto em nova aba/);
});
test('query isolada por aluno/usuário/polo e sem cache reutilizável',()=>{
  fixture();render();assert.deepEqual(globalThis.fixture.options.queryKey,['financeiro-aluno-receivables','a1','user:context:polo']);
  assert.equal(globalThis.fixture.options.gcTime,0);assert.equal(globalThis.fixture.options.staleTime,0);
});
test('erro não apresenta totais zerados como sucesso',()=>{
  fixture();globalThis.fixture.query.isError=true;const html=render();assert.match(html,/Os totais estão indisponíveis/);assert.doesNotMatch(html,/Total pago/);
});
test('consulta usa RPC mínima e valida formato antes de renderizar',async()=>{
  fixture();let call;globalThis.fixture.rpc=async(...args)=>{call=args;return {data:{items:[],summary:{paid:0,open:0,suspended:0}},error:null};};
  await loadStudentFinanceView('a1');assert.deepEqual(call,['parceiro_aluno_financeiro_visualizacao',{p_aluno_id:'a1'}]);
  globalThis.fixture.rpc=async()=>({data:{},error:null});await assert.rejects(loadStudentFinanceView('a1'),/inválida/);
});
test('PDF usa apenas endpoint de leitura com AbortSignal e rejeita resposta não PDF',async()=>{
  fixture();let call;const signal=new AbortController().signal;
  globalThis.fixture.invoke=async(...args)=>{call=args;return {data:new Blob(['pdf'],{type:'application/pdf'}),error:null};};
  await loadExistingBoletoPdf('r1',signal);assert.deepEqual(call,['banese-boleto-document',{body:{receivableId:'r1'},signal}]);
  globalThis.fixture.invoke=async()=>({data:new Blob(['html'],{type:'text/html'}),error:null});
  await assert.rejects(loadExistingBoletoPdf('r1',signal),/PDF válido/);
});
