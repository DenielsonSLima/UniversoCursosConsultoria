import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { useEmissionsListing } from './useEmissionsListing';
import EmissionsToolbar from './components/EmissionsToolbar';
import EmissionsTable from './components/EmissionsTable';

const requireTool = createRequire(resolve('package.json'));
const { JSDOM } = requireTool(process.env.HISTORY_JSDOM_PATH || 'jsdom');
const filters = {
  cursos: [{id:'radiologia',nome:'Radiologia',modalidade:'TECNICO'},
    {id:'enfermagem',nome:'Enfermagem',modalidade:'TECNICO'},
    {id:'historia',nome:'História',modalidade:'EAD'}],
  turmas: [{id:'radio-a',nome:'Radiologia A',codigo:'RA',cursoId:'radiologia',modalidade:'TECNICO'},
    {id:'radio-b',nome:'Radiologia B',codigo:'RB',cursoId:'radiologia',modalidade:'TECNICO'},
    {id:'enf-a',nome:'Enfermagem A',codigo:'EA',cursoId:'enfermagem',modalidade:'TECNICO'},
    {id:'hist-a',nome:'História A',codigo:'HA',cursoId:'historia',modalidade:'EAD'}],
  systemUsers: {},
};
const fixtureRows = Array.from({length:24},(_,index)=>({
  id:String(index),codigo:`CIE-${index}`,documento:'carteirinha',
  emitido_em:'2026-01-01',ultima_emissao_em:'2026-01-01',quantidade_emissoes:1,
  dados_emissao:{studentName:index%2?'ÉRICA ALUNA FICTÍCIA':'BIA ALUNA FICTÍCIA'},
}));

test('history responds to typing, combines selectors and discards stale results', async t => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost'});
  const globalNames = ['window','document','HTMLElement','HTMLInputElement','Node','Event',
    'MouseEvent','KeyboardEvent','MutationObserver','navigator','IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  globalNames.forEach(name=>Object.defineProperty(globalThis,name,{configurable:true,writable:true,
    value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]}));
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const state = {filters,requests:[] as any[],fail:false,pending:null as any,
    load:async(params:any)=>{
      state.requests.push(params);
      if(state.fail)throw new Error('Falha sintética');
      if(params.search==='atrasada')return new Promise(resolve=>{state.pending=resolve;});
      const rows = params.search ? fixtureRows.filter(row=>row.dados_emissao.studentName.includes('ÉRICA')):fixtureRows;
      return {emissions:rows.slice((params.page-1)*10,params.page*10),total:rows.length};
    }};
  (globalThis as any).__historyFilterTest=state;
  const { createRoot } = await import('react-dom/client');
  let listing:any;
  const errors:Error[]=[];
  function View(){listing=useEmissionsListing('polo-ficticio',error=>errors.push(error));
    return <><EmissionsToolbar {...listing.toolbarProps}/>
      {listing.error&&<p role="alert">{listing.error}</p>}
      <EmissionsTable {...listing.tableProps} onOpenPreview={()=>{}}/></>;}
  const root=createRoot(dom.window.document.getElementById('root')!);
  const input=(label:string)=>dom.window.document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const change=async(element:HTMLInputElement,text:string)=>{
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(element,text);
      element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  };
  const waitForSearch=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,340));});await act(async()=>{});};
  const open=async(label:string)=>{await act(async()=>{input(label).focus();input(label).click();});};
  const options=()=>Array.from(dom.window.document.querySelectorAll('[role="option"]')) as HTMLElement[];
  const choose=async(label:string,value:string)=>{await open(label);const option=options().find(node=>node.textContent===value);
    assert.ok(option,`Missing option ${value}`);await act(async()=>option.click());};
  const searchLabel='Buscar emissões por nome, CPF ou código';
  try{
    await act(async()=>root.render(<View/>));
    await t.test('typing alone applies a single debounced search and resets page',async()=>{
      await act(async()=>listing.tableProps.onPageChange(2));
      const before=state.requests.length;
      await change(input(searchLabel),'é');await change(input(searchLabel),'érica');
      assert.equal(state.requests.length,before);
      await waitForSearch();
      assert.equal(state.requests.length,before+1);assert.equal(state.requests.at(-1).search,'érica');
      assert.equal(state.requests.at(-1).page,1);
      assert.ok(dom.window.document.body.textContent.includes('ÉRICA ALUNA FICTÍCIA'));
      assert.ok(!dom.window.document.body.textContent.includes('BIA ALUNA FICTÍCIA'));
    });
    await t.test('selectors show permitted choices, search labels and combine IDs',async()=>{
      await choose('Filtrar emissões por modalidade','Técnico');
      await open('Filtrar emissões por curso');
      assert.deepEqual(options().map(node=>node.textContent),['Curso (todos)','Radiologia','Enfermagem']);
      await change(input('Filtrar emissões por curso'),'radio');
      assert.deepEqual(options().map(node=>node.textContent),['Radiologia']);
      await act(async()=>options()[0].click());
      await choose('Filtrar emissões por turma','Radiologia B (RB)');
      assert.deepEqual({...state.requests.at(-1)}, {activeTab:'todos',search:'érica',modalidade:'TECNICO',
        cursoId:'radiologia',turmaId:'radio-b',page:1,poloId:'polo-ficticio'});
      await act(async()=>listing.toolbarProps.onTabChange('carteirinha'));
      assert.equal(state.requests.at(-1).activeTab,'carteirinha');
      await choose('Filtrar emissões por modalidade','Educação a Distância (EAD)');
      assert.equal(state.requests.at(-1).cursoId,'todos');assert.equal(state.requests.at(-1).turmaId,'todos');
      await open('Filtrar emissões por curso');
      assert.deepEqual(options().map(node=>node.textContent),['Curso (todos)','História']);
      await act(async()=>input('Filtrar emissões por curso').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
      assert.equal(options().length,0);
      await open('Filtrar emissões por curso');
      await act(async()=>{const field=input('Filtrar emissões por curso');
        field.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));});
      await act(async()=>input('Filtrar emissões por curso').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
      assert.equal(options().length,0);
      assert.equal(dom.window.document.querySelectorAll('select,datalist').length,0);
    });
    await t.test('submit remains immediate and clearing restores the complete result',async()=>{
      await change(input(searchLabel),'nova');
      await act(async()=>dom.window.document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
      assert.equal(state.requests.at(-1).search,'nova');
      await waitForSearch();
      await change(input(searchLabel),'');await waitForSearch();
      assert.equal(listing.tableProps.totalRecords,24);
    });
    await t.test('older responses and failed filters cannot leave stale unfiltered rows',async()=>{
      await change(input(searchLabel),'atrasada');await waitForSearch();assert.ok(state.pending);
      await change(input(searchLabel),'érica');await waitForSearch();
      await act(async()=>state.pending({emissions:fixtureRows,total:999}));
      assert.equal(listing.tableProps.totalRecords,12);
      state.fail=true;await change(input(searchLabel),'falha');await waitForSearch();
      assert.equal(listing.tableProps.totalRecords,0);assert.equal(listing.tableProps.emissions.length,0);
      assert.ok(dom.window.document.querySelector('[role="alert"]'));assert.equal(errors.length,1);
    });
  }finally{
    await act(async()=>root.unmount());dom.window.close();
    previous.forEach((value,key)=>{if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);});
    delete (globalThis as any).__historyFilterTest;
  }
});
