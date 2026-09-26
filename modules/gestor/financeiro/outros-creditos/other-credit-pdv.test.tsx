import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PdvForm } from './OtherCreditPdvModal';
import { findPdvPartners } from './PdvPartnerSearch';
import type { OutrosCreditosModel } from './useOutrosCreditos';

const partners = [
  { id: 'student', nome: 'João de Teste', cpf_cnpj: '00000000001', tipo: 'Aluno' },
  { id: 'company', nome: 'Empresa de Teste', cpf_cnpj: '00000000000002', tipo: 'PJ' },
  { id: 'invalid', nome: 'João Inválido', tipo: 'Desconhecido' },
];
const base = {
  partners, partnerId: '', value: '', dueDate: '', categories: [], description: '', categoryId: '',
  activePolo: { id: 'polo', nome: 'Unidade de teste' }, createMutation: { isPending: false },
  partnersLoading: false, partnersError: false,
  closeCreateModal() {}, validateAndSubmit() {}, setValue() {}, setDueDate() {},
  setDescription() {}, setCategoryId() {}, retryPartners() {}, setPartnerId() {}, setPartnerType() {},
};
const render = (changes = {}) => renderToStaticMarkup(<PdvForm model={{ ...base, ...changes } as unknown as OutrosCreditosModel} />);

test('busca unificada aceita aluno e empresa sem criar parceiro pelo texto digitado', () => {
  assert.deepEqual(findPdvPartners(partners, ''), []);
  assert.deepEqual(findPdvPartners(partners, 'j'), []);
  assert.deepEqual(findPdvPartners(partners, 'joao').map(p => p.id), ['student']);
  assert.deepEqual(findPdvPartners(partners, '00000000000002').map(p => p.id), ['company']);
  assert.deepEqual(findPdvPartners(partners, 'não cadastrado'), []);
});

test('PDV começa sem pagador, valor ou vencimento e bloqueia a geração', () => {
  const html = render();
  assert.match(html, /Aguardando seleção/);
  assert.match(html, /A definir/);
  assert.match(html, /name|Quem vai pagar/);
  assert.match(html, /<button[^>]+type="submit"[^>]+disabled=""/);
  assert.doesNotMatch(html, /João de Teste|Empresa de Teste|479\.030/);
});

test('geração exige cadastro selecionado, unidade, valor positivo e vencimento', () => {
  const complete = { partnerId: 'student', value: '3,00', dueDate: '2026-09-26' };
  assert.doesNotMatch(render(complete), /<button[^>]+type="submit"[^>]+disabled=""/);
  for (const changes of [{ partnerId: '' }, { value: '0' }, { dueDate: '' }, { activePolo: undefined }, { partnerId: 'não cadastrado' }]) {
    assert.match(render({ ...complete, ...changes }), /<button[^>]+type="submit"[^>]+disabled=""/);
  }
});

test('envio em andamento desabilita novo envio e edição do atendimento', () => {
  const html = render({ partnerId: 'company', value: '3,00', dueDate: '2026-09-26', createMutation: { isPending: true } });
  assert.match(html, /<fieldset[^>]+disabled=""/);
  assert.match(html, /<button[^>]+type="submit"[^>]+disabled=""/);
  assert.match(html, /Gerando cobrança/);
});
