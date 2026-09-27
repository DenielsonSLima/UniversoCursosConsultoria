import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PdvForm } from './OtherCreditPdvModal';
import { findPdvPartners, maskPdvDocument } from './PdvPartnerSearch';
import { formatPdvCurrencyInput, parseCurrencyInput, today } from './outros-creditos.presentation';
import type { OutrosCreditosModel } from './useOutrosCreditos';

const partners = [
  { id: 'student', nome: 'João de Teste', cpf_cnpj: '00000000001', tipo: 'Aluno' },
  { id: 'company', nome: 'Empresa de Teste', cpf_cnpj: '00000000000002', tipo: 'PJ' },
  { id: 'invalid', nome: 'João Inválido', tipo: 'Desconhecido' },
];
const base = {
  partners, partnerId: '', value: '', dueDate: today(), categories: [], description: '', categoryId: '',
  activePolo: { id: 'polo', nome: 'Unidade de teste', cidade: 'Japoatã', estado: 'SE' }, createMutation: { isPending: false },
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

test('documento revela somente dois primeiros e três últimos dígitos', () => {
  assert.equal(maskPdvDocument('123.456.789-01'), 'CPF 12*.***.**9-01');
  assert.equal(maskPdvDocument('12.345.678/0001-90'), 'CNPJ 12.***.***/***1-90');
  for (const value of ['', undefined, 'Nome indevido', '123']) {
    assert.equal(maskPdvDocument(value), 'CPF/CNPJ não informado');
  }
  const html = render({ partnerId: 'student' });
  assert.match(html, /CPF 00\*\.\*{3}\.\*{2}0-01/);
  assert.match(html, /Japoatã\/SE/);
  assert.doesNotMatch(html, />Aluno</);
  assert.doesNotMatch(html, /00000000001|Cadastro selecionado/);
});

test('PDV começa com hoje, sem pagador ou valor e bloqueia a geração', () => {
  const html = render();
  assert.match(html, /Aguardando seleção/);
  assert.ok(html.includes(`value="${today()}"`));
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


test('valor formata centavos durante digitação, colagem e exclusão', () => {
  for (const [input, expected] of [['5', '0,05'], ['0,050', '0,50'], ['0,500', '5,00'], ['123456', '1.234,56'], ['R$ 1.234,56', '1.234,56'], ['1.234,5', '123,45'], ['', '']]) {
    assert.equal(formatPdvCurrencyInput(input), expected);
  }
  assert.equal(parseCurrencyInput(formatPdvCurrencyInput('123456')), 1234.56);
});

test('hoje usa data civil local e vencimento permanece editável', () => {
  const local = new Date(2026, 8, 26, 23, 30);
  assert.equal(today(local), '2026-09-26');
  const html = render({ dueDate: '2026-10-15' });
  assert.match(html, /type="date"[^>]+value="2026-10-15"/);
  assert.match(html, /aria-label="Adicionar categoria"/);
});
