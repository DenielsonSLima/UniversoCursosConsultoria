import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

test('listing adapter sends canonical filter IDs and derives scoped course options', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'history-list-adapter-'));
  const state = { calls: [], result: {data:{items:[{id:'kept'}],total:21},error:null} };
  const curso = {id:'course-id',nome:'Curso fictício',modalidade:'TECNICO'};
  const data = {turmas:[{id:'class-a',nome:'Turma A',codigo:'A',curso_id:curso.id,curso},
    {id:'class-b',nome:'Turma B',codigo:'B',curso_id:curso.id,curso:[curso]}],usuarios_sistema:[]};
  globalThis.__historyListAdapter = {
    rpc: async (name,params)=>{state.calls.push({name,params});return state.result;},
    from: table=>{
      const query={select:()=>query,or:value=>{state.calls.push({table,scope:value});return query;},
        order:()=>query,then:resolve=>resolve({data:data[table],error:null})};
      return query;
    },
  };
  try{
    const out=join(folder,'adapter.mjs');
    await build({entryPoints:[resolve('modules/gestor/secretaria/historico-emissoes/historico-emissoes-list.service.ts')],
      outfile:out,bundle:true,platform:'node',format:'esm',plugins:[{name:'rpc-fixture',setup(p){
        p.onResolve({filter:/\/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
        p.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=globalThis.__historyListAdapter;'}));
      }}]});
    const {historicoEmissoesListService:service}=await import(pathToFileURL(out));
    const result=await service.loadEmissions({poloId:'polo-id',activeTab:'carteirinha',turmaId:'class-a',
      cursoId:'course-id',modalidade:'TECNICO',search:'  CIE-1,_%  ',page:3});
    assert.deepEqual(result,{emissions:[{id:'kept'}],total:21});
    assert.deepEqual(state.calls[0],{name:'search_secretaria_emissions_filtered_secure',params:{
      p_polo_id:'polo-id',p_documento:'carteirinha',p_turma_id:'class-a',p_modalidade:'TECNICO',
      p_curso_id:'course-id',p_search:'CIE-1,_%',p_offset:20,p_limit:10}});
    const filters=await service.loadFilters('polo-id');
    assert.deepEqual(filters.cursos,[curso]);assert.equal(filters.turmas.length,2);
    assert.equal(filters.turmas[1].cursoId,'course-id');
    assert.ok(state.calls.some(call=>call.scope==='polo_id.eq.polo-id,polo_id.is.null'));
    const failure=new Error('Falha de consulta sintética');state.result={data:null,error:failure};
    await assert.rejects(service.loadEmissions({poloId:'polo-id',activeTab:'todos',turmaId:'todos',search:'',page:1}),failure);
  }finally{delete globalThis.__historyListAdapter;await rm(folder,{recursive:true,force:true});}
});
