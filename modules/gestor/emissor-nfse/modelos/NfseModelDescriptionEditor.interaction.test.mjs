import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act, useState } from 'react';
const { JSDOM } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE)).href);
const base = fileURLToPath(new URL('../../../../',import.meta.url));

test('description catalog inserts only known literal variables and clearly previews academic sources', async () => {
  const temp=await mkdtemp(resolve(base,'tmp/nfse-description-'));
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT:true});
  const { createRoot }=await import('react-dom/client');
  const bundle=resolve(temp,'test.mjs');
  const result=await build({stdin:{contents:`export {default as Editor} from './modules/gestor/emissor-nfse/modelos/NfseModelDescriptionEditor';
    export * from './modules/gestor/emissor-nfse/modelos/nfse-description-variables';
    export {parseNfseModelDescriptionPreview} from './modules/gestor/emissor-nfse/modelos/services/nfse-models.contract';`,
    resolveDir:base,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',jsx:'automatic',
    loader:{'.css':'empty'},outfile:bundle});
  await writeFile(bundle,result.outputFiles[0].contents);
  const {Editor,nfseAcademicDescriptionTemplate,nfseDescriptionVariables,insertNfseDescriptionVariable,
    parseNfseModelDescriptionPreview}=await import(pathToFileURL(bundle).href);
  const preview={hasText:true,pending:false,error:null,ready:true,retry(){},data:{
    description:'CURSO [curso da turma selecionada]; [matrícula vinculada ao recebimento]',
    monthLabel:'novembro de 2026',usesReferenceMonth:false,requiresAcademicContext:true}};
  let current='Texto selecionado';
  function Fixture({modelType = 'ALUNO'}){const[value,setValue]=useState(current);return React.createElement(Editor,{value,modelType,
    onChange:next=>{current=next;setValue(next);},preview});}
  const root=createRoot(document.getElementById('root'));
  const button=text=>[...document.querySelectorAll('button')].find(e=>e.textContent===text);
  try{
    await act(async()=>root.render(React.createElement(Fixture)));
    assert.equal(nfseDescriptionVariables.length,6);
    assert.equal(button('Inserir período do serviço'), undefined);
    assert(document.body.textContent.includes('Estrutura da descrição acadêmica'));
    assert(document.body.textContent.includes('os dados reais'));
    assert(!document.body.textContent.includes('CPF'));
    const textarea=document.querySelector('textarea'); textarea.setSelectionRange(6,17);
    await act(async()=>button('Inserir curso da turma').click());
    assert.equal(current,'Texto {{curso}}');
    await act(async()=>button('Usar descrição formal de cursos').click());
    assert.equal(current,nfseAcademicDescriptionTemplate);
    for(const token of ['{{curso}}','{{matricula}}','{{parcelas}}','{{meses_pagamento}}'])assert(current.includes(token));
    assert.equal(insertNfseDescriptionVariable('abc','{{cpf}}'),null);
    assert.equal(insertNfseDescriptionVariable('x'.repeat(1999),'{{curso}}'),null);
    await act(async()=>root.render(React.createElement(Fixture,{modelType:'SERVICO'})));
    assert.equal(button('Inserir curso da turma'),undefined);
    assert.equal(button('Usar descrição formal de cursos'),undefined);
    assert(button('Inserir período do serviço'));
    await act(async()=>button('Inserir período do serviço').click());
    assert(current.includes('{{periodo}}'));
    await act(async()=>root.render(React.createElement(Fixture,{modelType:'AMBOS'})));
    assert(button('Inserir curso da turma'));
    assert(button('Inserir período do serviço'));
    assert(document.body.textContent.includes('Somente ao emitir para alunos'));
    assert(document.body.textContent.includes('Somente ao emitir serviços'));
    assert(document.body.textContent.includes('prefira texto sem variáveis'));
    await act(async()=>root.render(React.createElement(Fixture,{modelType:null})));
    assert.equal(document.querySelectorAll('.nfse-description-insert').length,0);
    assert(document.body.textContent.includes('Selecione o tipo do modelo'));
    const parsed=parseNfseModelDescriptionPreview(preview.data);assert.equal(parsed.requiresAcademicContext,true);
    assert.throws(()=>parseNfseModelDescriptionPreview({...preview.data,requiresAcademicContext:'true'}));
  }finally{await act(async()=>root.unmount());dom.window.close();await rm(temp,{recursive:true,force:true});}
});
