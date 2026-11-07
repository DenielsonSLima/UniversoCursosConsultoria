import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';
import React,{act} from 'react';
const require=createRequire(import.meta.url);
const jsdomPath=process.env.LGPD_JSDOM_PATH;
const {JSDOM}=await import(jsdomPath?pathToFileURL(resolve(jsdomPath,'lib/api.js')).href:'jsdom');
const directory=fileURLToPath(new URL('./',import.meta.url));
const {outputFiles}=await build({entryPoints:[resolve(directory,'PartnerCardAvatar.tsx')],bundle:true,format:'cjs',platform:'node',write:false,packages:'external'});
const compiled={exports:{}};
new Function('require','module','exports',outputFiles[0].text)(require,compiled,compiled.exports);
const Avatar=compiled.exports.default;

test('avatar local não revela pintura parcial e reinicia a foto ao trocar src',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'});
 const previous=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 const {createRoot}=await import('react-dom/client');
 const host=dom.window.document.getElementById('root'),root=createRoot(host);
 const render=src=>act(async()=>root.render(React.createElement(Avatar,{src,name:'Alice Sintética',className:'fixture-avatar'})));
 const state=()=>host.querySelector('[data-photo-state]');
 const image=()=>host.querySelector('img');
 const load=async(element,complete,width)=>{
  Object.defineProperty(element,'complete',{configurable:true,value:complete});
  Object.defineProperty(element,'naturalWidth',{configurable:true,value:width});
  Object.defineProperty(element,'naturalHeight',{configurable:true,value:width});
  await act(async()=>element.dispatchEvent(new dom.window.Event('load')));
 };
 try{
  await render(null);
  assert.equal(image(),null);assert.equal(state().getAttribute('data-photo-state'),'initials');assert.equal(state().textContent,'AS');
  assert.equal(state().getAttribute('aria-label'),'Alice Sintética');assert.equal(state().getAttribute('role'),'img');
  await render('https://synthetic.invalid/photo-a');
  const first=image();
  assert.equal(first.getAttribute('src'),'https://synthetic.invalid/photo-a');
  assert.equal(first.getAttribute('width'),'40');assert.equal(first.getAttribute('height'),'40');
  assert.equal(first.getAttribute('loading'),'lazy');assert.equal(first.getAttribute('decoding'),'async');
  assert.equal(first.style.opacity,'0');assert.equal(state().textContent,'AS');
  await load(first,false,80);assert.equal(first.style.opacity,'0','evento parcial não revela imagem');
  await load(first,true,0);assert.equal(first.style.opacity,'0','imagem inválida não revela alttext quebrado');
  await load(first,true,80);assert.equal(first.style.opacity,'1');assert.equal(state().getAttribute('data-photo-state'),'loaded');
  await render('https://synthetic.invalid/photo-b');
  const second=image();assert.notEqual(second,first);assert.equal(second.style.opacity,'0');assert.equal(state().getAttribute('data-photo-state'),'loading');
  await load(first,true,80);assert.equal(second.style.opacity,'0','load antigo não revela o novo src');
  await act(async()=>second.dispatchEvent(new dom.window.Event('error')));
  assert.equal(image(),null);assert.equal(state().getAttribute('data-photo-state'),'error');assert.equal(state().textContent,'AS');
  assert.doesNotMatch(host.innerHTML,/ui-avatars\.com|name=/);
  await render('https://synthetic.invalid/photo-c');assert.equal(state().getAttribute('data-photo-state'),'loading');assert.equal(image().style.opacity,'0');
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});

test('recuperação ocorre uma vez por src; resposta antiga não troca foto nova e segundo erro fica local',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid'});
 const previous=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 const {createRoot}=await import('react-dom/client');
 const host=dom.window.document.getElementById('root'),root=createRoot(host),calls=[],pending=new Map();
 const recover=src=>{calls.push(src);return new Promise(resolve=>pending.set(src,resolve));};
 const render=src=>act(async()=>root.render(React.createElement(Avatar,{src,name:'Alice Sintética',onPhotoError:recover})));
 const image=()=>host.querySelector('img');
 const fail=element=>act(async()=>element.dispatchEvent(new dom.window.Event('error')));
 try{
  const a='https://synthetic.invalid/signed-a',b='https://synthetic.invalid/signed-b';
  await render(a);const first=image();await fail(first);await fail(first);
  assert.deepEqual(calls,[a],'erros repetidos durante pending não criam outra tentativa');
  await render(b);const second=image();assert.equal(second.style.opacity,'0');
  await act(async()=>pending.get(a)('https://synthetic.invalid/renewed-a'));
  assert.equal(image(),second);assert.equal(image().getAttribute('src'),b,'resultado antigo não revela outra foto');
  await fail(second);assert.deepEqual(calls,[a,b]);
  await act(async()=>pending.get(b)('https://synthetic.invalid/renewed-b'));
  const renewed=image();assert.notEqual(renewed,second);assert.equal(renewed.getAttribute('src'),'https://synthetic.invalid/renewed-b');assert.equal(renewed.style.opacity,'0');
  for(const[key,value]of Object.entries({complete:true,naturalWidth:100,naturalHeight:100}))Object.defineProperty(renewed,key,{configurable:true,value});
  await act(async()=>renewed.dispatchEvent(new dom.window.Event('load')));assert.equal(renewed.style.opacity,'1');
  await fail(renewed);assert.deepEqual(calls,[a,b],'a URL recuperada não recebe segunda tentativa');assert.equal(image(),null);assert.equal(host.textContent,'AS');
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});
