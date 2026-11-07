import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { act, useState } from 'react';
import type { Root } from 'react-dom/client';
import UserAccessSections from './UserAccessSections';
import type { NovoUsuarioFormData } from '../usuarios.types';
import type { PerfilAcesso } from '../../perfis-acesso/perfis-acesso.service';
import { SitePublicoMultiSelect } from '../../site-publico/SitePublicoMultiSelect';
import { DEFAULT_GESTAO_TURMA_TABS } from '../../../access-control';
import ModalExcluirPolo from '../../polos/components/ModalExcluirPolo';
import ModalInativarPolo from '../../polos/components/ModalInativarPolo';

const requireForTest = createRequire(resolve(process.cwd(), 'package.json'));
const { JSDOM } = requireForTest(process.env.CONFIG_JSDOM_PATH || process.env.INSTITUTIONAL_SELECT_JSDOM_PATH || 'jsdom');
const noop = () => {};
const profiles: PerfilAcesso[] = [{ id: 'profile-demo', nome: 'Perfil de demonstração',
  permissoes: { modules: ['inicio','gestao','financeiro'], allPolos: true, poloIds: [],
    tabs: { financeiro: ['resumo'] }, communicationScope: { sector: 'secretaria', poloId: null, canViewAll: true } },
  restricao_horario: { ativo: false, dias: [1], horario_inicio: '08:00', horario_fim: '18:00' } }];
const initial = (): NovoUsuarioFormData => ({
 nome: '', sobrenome: '', cpf: '', dataNascimento: '', telefone: '', email: '', todosPolos: false,
 polosAcesso: ['local-polo'], permissoes: ['inicio'], financeiroAbas: [], abasModulos: {},
 perfil_acesso_id: null, personalizarPermissoes: true, personalizarHorario: true,
 horarioAtivo: false, diasHorario: [1,2,3,4,5], horarioInicio:'08:00', horarioFim:'18:00',
 setorComunicacao: 'todos', poloComunicacaoId: 'local-polo', podeVisualizarTodosPolos: false,
 podeVisualizarTodosSetores: false,
});
class TestMessageChannel {
 port1 = { onmessage: null as null | ((event: { data: undefined }) => void) };
 port2 = { postMessage: () => globalThis.queueMicrotask(() => this.port1.onmessage?.({ data: undefined })) };
}

