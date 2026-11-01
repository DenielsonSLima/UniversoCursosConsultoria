import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
const { QueryClient, QueryClientProvider }=createRequire(import.meta.url)('@tanstack/react-query');

const jsdomPath=process.env.LGPD_JSDOM_PATH;
const { JSDOM }=await import(jsdomPath
  ? pathToFileURL(resolve(jsdomPath,'lib/api.js')).href : 'jsdom');
const directory=fileURLToPath(new URL('./',import.meta.url));
const { outputFiles }=await build({
  entryPoints:[resolve(directory,'StartInternalConversationModal.tsx')],
  bundle:true,format:'cjs',platform:'node',write:false,packages:'external',
  plugins:[{name:'canonical-chat-directory',setup(builder){
    builder.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'chat-test'}));
    builder.onResolve({filter:/unified-support-selection$/},()=>({path:'selection',namespace:'chat-test'}));
    builder.onLoad({filter:/.*/,namespace:'chat-test'},({path})=>({contents:path==='supabase'
      ? 'export const supabase={rpc:(...args)=>globalThis.__lgpdChat.rpc(...args)};'
      : 'export const notifyUnifiedSupportStartClosed=()=>{};'}));
  }}],
});
const compiled={exports:{}};
new Function('require','module','exports',outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const Modal=compiled.exports.default;

test('modal seleciona somente categoria canônica do setor e elimina seleção negada após mudança de perfil',async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'});
  const previous=new Map();
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,
    HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const finance={id:'category-finance',nome:'Financeira',ativo:true};
  const secretaria={id:'category-secretaria',nome:'Secretaria',ativo:true};
  const general={id:null,nome:'Geral',ativo:true};
  let allowed=[secretaria],denyCategories=false;
  const calls=[],starts=[];
  globalThis.__lgpdChat={rpc:async(name)=>{
    calls.push(name);
    if(name==='comunicacao_categorias_internas_listar')return denyCategories
      ? {data:null,error:{message:'synthetic-denial'}} : {data:allowed,error:null};
    assert.equal(name,'comunicacao_contatos_internos_listar');
    return {data:[{id:'synthetic-student',nome:'Pessoa Sintética',tipo:'Aluno',status:'ATIVO',cidade:'Cidade Exemplo'}],error:null};
  }};
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const container=dom.window.document.getElementById('root');
  const root=createRoot(container);
  const settle=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  const refresh=async()=>{
    await act(async()=>{await client.invalidateQueries({queryKey:['comunicacao','start-internal-categories'],exact:true});});
    await settle();
  };
  const startButton=()=>[...container.querySelectorAll('button')].find(button=>button.textContent.trim()==='Iniciar atendimento');
  const select=()=>container.querySelector('select');
  const optionNames=()=>[...select().options].map(option=>option.textContent);
  try{
    await act(async()=>root.render(React.createElement(QueryClientProvider,{client},
      React.createElement(Modal,{open:true,categories:[finance,secretaria],onClose:()=>{},
        onStart:async(...args)=>{starts.push(args);}}))));
    await settle();
    assert.deepEqual(optionNames(),['Secretaria'],'categorias passadas pelo navegador não definem autorização');
    assert.equal(select().value,secretaria.id);
    assert.equal(startButton().disabled,false);
    await act(async()=>startButton().click());
    assert.equal(starts.length,1);assert.equal(starts[0][2],secretaria.id);
    assert.deepEqual(starts[0][0],{id:'synthetic-student',nome:'Pessoa Sintética',tipo:'Aluno',status:'ATIVO',cidade:'Cidade Exemplo'});
    assert.equal(container.querySelector('img'),null,'o diretório mínimo não solicita fotografias');

    allowed=[general,finance,secretaria];await refresh();
    assert.deepEqual(optionNames(),['Geral','Financeira','Secretaria']);
    await act(async()=>{
      select().value=finance.id;
      select().dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    });
    assert.equal(select().value,finance.id);

    allowed=[secretaria];await refresh();
    assert.deepEqual(optionNames(),['Secretaria']);
    assert.equal(select().value,secretaria.id,'seleção de Financeira não pode ficar retida no perfil Secretaria');
    await act(async()=>startButton().click());
    assert.equal(starts.at(-1)[2],secretaria.id);

    denyCategories=true;await refresh();
    assert.equal(startButton().disabled,true,'erro ao conferir permissão não usa categoria em cache');
    assert.equal(select().disabled,true);
    assert.match(container.textContent,/Não foi possível conferir os setores permitidos/);
    const before=starts.length;await act(async()=>startButton().click());assert.equal(starts.length,before);

    denyCategories=false;allowed=[];await refresh();
    assert.equal(startButton().disabled,true);assert.deepEqual(optionNames(),[]);
    assert.match(container.textContent,/Seu perfil não possui setor disponível/);
    assert.ok(calls.includes('comunicacao_categorias_internas_listar'));
  }finally{
    await act(async()=>root.unmount());client.clear();dom.window.close();delete globalThis.__lgpdChat;
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
