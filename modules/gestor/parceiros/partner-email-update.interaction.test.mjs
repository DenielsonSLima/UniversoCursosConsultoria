import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
const { JSDOM } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_JSDOM_MODULE || 'tmp/lgpd-test-runtime/node_modules/jsdom/lib/api.js')).href);

test('teacher first-access correction stays editable until canonical save succeeds and double clicks cannot duplicate the operation', async () => {
  await mkdir('tmp', { recursive: true }); const temp = await mkdtemp(resolve('tmp/partner-email-form-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const output = resolve(temp, 'ui.mjs');
  const compiled = await build({ stdin: { contents: `export {default as Professor} from './modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados';
    export {default as Address} from './modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoAddressSection';`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: output,
    plugins: [{ name: 'no-live-service', setup(builder) {
      builder.onResolve({ filter: /parceiros\.service$/ }, () => ({ path: 'service', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const parceirosService={getPolos:async()=>[]};' }));
    } }] });
  await writeFile(output, compiled.outputFiles[0].contents); const { Professor, Address } = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client'); const root = createRoot(document.getElementById('root'));
  const data = { id: 'partner-1', tipo: 'Professor', nome: 'Professor sintético', email: 'old@example.invalid', authUserId: 'same-auth-user', primeiroAcessoInstitucionalPendente: true };
  const saves = []; let rejectSave;
  const change = value => { saves.push(value); return new Promise((_resolve, reject) => { rejectSave = reject; }); };
  const render = props => act(async () => root.render(React.createElement(Professor, { data, onChange: change, ...props })));
  const button = text => [...document.querySelectorAll('button')].find(value => value.textContent.trim() === text);
  try {
    await render({}); await act(async () => button('Editar').click());
    const email = document.querySelector('input[name="email"]'); assert.equal(email.readOnly, false);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(email, 'new@example.invalid');
      email.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const save = button('Salvar Alterações');
    await act(async () => { save.click(); save.click(); });
    assert.equal(saves.length, 1); assert.equal(saves[0].email, 'new@example.invalid');
    assert.equal(email.disabled, true); assert(button('Salvando…'));
    await act(async () => rejectSave(new Error('O e-mail já pertence a outra conta.')));
    assert.match(document.querySelector('[role="alert"]').textContent, /outra conta/);
    assert.equal(document.querySelector('input[name="email"]').value, 'new@example.invalid');
    await render({ data: { ...data, nome: 'Cadastro relido' } });
    assert.equal(document.querySelector('input[name="email"]').value, 'new@example.invalid', 'An error refresh must not overwrite the unsaved draft');
    await render({ key: 'active', data: { ...data, primeiroAcessoInstitucionalPendente: false } });
    await act(async () => button('Editar').click());
    assert.equal(document.querySelector('input[name="email"]').readOnly, true);
    assert(document.body.textContent.includes('acesso já existente'));
    const student = { ...data, tipo: 'Aluno', trocaSenhaObrigatoria: true, acessoStatus: 'pendente_senha', senhaAtualizadaEm: null };
    await act(async () => root.render(React.createElement(Address, { formData: student, isEditing: true, cepStatus: 'idle', onChange() {} })));
    assert(document.body.textContent.includes('primeiro acesso será corrigido'));
    await act(async () => root.render(React.createElement(Address, { formData: { ...student, acessoStatus: 'ativo', senhaAtualizadaEm: '2026-11-12' }, isEditing: true, cepStatus: 'idle', onChange() {} })));
    assert(document.body.textContent.includes('e-mail de acesso e a senha já existentes serão preservados'));
  } finally { await act(async () => root.unmount()); dom.window.close(); await rm(temp, { recursive: true, force: true }); }
});

test('the correction client binds the returned email and UID, preserves delivery-pending metadata and sends only the correction action', async () => {
  const temp = await mkdtemp(resolve('tmp/partner-email-client-')); const output = resolve(temp, 'service.mjs');
  const calls = [];
  const payload = { partnerId: 'partner-1', email: 'new@example.invalid', expectedEmail: 'old@example.invalid', expectedAuthUserId: 'same-user', expectedAuthEmail: 'old@example.invalid', requestId: 'request-1' };
  let result = { success: true, emailCorrected: true, loginEmailChanged: true, emailSent: false, deliveryPending: true, message: 'Envio pendente.', userId: 'same-user', email: 'new@example.invalid' };
  globalThis.__partnerEmailInvoke = async (name, options) => { calls.push({ name, body: options.body }); return { data: result, error: null }; };
  try {
    const compiled = await build({ entryPoints: [resolve('modules/gestor/parceiros/portal-activation.service.ts')], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', outfile: output,
      plugins: [{ name: 'no-live-client', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const supabase={functions:{invoke:(...args)=>globalThis.__partnerEmailInvoke(...args)}};' }));
      } }] });
    await writeFile(output, compiled.outputFiles[0].contents); const { portalActivationService } = await import(pathToFileURL(output).href);
    const response = await portalActivationService.correctPartnerEmail({ ...payload, action: 'delete-partner' });
    assert.equal(response.deliveryPending, true); assert.equal(response.emailSent, false);
    assert.deepEqual(calls[0], { name: 'portal-user-management', body: { ...payload, action: 'correct-partner-email' } });
    result = { ...result, userId: 'other-user' };
    await assert.rejects(portalActivationService.correctPartnerEmail(payload), /não foi confirmada/);
    result = { ...result, userId: 'same-user', email: 'other@example.invalid' };
    await assert.rejects(portalActivationService.correctPartnerEmail(payload), /não foi confirmada/);
  } finally { delete globalThis.__partnerEmailInvoke; await rm(temp, { recursive: true, force: true }); }
});