test('seletores de configuração preservam herança de acesso e multisseleção canônica', async context => {
 const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost'});
 const globals=['window','document','HTMLElement','HTMLInputElement','Node','Event','MouseEvent','KeyboardEvent','MutationObserver','MessageChannel','navigator','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 globals.forEach(key=>Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MessageChannel'?TestMessageChannel:dom.window[key]}));
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const {createRoot}=await import('react-dom/client');let root:Root|undefined;
 let data=initial();let multiple:string[]=[];
 function Access({scope}:{scope:string}){
  const [value,setValue]=useState(initial);data=value;
  return <UserAccessSections contextId={scope} formData={value} perfis={profiles}
   selectedPerfil={profiles.find(profile=>profile.id===value.perfil_acesso_id)} companies={[]}
   setFormData={setValue} onTogglePermission={noop} onToggleFinanceiroTab={noop} onToggleModuleTab={noop} onToggleScheduleDay={noop}/>;
 }
 function Multi(){const [value,setValue]=useState<string[]>([]);multiple=value;return <SitePublicoMultiSelect value={value} onChange={setValue} ariaLabel="Cursos permitidos" options={[{value:'a-id',label:'Administração'},{value:'b-id',label:'Básico'},{value:'c-id',label:'Curso'}]}/>;}
 const mount=async(node:React.ReactNode)=>{if(root)await act(async()=>root?.unmount());dom.window.document.body.innerHTML='<div id="root"></div>';root=createRoot(dom.window.document.getElementById('root')!);await act(async()=>root?.render(node));};
 const selectProfile=async()=>{
  const input=dom.window.document.querySelector('input[aria-label="Perfil de acesso"]') as HTMLInputElement;
  await act(async()=>input.focus());
  const option=Array.from(dom.window.document.querySelectorAll('[role="option"]')).find((element:any)=>element.textContent==='Perfil de demonstração') as HTMLElement;
  assert.ok(option);await act(async()=>option.click());
 };
 try{
  await context.test('perfil global mantém módulos, abas normalizadas e escopo de comunicação',async()=>{
   await mount(<Access scope="global"/>);await selectProfile();
   assert.equal(data.perfil_acesso_id,'profile-demo');assert.deepEqual(data.permissoes,['inicio','gestao','financeiro']);
   assert.deepEqual(data.financeiroAbas,['resumo']);assert.deepEqual(data.abasModulos.gestao,DEFAULT_GESTAO_TURMA_TABS);
   assert.equal(data.todosPolos,true);assert.deepEqual(data.polosAcesso,[]);
   assert.equal(data.personalizarPermissoes,false);assert.equal(data.personalizarHorario,false);
   assert.equal(data.setorComunicacao,'secretaria');assert.equal(data.poloComunicacaoId,null);
   assert.equal(data.podeVisualizarTodosPolos,true);assert.equal(data.podeVisualizarTodosSetores,true);
  });
  await context.test('herança de perfil não transforma contexto de polo em acesso global',async()=>{
   await mount(<Access scope="local-polo"/>);await selectProfile();
   assert.equal(data.todosPolos,false);assert.deepEqual(data.polosAcesso,['local-polo']);
   assert.equal(data.perfil_acesso_id,'profile-demo');
  });
  await context.test('busca múltipla mantém IDs, ordenação das opções e seleção fora do filtro',async()=>{
   await mount(<Multi/>);
   const box=(label:string)=>(Array.from(dom.window.document.querySelectorAll('label')).find((element:any)=>element.textContent===label) as HTMLElement | undefined)?.querySelector('input') as HTMLInputElement;
   await act(async()=>box('Básico').click());await act(async()=>box('Administração').click());
   assert.deepEqual(multiple,['a-id','b-id']);
   const input=dom.window.document.querySelector('input[type="search"]') as HTMLInputElement;
   await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'basico');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
   assert.equal(dom.window.document.querySelectorAll('input[type="checkbox"]').length,1);
   await act(async()=>box('Básico').click());assert.deepEqual(multiple,['a-id']);
   assert.equal(dom.window.document.querySelectorAll('select,datalist').length,0);
  });
  await context.test('confirmações de polo usam portal, título acessível e fechamento sem confirmar',async()=>{
   for(const variant of ['delete','status']){
    let closed=0,confirmed=0;
    function Confirm(){const [open,setOpen]=useState(true);const close=()=>{closed++;setOpen(false);};
     return variant==='delete'?<ModalExcluirPolo isOpen={open} onClose={close} onConfirm={()=>{confirmed++;}} poloNome="Polo sintético"/>
      :<ModalInativarPolo isOpen={open} onClose={close} onConfirm={()=>{confirmed++;}} poloNome="Polo sintético" statusAtual="ativo"/>;
    }
    await mount(<Confirm/>);
    const dialog=dom.window.document.querySelector('[role="dialog"]')!;assert.ok(dialog);
    assert.equal(dialog.getAttribute('aria-modal'),'true');
    assert.ok(dom.window.document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent);
    assert.equal(dom.window.document.getElementById('root')!.contains(dialog),false);
    await act(async()=>(dom.window.document.querySelector('[aria-label="Fechar confirmação do polo"]') as HTMLElement).click());
    assert.equal(closed,1);assert.equal(confirmed,0);assert.equal(dom.window.document.querySelector('[role="dialog"]'),null);
   }
  });
 }finally{if(root)await act(async()=>root?.unmount());dom.window.close();previous.forEach((descriptor,key)=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});}
});
